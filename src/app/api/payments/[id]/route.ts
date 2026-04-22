import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, endOfDay } from '@/lib/utils';

// PUT /api/payments/[id] - 更新收款节点
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const existing = await prisma.paymentNode.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('收款节点不存在', 404);

    const updateData: Record<string, unknown> = {};
    let aggregateDiff = 0;

    if (body.name !== undefined) updateData.name = body.name;
    if (body.amount !== undefined) {
      const amount = parseFloat(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return errorResponse('金额无效', 400);
      updateData.amount = amount;

      // 已收款节点改金额：在事务内同步 project.paidAmount 和 client.totalRevenue
      if (existing.status === 'paid' && amount !== existing.paidAmount) {
        aggregateDiff = amount - existing.paidAmount;
        updateData.paidAmount = amount;
      }
    }
    if (body.dueDate !== undefined) {
      const date = new Date(body.dueDate);
      if (isNaN(date.getTime())) return errorResponse('日期无效', 400);
      updateData.dueDate = endOfDay(date);
    }
    if (body.notes !== undefined) updateData.notes = body.notes;

    const node = await prisma.$transaction(async (tx) => {
      const updated = await tx.paymentNode.update({
        where: { id: params.id },
        data: updateData,
        include: {
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      });

      if (aggregateDiff !== 0) {
        await tx.project.update({
          where: { id: existing.projectId },
          data: { paidAmount: { increment: aggregateDiff } },
        });
        if (existing.clientId) {
          await tx.client.update({
            where: { id: existing.clientId },
            data: { totalRevenue: { increment: aggregateDiff } },
          });
        }
      }

      return updated;
    });

    return successResponse(node);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('更新失败', 500);
  }
}

// DELETE /api/payments/[id] - 删除收款节点
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    const existing = await prisma.paymentNode.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('收款节点不存在', 404);

    // 已收款的节点不允许删除（需要先反冲才能删除）
    if (existing.status === 'paid') {
      return errorResponse('已收款的节点不能删除，如需调整请联系管理员', 400);
    }

    await prisma.paymentNode.delete({ where: { id: params.id } });

    return successResponse({ deleted: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('删除收款节点失败:', e);
    return errorResponse('删除失败', 500);
  }
}
