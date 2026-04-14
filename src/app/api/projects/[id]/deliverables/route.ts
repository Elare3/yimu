import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// PUT /api/projects/[id]/deliverables — 切换交付物完成状态
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { index, status } = await req.json();

    if (index === undefined || index < 0) {
      return errorResponse('请指定交付物序号');
    }
    if (!status || !['pending', 'done'].includes(status)) {
      return errorResponse('状态只能为 pending 或 done');
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
    });
    if (!project) return errorResponse('项目不存在', 404);

    const deliverables = [...(project.deliverables || [])];
    if (index >= deliverables.length) {
      return errorResponse('交付物序号超出范围');
    }

    deliverables[index] = {
      ...deliverables[index],
      status,
      completedAt: status === 'done' ? new Date() : null,
    };

    const updateData: Record<string, unknown> = { deliverables };

    // 自动完工判断：当所有交付物标记完成时，检查收款是否也全部完成
    if (status === 'done' && deliverables.every((d: { status: string }) => d.status === 'done')) {
      if (['in_progress', 'review'].includes(project.status)) {
        const unpaidPayments = await prisma.paymentNode.count({
          where: { projectId: params.id, status: { not: 'paid' } },
        });
        if (unpaidPayments === 0) {
          updateData.status = 'completed';
          updateData.completedAt = new Date();
        }
      }
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: updateData,
      include: { client: { select: { id: true, name: true } } },
    });

    return successResponse(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('更新交付物失败', 500);
  }
}

// POST /api/projects/[id]/deliverables — 添加新交付物
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { name } = await req.json();

    if (!name?.trim()) return errorResponse('请填写交付物名称');

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
    });
    if (!project) return errorResponse('项目不存在', 404);

    const deliverables = [
      ...(project.deliverables || []),
      { name: name.trim(), status: 'pending', completedAt: null },
    ];

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: { deliverables },
      include: { client: { select: { id: true, name: true } } },
    });

    return successResponse(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('添加交付物失败', 500);
  }
}

// DELETE /api/projects/[id]/deliverables — 删除交付物
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { index } = await req.json();

    if (index === undefined || index < 0) {
      return errorResponse('请指定交付物序号');
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
    });
    if (!project) return errorResponse('项目不存在', 404);

    const deliverables = [...(project.deliverables || [])];
    if (index >= deliverables.length) {
      return errorResponse('交付物序号超出范围');
    }

    deliverables.splice(index, 1);

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: { deliverables },
      include: { client: { select: { id: true, name: true } } },
    });

    return successResponse(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('删除交付物失败', 500);
  }
}
