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
import { sendMail } from './mailer';
import {
  renderOverdueEmail,
  renderDueSoonEmail,
  renderQuoteExpiringEmail,
} from './email-templates';
import {
  beijingMidnight,
  daysUntilBeijing,
  beijingMonthRange,
  beijingQuarterStart,
  beijingYMD,
} from './utils';

// ═══ 事件类型定义 ═══

type EventPayload = {
  'quote.accepted': { quoteId: string; userId: string };
  'quote.rejected': { quoteId: string; userId: string; reason?: string };
  'quote.expiring': { quoteId: string; userId: string; daysUntilExpire: number };
  'project.status_changed': { projectId: string; userId: string; from: string; to: string };
  'project.created': { projectId: string; userId: string };
  'payment.overdue': { paymentNodeId: string; userId: string; overdueDays: number };
  'payment.due_soon': { paymentNodeId: string; userId: string; daysUntilDue: number };
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
    include: { client: true, items: { orderBy: { order: 'asc' } } },
  });
  if (!quote) return;

  // 如果已经关联项目，推进状态并创建收款节点
  if (quote.projectId) {
    const projectId = quote.projectId; // 提到 const，避免 .map 闭包丢失 narrowing
    const existingProject = await prisma.project.findUnique({ where: { id: projectId } });
    if (existingProject && existingProject.status === 'quoted') {
      await prisma.project.update({
        where: { id: projectId },
        data: { status: 'in_progress', totalAmount: quote.total, startDate: existingProject.startDate || new Date() },
      });

      // 检查是否已有收款节点，没有则自动创建（一次 createMany 替代 N 次 create）
      const existingNodes = await prisma.paymentNode.count({ where: { projectId } });
      if (existingNodes === 0 && quote.total > 0) {
        const rule = PAYMENT_SPLIT_RULES.getPlan(quote.total);
        const splits = PAYMENT_SPLIT_RULES.creditAdjustment('normal', rule.splits);
        const startDate = existingProject.startDate || new Date();
        await prisma.paymentNode.createMany({
          data: splits.map((split) => ({
            userId,
            projectId,
            clientId: quote.clientId,
            name: split.label,
            amount: Math.round((quote.total * split.percent) / 100),
            dueDate: calculateDueDate(split.trigger, startDate),
            status: 'pending',
          })),
        });
      }
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
      category: guessCategory(quote.items),
      startDate: new Date(),
    },
  });

  // 关联报价单到项目
  await prisma.quote.update({ where: { id: quoteId }, data: { projectId: project.id } });

  // 自动拆分收款节点（一次 createMany 替代 N 次 create）
  const rule = PAYMENT_SPLIT_RULES.getPlan(quote.total);
  const splits = PAYMENT_SPLIT_RULES.creditAdjustment('normal', rule.splits);

  await prisma.paymentNode.createMany({
    data: splits.map((split) => ({
      userId,
      projectId: project.id,
      clientId: quote.clientId,
      name: split.label,
      amount: Math.round((quote.total * split.percent) / 100),
      dueDate: calculateDueDate(split.trigger, project.startDate),
      status: 'pending',
    })),
  });

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
            // dueDate 设为"北京今天 23:59:59.999"。原版用 setHours 走服务器本地 TZ，
            // UTC 服务器上会变成"北京明天 07:59"，跨日提前到期不准。
            // 用 beijingMidnight(明天) - 1ms 精确表达"北京今天的最后一刻"。
            const tomorrowBjMidnight = new Date(beijingMidnight().getTime() + 86_400_000);
            const todayBjEnd = new Date(tomorrowBjMidnight.getTime() - 1);
            await prisma.paymentNode.update({
              where: { id: lastNode.id },
              data: { dueDate: todayBjEnd },
            });
          }
          break;
        }

        case 'updateClientTotalRevenue': {
          // totalRevenue already incremented per-payment in paid/route.ts — no-op here
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
          // PaymentNode.status 没有 'cancelled' 值，项目取消时直接删除未支付节点
          await prisma.paymentNode.deleteMany({
            where: { projectId, status: { in: ['pending', 'reminded', 'overdue'] } },
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
          // 直接在关联表上批量 update pending → done
          await prisma.deliverable.updateMany({
            where: { projectId, status: 'pending' },
            data: { status: 'done', completedAt: new Date() },
          });
          break;
        }

        case 'createPaymentNodes': {
          const proj = await prisma.project.findUnique({ where: { id: projectId } });
          if (proj && proj.totalAmount > 0) {
            // 检查是否已有收款节点（一次 createMany 替代 N 次 create）
            const existingNodes = await prisma.paymentNode.count({ where: { projectId } });
            if (existingNodes === 0) {
              const rule = PAYMENT_SPLIT_RULES.getPlan(proj.totalAmount);
              await prisma.paymentNode.createMany({
                data: rule.splits.map((split) => ({
                  userId,
                  projectId,
                  clientId: proj.clientId,
                  name: split.label,
                  amount: Math.round((proj.totalAmount * split.percent) / 100),
                  dueDate: calculateDueDate(split.trigger, proj.startDate),
                  status: 'pending',
                })),
              });
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


// ── 收款到账 → 税务预警检查（收入记录和 paidAmount 已在 paid/route.ts 事务中完成） ──
on('payment.received', async ({ userId }) => {
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


// ── 每日检查 → 逾期自动标记 + 即将到期提醒 + 报价快过期提醒 ──
// 时间基准：北京时间（产品仅服务大陆用户）。所有"今天 00:00"由 beijingMidnight 显式计算，
// 不依赖服务器本地时区，避免部署到 UTC 服务器时窗口偏移一天。
on('daily.check', async ({ userId }) => {
  const today = beijingMidnight(); // 北京时间今天 00:00 的绝对时间

  // 1) 已逾期：dueDate < 北京今天 00:00 且 status 仍是 pending/reminded
  // 优化：一次 updateMany 批量改状态，再遍历事件总线（事件总线在内存里，不会有 N 次 DB 往返）
  const overdueNodes = await prisma.paymentNode.findMany({
    where: { userId, status: { in: ['pending', 'reminded'] }, dueDate: { lt: today } },
    select: { id: true, dueDate: true }, // 只取需要的字段，省带宽
  });

  if (overdueNodes.length > 0) {
    await prisma.paymentNode.updateMany({
      where: { id: { in: overdueNodes.map((n) => n.id) } },
      data: { status: 'overdue' },
    });

    for (const node of overdueNodes) {
      // 用 daysUntilBeijing 反算逾期天数（更精确，不会因毫秒进位错位）
      const overdueDays = -daysUntilBeijing(node.dueDate);
      await emit('payment.overdue', {
        paymentNodeId: node.id,
        userId,
        overdueDays: Math.max(0, overdueDays),
      });
    }
  }

  // 2) 即将到期：根据用户 paymentReminderDays 提前 N 天提醒（默认 [3, 1, 0]）
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const reminderDays = settings?.paymentReminderDays ?? [3, 1, 0];

  for (const advance of reminderDays) {
    // 北京时间窗口：[今天 + advance 天 00:00, +1 天 00:00)
    const targetStart = new Date(today.getTime() + advance * 86_400_000);
    const targetEnd = new Date(targetStart.getTime() + 86_400_000);

    const dueSoonNodes = await prisma.paymentNode.findMany({
      where: {
        userId,
        status: { in: ['pending', 'reminded'] },
        dueDate: { gte: targetStart, lt: targetEnd },
      },
    });

    for (const node of dueSoonNodes) {
      await emit('payment.due_soon', {
        paymentNodeId: node.id,
        userId,
        daysUntilDue: advance,
      });
    }
  }

  // 3) 报价快过期：validUntil 在北京时间今天起 0–3 天内
  const expireWindowEnd = new Date(today.getTime() + 4 * 86_400_000); // 含今天后 3 天

  const expiringQuotes = await prisma.quote.findMany({
    where: {
      userId,
      status: 'sent',
      validUntil: { gte: today, lt: expireWindowEnd },
    },
  });

  for (const q of expiringQuotes) {
    if (!q.validUntil) continue;
    const days = Math.max(0, daysUntilBeijing(q.validUntil));
    await emit('quote.expiring', {
      quoteId: q.id,
      userId,
      daysUntilExpire: days,
    });
  }
});


// ── 逾期 → 自动确定催款级别 + 发邮件 ──
on('payment.overdue', async ({ paymentNodeId, userId, overdueDays }) => {
  const node = await prisma.paymentNode.findUnique({
    where: { id: paymentNodeId },
    include: { project: true, client: true },
  });
  if (!node) return;

  const targetLevel = REMINDER_ESCALATION_RULES.getLevel(overdueDays, node.reminderCount);

  if (targetLevel > node.reminderCount) {
    console.log(`[REMINDER_ESCALATION] Payment ${paymentNodeId}: level ${node.reminderCount} → ${targetLevel}`);
  }

  if (overdueDays >= 7) {
    const interest = REMINDER_ESCALATION_RULES.calculateOverdueInterest(node.amount, overdueDays);
    console.log(`[OVERDUE_INTEREST] Payment ${paymentNodeId}: ¥${interest.interest}`);
  }

  // 发邮件给用户（不是给客户）— 提醒用户去催款
  await sendOverdueEmail(userId, node, overdueDays);
});


// ── 即将到期 → 发提醒邮件 ──
on('payment.due_soon', async ({ paymentNodeId, userId, daysUntilDue }) => {
  const node = await prisma.paymentNode.findUnique({
    where: { id: paymentNodeId },
    include: { project: true, client: true },
  });
  if (!node) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true, notifyDueSoon: true },
  });
  if (!user || !user.email || !user.emailVerified || !user.notifyDueSoon) return;

  const tpl = renderDueSoonEmail({
    userName: user.name || '',
    clientName: node.client?.name || '客户',
    projectName: node.project?.name || '项目',
    nodeName: node.name,
    amount: node.amount,
    dueDate: node.dueDate,
    daysUntilDue,
  });

  await sendMail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    userId,
    eventType: 'payment.due_soon',
  });
});


// ── 报价快过期 → 发提醒邮件 ──
on('quote.expiring', async ({ quoteId, userId, daysUntilExpire }) => {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { client: true },
  });
  if (!quote || !quote.validUntil) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true, notifyQuoteExpiring: true },
  });
  if (!user || !user.email || !user.emailVerified || !user.notifyQuoteExpiring) return;

  const tpl = renderQuoteExpiringEmail({
    userName: user.name || '',
    clientName: quote.client?.name || '客户',
    quoteTitle: quote.title || '报价单',
    total: quote.total,
    validUntil: quote.validUntil,
    daysUntilExpire,
  });

  await sendMail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    userId,
    eventType: 'quote.expiring',
  });
});


// ── 内部工具：发逾期邮件（带通知偏好检查） ──
async function sendOverdueEmail(
  userId: string,
  node: { name: string; amount: number; dueDate: Date; project: { name: string } | null; client: { name: string } | null },
  overdueDays: number,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true, notifyOverdue: true },
  });
  if (!user || !user.email || !user.emailVerified || !user.notifyOverdue) return;

  const tpl = renderOverdueEmail({
    userName: user.name || '',
    clientName: node.client?.name || '客户',
    projectName: node.project?.name || '项目',
    nodeName: node.name,
    amount: node.amount,
    dueDate: node.dueDate,
    overdueDays,
  });

  await sendMail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    userId,
    eventType: 'payment.overdue',
  });
}


// ═══ 工具函数 ═══

// 收入聚合（北京时间窗口）。原版分两个函数，DRY 后合并为一个 helper。
// 边界严格按北京月/季切，跨服务器 TZ 一致。
async function sumIncomeInRange(userId: string, start: Date, end: Date): Promise<number> {
  const result = await prisma.transaction.aggregate({
    where: { userId, type: 'income', date: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}

async function getMonthlyIncome(userId: string, now: Date = new Date()): Promise<number> {
  const { year, month } = beijingYMD(now);
  const { start, end } = beijingMonthRange(year, month);
  return sumIncomeInRange(userId, start, end);
}

async function getQuarterlyIncome(userId: string, now: Date = new Date()): Promise<number> {
  const start = beijingQuarterStart(now);
  // 季末 = 季首 + 3 个北京自然月。借 beijingMonthRange 处理跨年。
  const { year, month } = beijingYMD(start); // start 已是北京季首
  const q = Math.floor((month - 1) / 3); // 0..3
  const endMonthYear = q === 3 ? year + 1 : year;
  const endMonth = q === 3 ? 1 : (q + 1) * 3 + 1;
  const { start: end } = beijingMonthRange(endMonthYear, endMonth);
  return sumIncomeInRange(userId, start, end);
}
