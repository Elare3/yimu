import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { logActivity } from '@/lib/activity';
import { emit } from '@/lib/events';

// GET /api/quotes/[id] - 报价单详情
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const quote = await prisma.quote.findFirst({
      where: { id: params.id, userId },
      include: {
        client: { select: { id: true, name: true, contactPerson: true, phone: true, email: true, address: true } },
        project: { select: { id: true, name: true } },
      },
    });

    if (!quote) return errorResponse('报价单不存在', 404);
    return successResponse(quote);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取报价单失败', 500);
  }
}

// PUT /api/quotes/[id] - 更新报价单
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const existing = await prisma.quote.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('报价单不存在', 404);

    const { title, items, paymentTerms, validUntil, notes, taxRate, discount, status, projectId } = body;

    const updateData: Record<string, unknown> = {};

    if (title !== undefined) updateData.title = title;
    if (projectId !== undefined) updateData.projectId = projectId || null;
    if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
    if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    // 如果更新了报价项，重新计算金额
    if (items) {
      const processedItems = items.map((item: { quantity: number; unitPrice: number; name: string; description?: string; unit?: string }) => ({
        name: item.name,
        description: item.description || '',
        quantity: item.quantity || 1,
        unit: item.unit || '项',
        unitPrice: item.unitPrice,
        amount: (item.quantity || 1) * item.unitPrice,
      }));

      const subtotal = processedItems.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);
      const rate = taxRate ?? existing.taxRate;
      const taxAmount = subtotal * rate / 100;
      const discountAmount = discount ?? existing.discount;
      const total = subtotal + taxAmount - discountAmount;

      updateData.items = processedItems;
      updateData.subtotal = subtotal;
      updateData.taxRate = rate;
      updateData.taxAmount = taxAmount;
      updateData.discount = discountAmount;
      updateData.total = total;
    }

    const quote = await prisma.quote.update({
      where: { id: params.id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });

    // 报价被接受 → 触发事件总线（自动创建项目+收款节点，或推进已有项目状态）
    if (status === 'accepted') {
      await emit('quote.accepted', { quoteId: params.id, userId });
    }
    if (status === 'rejected') {
      await emit('quote.rejected', { quoteId: params.id, userId });
    }

    // 记录状态变更日志
    if (status && status !== existing.status) {
      const statusMap: Record<string, string> = {
        draft: '草稿', sent: '已发送', accepted: '已接受', rejected: '已拒绝', expired: '已过期',
      };
      await logActivity({
        userId,
        entityType: 'quote',
        entityId: params.id,
        action: 'status_changed',
        description: `报价「${quote.title}」状态变更为「${statusMap[status] || status}」`,
        metadata: { from: existing.status, to: status, total: existing.total },
      });
    }

    return successResponse(quote);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('更新报价单失败:', e);
    return errorResponse('更新报价单失败', 500);
  }
}

// DELETE /api/quotes/[id] - 删除报价单
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    const existing = await prisma.quote.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('报价单不存在', 404);

    await prisma.quote.delete({ where: { id: params.id } });

    return successResponse({ deleted: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('删除报价单失败:', e);
    return errorResponse('删除报价单失败', 500);
  }
}
