import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { emit } from '@/lib/events';

// PUT /api/payments/[id]/paid - 标记已收款（v3.0 事件总线版）
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { paidAmount } = await req.json();

    const existing = await prisma.paymentNode.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('收款节点不存在', 404);
    if (existing.status === 'paid') return errorResponse('该节点已标记为已收款', 400);

    const parsedAmount = paidAmount ? parseFloat(paidAmount) : existing.amount;
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return errorResponse('收款金额无效', 400);
    }

    // 使用事务确保核心数据一致性
    const result = await prisma.$transaction(async (tx) => {
      const node = await tx.paymentNode.update({
        where: { id: params.id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          paidAmount: parsedAmount,
        },
        include: {
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      });

      // 更新项目已收金额
      await tx.project.update({
        where: { id: existing.projectId },
        data: { paidAmount: { increment: parsedAmount } },
      });

      // 自动创建收入记账记录
      await tx.transaction.create({
        data: {
          userId,
          type: 'income',
          amount: parsedAmount,
          category: '项目收款',
          description: `收款：${node.name}${node.project ? ` - ${node.project.name}` : ''}`,
          projectId: existing.projectId,
          clientId: existing.clientId || null,
          date: new Date(),
          paymentMethod: 'transfer',
          tags: ['自动记账'],
          isBusiness: true,
        },
      });

      // 同步更新客户累计收入
      if (existing.clientId) {
        await tx.client.update({
          where: { id: existing.clientId },
          data: { totalRevenue: { increment: parsedAmount } },
        });
      }

      // 自动完工判断：所有收款节点已付 + 所有交付物已完成
      const remainingPayments = await tx.paymentNode.count({
        where: {
          projectId: existing.projectId,
          status: { not: 'paid' },
          id: { not: params.id },
        },
      });

      if (remainingPayments === 0) {
        const project = await tx.project.findUnique({
          where: { id: existing.projectId },
          select: {
            status: true,
            deliverables: { select: { status: true } },
          },
        });

        if (project && ['in_progress', 'review'].includes(project.status)) {
          const allDeliverablesDone = !project.deliverables.length ||
            project.deliverables.every((d) => d.status === 'done');

          if (allDeliverablesDone) {
            await tx.project.update({
              where: { id: existing.projectId },
              data: { status: 'completed', completedAt: new Date() },
            });
          }
        }
      }

      return node;
    });

    // 记录活动日志
    await logActivity({
      userId,
      entityType: 'payment',
      entityId: params.id,
      action: 'payment_received',
      description: `收到「${result.project?.name ?? '项目'}」的"${existing.name}" ¥${parsedAmount.toLocaleString()}`,
      metadata: { amount: parsedAmount, projectId: existing.projectId },
    });

    // 触发事件总线：税务预警检查等异步副作用
    await emit('payment.received', {
      paymentNodeId: params.id,
      userId,
      amount: parsedAmount,
    });

    return successResponse(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('标记收款失败', 500);
  }
}
