import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, safeParseFloat } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/transactions/[id]
export const GET = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: params.id, userId },
    include: {
      project: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
  });
  if (!transaction) return errorResponse('记录不存在', 404);
  return successResponse(transaction);
}, '获取记录失败');

// 收款自动记账的判定：由 /api/payments/[id]/paid 写入的"收入"记录
// 一旦命中，本记录的增删改必须同步回滚 project.paidAmount 和 client.totalRevenue
function isAutoPaymentIncome(t: {
  type: string;
  tags: string[];
  projectId: string | null;
}): boolean {
  return t.type === 'income' && !!t.projectId && t.tags.includes('自动记账');
}

// PUT /api/transactions/[id]
export const PUT = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
  const body = await req.json();

  const existing = await prisma.transaction.findFirst({ where: { id: params.id, userId } });
  if (!existing) return errorResponse('记录不存在', 404);

  const isAuto = isAutoPaymentIncome(existing);

  const updateData: Record<string, unknown> = {};
  const fields = ['type', 'category', 'subcategory', 'description', 'paymentMethod', 'tags', 'isBusiness'];
  for (const f of fields) {
    if (body[f] !== undefined) updateData[f] = body[f];
  }
  if (body.amount !== undefined) {
    const amount = safeParseFloat(body.amount);
    if (amount === null || amount <= 0) return errorResponse('金额无效', 400);
    updateData.amount = amount;
  }
  if (body.date !== undefined) {
    const date = new Date(body.date);
    if (isNaN(date.getTime())) return errorResponse('日期无效', 400);
    updateData.date = date;
  }
  if (body.projectId !== undefined) {
    if (body.projectId) {
      const project = await prisma.project.findFirst({ where: { id: body.projectId, userId }, select: { id: true } });
      if (!project) return errorResponse('项目不存在', 400);
    }
    updateData.projectId = body.projectId || null;
  }
  if (body.clientId !== undefined) {
    if (body.clientId) {
      const client = await prisma.client.findFirst({ where: { id: body.clientId, userId }, select: { id: true } });
      if (!client) return errorResponse('客户不存在', 400);
    }
    updateData.clientId = body.clientId || null;
  }

  // 自动记账：禁止改动会破坏回款一致性的字段（类型、项目、客户、标签）
  // 仍允许调整金额、日期、描述、备注等
  if (isAuto) {
    for (const locked of ['type', 'projectId', 'clientId', 'tags'] as const) {
      if (body[locked] !== undefined) {
        return errorResponse('该记录由收款自动生成，无法修改类型/项目/客户/标签；如需调整请前往收款节点处理', 400);
      }
    }
  }

  const amountDiff =
    isAuto && typeof updateData.amount === 'number'
      ? (updateData.amount as number) - existing.amount
      : 0;

  const transaction = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id: params.id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });

    if (amountDiff !== 0 && existing.projectId) {
      await tx.project.update({
        where: { id: existing.projectId },
        data: { paidAmount: { increment: amountDiff } },
      });
      if (existing.clientId) {
        await tx.client.update({
          where: { id: existing.clientId },
          data: { totalRevenue: { increment: amountDiff } },
        });
      }
      // 同步收款节点 paidAmount（自动记账与节点一一对应）
      await tx.paymentNode.updateMany({
        where: { userId, projectId: existing.projectId, status: 'paid', paidAmount: existing.amount },
        data: { paidAmount: updated.amount },
      });
    }

    return updated;
  });

  return successResponse(transaction);
}, '更新失败');

// DELETE /api/transactions/[id]
export const DELETE = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const existing = await prisma.transaction.findFirst({ where: { id: params.id, userId } });
  if (!existing) return errorResponse('记录不存在', 404);

  const isAuto = isAutoPaymentIncome(existing);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.delete({ where: { id: params.id } });

    // 自动记账被删除：回滚项目已收金额和客户累计收入
    if (isAuto && existing.projectId) {
      await tx.project.update({
        where: { id: existing.projectId },
        data: { paidAmount: { decrement: existing.amount } },
      });
      if (existing.clientId) {
        await tx.client.update({
          where: { id: existing.clientId },
          data: { totalRevenue: { decrement: existing.amount } },
        });
      }
    }
  });

  return successResponse({ message: '已删除' });
}, '删除失败');
