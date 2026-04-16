// ============================================================
// 一木 YiMu — 跨模块事件总线
// 这是6个模块之间的"神经网络"，竞品抄单个模块容易，抄这条总线极难
// ============================================================

import { prisma } from './prisma';
import {
  PROJECT_STATE_MACHINE,
  PAYMENT_SPLIT_RULES,
  REMINDER_ESCALATION_RULES,
  TAX_RULES_2026,
  SCHEDULING_RULES,
  calculateDueDate,
  guessCategory,
} from './rules';

// ═══ 事件类型定义 ═══

type EventPayload = {
  'quote.accepted': { quoteId: string; userId: string };
  'quote.rejected': { quoteId: string; userId: string; reason?: string };
  'project.status_changed': { projectId: string; userId: string; from: string; to: string };
  'project.created': { projectId: string; userId: string };
  'payment.overdue': { paymentNodeId: string; userId: string; overdueDays: number };
  'payment.received': { paymentNodeId: string; userId: string; amount: number };
  'payment.reminder_sent': { paymentNodeId: string; level: number };
  'transaction.created': { transactionId: string; userId: string; type: string; amount: number };
  'month.end': { userId: string; month: string };
  'daily.check': { userId: string };
};

type EventHandler<T extends keyof EventPayload> = (payload: EventPayload[T]) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers: { [K in keyof EventPayload]?: EventHandler<any>[] } = {};

export function on<T extends keyof EventPayload>(event: T, handler: EventHandler<T>) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event]!.push(handler);
}

export async function emit<T extends keyof EventPayload>(event: T, payload: EventPayload[T]) {
  const eventHandlers = handlers[event];
  if (!eventHandlers) return;

  // 并行执行所有处理器，单个失败不影响其他
  await Promise.allSettled(
    eventHandlers.map(handler => handler(payload).catch(err => {
      console.error(`[EVENT_BUS] Handler failed for ${event}:`, err);
    }))
  );
}


// ═══════════════════════════════════════
// 注册所有事件处理器
// ═══════════════════════════════════════

// ── 报价被接受 → 自动创建项目 + 收款节点 ──
on('quote.accepted', async ({ quoteId, userId }) => {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { client: true },
  });
  if (!quote) return;

  // 如果已经关联项目，仅推进状态
  if (quote.projectId) {
    const existingProject = await prisma.project.findUnique({ where: { id: quote.projectId } });
    if (existingProject && existingProject.status === 'quoted') {
      await prisma.project.update({
        where: { id: quote.projectId },
        data: { status: 'quoted', totalAmount: quote.total },
      });
    }
    return;
  }

  // 自动创建项目
  const project = await prisma.project.create({
    data: {
      userId,
      clientId: quote.clientId,
      name: quote.title,
      status: 'in_progress',
      totalAmount: quote.total,
      category: guessCategory(quote.items as { name: string }[]),
      startDate: new Date(),
    },
  });

  // 关联报价单到项目
  await prisma.quote.update({ where: { id: quoteId }, data: { projectId: project.id } });

  // 自动拆分收款节点
  const rule = PAYMENT_SPLIT_RULES.getPlan(quote.total);
  const splits = PAYMENT_SPLIT_RULES.creditAdjustment('normal', rule.splits);

  for (const split of splits) {
    await prisma.paymentNode.create({
      data: {
        userId,
        projectId: project.id,
        clientId: quote.clientId,
        name: split.label,
        amount: Math.round(quote.total * split.percent / 100),
        dueDate: calculateDueDate(split.trigger, project.startDate),
        status: 'pending',
      },
    });
  }

  // 更新客户项目数
  await prisma.client.update({
    where: { id: quote.clientId },
    data: { projectCount: { increment: 1 } },
  });
});


// ── 项目状态变更 → 执行副作用 ──
on('project.status_changed', async ({ projectId, userId, from, to }) => {
  const sideEffects = PROJECT_STATE_MACHINE.getSideEffects(from, to);

  for (const effect of sideEffects) {
    try {
      switch (effect) {
        case 'triggerFinalPayment': {
          const lastNode = await prisma.paymentNode.findFirst({
            where: { projectId, status: 'pending' },
            orderBy: { dueDate: 'desc' },
          });
          if (lastNode) {
            await prisma.paymentNode.update({
              where: { id: lastNode.id },
              data: { dueDate: new Date(new Date().setHours(23, 59, 59, 999)) },
            });
          }
          break;
        }

        case 'updateClientTotalRevenue': {
          const project = await prisma.project.findUnique({ where: { id: projectId } });
          if (project) {
            await prisma.client.update({
              where: { id: project.clientId },
              data: { totalRevenue: { increment: project.paidAmount } },
            });
          }
          break;
        }

        case 'incrementRevisionCount': {
          await prisma.project.update({
            where: { id: projectId },
            data: { revisionCount: { increment: 1 } },
          });
          break;
        }

        case 'cancelPendingPayments': {
          await prisma.paymentNode.updateMany({
            where: { projectId, status: { in: ['pending', 'reminded'] } },
            data: { status: 'cancelled' },
          });
          break;
        }

        case 'setProjectStartDate': {
          await prisma.project.update({
            where: { id: projectId },
            data: { startDate: new Date() },
          });
          break;
        }

        case 'markAllDeliverablesComplete': {
          const proj = await prisma.project.findUnique({ where: { id: projectId } });
          if (proj && proj.deliverables.length > 0) {
            const now = new Date();
            const updated = proj.deliverables.map(d =>
              d.status === 'pending' ? { ...d, status: 'done', completedAt: now } : d
            );
            await prisma.project.update({
              where: { id: projectId },
              data: { deliverables: updated },
            });
          }
          break;
        }

        case 'createPaymentNodes': {
          const proj = await prisma.project.findUnique({ where: { id: projectId } });
          if (proj && proj.totalAmount > 0) {
            // 检查是否已有收款节点
            const existingNodes = await prisma.paymentNode.count({ where: { projectId } });
            if (existingNodes === 0) {
              const rule = PAYMENT_SPLIT_RULES.getPlan(proj.totalAmount);
              for (const split of rule.splits) {
                await prisma.paymentNode.create({
                  data: {
                    userId,
                    projectId,
                    clientId: proj.clientId,
                    name: split.label,
                    amount: Math.round(proj.totalAmount * split.percent / 100),
                    dueDate: calculateDueDate(split.trigger, proj.startDate),
                    status: 'pending',
                  },
                });
              }
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error(`[EVENT_BUS] Side effect "${effect}" failed for project ${projectId}:`, err);
    }
  }
});


// ── 收款到账 → 自动记一笔收入 + 更新项目paidAmount + 税务预警 ──
on('payment.received', async ({ paymentNodeId, userId, amount }) => {
  const node = await prisma.paymentNode.findUnique({
    where: { id: paymentNodeId },
    include: { project: true, client: true },
  });
  if (!node) return;

  // 自动创建收入记录
  await prisma.transaction.create({
    data: {
      userId,
      type: 'income',
      amount,
      category: '项目收入',
      subcategory: node.project?.category || '其他服务',
      description: `${node.client?.name || '客户'} - ${node.project?.name || '项目'} - ${node.name}`,
      projectId: node.projectId,
      clientId: node.clientId,
      date: new Date(),
      paymentMethod: 'bank_transfer',
      isBusiness: true,
    },
  });

  // 更新项目已收金额
  await prisma.project.update({
    where: { id: node.projectId },
    data: { paidAmount: { increment: amount } },
  });

  // 检查税务阈值
  const monthlyIncome = await getMonthlyIncome(userId);
  const quarterlyIncome = await getQuarterlyIncome(userId);
  const taxAlerts = TAX_RULES_2026.checkTaxThresholds({
    monthlyIncome,
    quarterlyIncome,
    yearlyProfit: 0,
    entityType: 'individual',
  });

  if (taxAlerts.length > 0) {
    console.log(`[TAX_ALERT] User ${userId}:`, taxAlerts);
  }
});


// ── 新项目创建 → 排期冲突检测 ──
on('project.created', async ({ userId }) => {
  const activeProjects = await prisma.project.findMany({
    where: { userId, status: { in: ['in_progress', 'review'] } },
    select: { name: true, deadline: true },
  });

  const conflicts = SCHEDULING_RULES.detectConflicts(
    activeProjects
      .filter(p => p.deadline)
      .map(p => ({ name: p.name, deadline: p.deadline!, estimatedHoursLeft: 20 }))
  );

  if (conflicts.length > 0) {
    console.log(`[SCHEDULE_WARNING] User ${userId}:`, conflicts);
  }
});


// ── 每日检查 → 逾期自动标记 + 催款升级 ──
on('daily.check', async ({ userId }) => {
  const today = new Date();

  const overdueNodes = await prisma.paymentNode.findMany({
    where: { userId, status: 'pending', dueDate: { lt: today } },
  });

  for (const node of overdueNodes) {
    await prisma.paymentNode.update({
      where: { id: node.id },
      data: { status: 'overdue' },
    });

    const overdueDays = Math.floor((today.getTime() - node.dueDate.getTime()) / 86400000);

    await emit('payment.overdue', {
      paymentNodeId: node.id,
      userId,
      overdueDays,
    });
  }
});


// ── 逾期 → 自动确定催款级别 ──
on('payment.overdue', async ({ paymentNodeId, overdueDays }) => {
  const node = await prisma.paymentNode.findUnique({ where: { id: paymentNodeId } });
  if (!node) return;

  const targetLevel = REMINDER_ESCALATION_RULES.getLevel(overdueDays, node.reminderCount);

  if (targetLevel > node.reminderCount) {
    console.log(`[REMINDER_ESCALATION] Payment ${paymentNodeId}: level ${node.reminderCount} → ${targetLevel}`);
  }

  if (overdueDays >= 7) {
    const interest = REMINDER_ESCALATION_RULES.calculateOverdueInterest(node.amount, overdueDays);
    console.log(`[OVERDUE_INTEREST] Payment ${paymentNodeId}: ¥${interest.interest}`);
  }
});


// ═══ 工具函数 ═══

async function getMonthlyIncome(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const result = await prisma.transaction.aggregate({
    where: { userId, type: 'income', date: { gte: monthStart, lt: monthEnd } },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}

async function getQuarterlyIncome(userId: string): Promise<number> {
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const result = await prisma.transaction.aggregate({
    where: { userId, type: 'income', date: { gte: quarterStart, lt: monthEnd } },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}
