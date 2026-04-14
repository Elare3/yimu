import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/transactions/[id]
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const transaction = await prisma.transaction.findFirst({
      where: { id: params.id, userId },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });
    if (!transaction) return errorResponse('记录不存在', 404);
    return successResponse(transaction);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取记录失败', 500);
  }
}

// PUT /api/transactions/[id]
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const existing = await prisma.transaction.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('记录不存在', 404);

    const updateData: Record<string, unknown> = {};
    const fields = ['type', 'category', 'subcategory', 'description', 'paymentMethod', 'tags', 'isBusiness'];
    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f];
    }
    if (body.amount !== undefined) updateData.amount = parseFloat(body.amount);
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.projectId !== undefined) updateData.projectId = body.projectId || null;
    if (body.clientId !== undefined) updateData.clientId = body.clientId || null;

    const transaction = await prisma.transaction.update({
      where: { id: params.id },
      data: updateData,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });

    return successResponse(transaction);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('更新失败', 500);
  }
}

// DELETE /api/transactions/[id]
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const existing = await prisma.transaction.findFirst({ where: { id: params.id, userId } });
    if (!existing) return errorResponse('记录不存在', 404);

    await prisma.transaction.delete({ where: { id: params.id } });
    return successResponse({ message: '已删除' });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('删除失败', 500);
  }
}
