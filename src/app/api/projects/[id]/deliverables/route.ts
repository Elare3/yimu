import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

/** 找到项目 + 该项目的交付物（按 order 升序） */
async function getOwnedProjectWithDeliverables(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { deliverables: { orderBy: { order: 'asc' } } },
  });
}

// PUT /api/projects/[id]/deliverables — 切换交付物完成状态
// 兼容旧 API：可用 index（序号）或 deliverableId（关联表 id）
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { index, deliverableId, status } = await req.json();

    if (!status || !['pending', 'done'].includes(status)) {
      return errorResponse('状态只能为 pending 或 done');
    }

    const project = await getOwnedProjectWithDeliverables(params.id, userId);
    if (!project) return errorResponse('项目不存在', 404);

    // 定位目标交付物
    let target = project.deliverables.find(d => d.id === deliverableId);
    if (!target && typeof index === 'number' && index >= 0 && index < project.deliverables.length) {
      target = project.deliverables[index];
    }
    if (!target) return errorResponse('交付物不存在');

    await prisma.deliverable.update({
      where: { id: target.id },
      data: {
        status,
        completedAt: status === 'done' ? new Date() : null,
      },
    });

    // 重新拉一遍最新列表，判断是否全部完成
    const updatedDeliverables = await prisma.deliverable.findMany({
      where: { projectId: params.id },
      orderBy: { order: 'asc' },
    });

    const extraUpdate: Record<string, unknown> = {};
    if (
      status === 'done' &&
      updatedDeliverables.length > 0 &&
      updatedDeliverables.every(d => d.status === 'done') &&
      ['in_progress', 'review'].includes(project.status)
    ) {
      const unpaidPayments = await prisma.paymentNode.count({
        where: { projectId: params.id, status: { not: 'paid' } },
      });
      if (unpaidPayments === 0) {
        extraUpdate.status = 'completed';
        extraUpdate.completedAt = new Date();
      }
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: extraUpdate,
      include: {
        client: { select: { id: true, name: true } },
        deliverables: { orderBy: { order: 'asc' } },
      },
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
      select: { id: true },
    });
    if (!project) return errorResponse('项目不存在', 404);

    // 下一个 order
    const last = await prisma.deliverable.findFirst({
      where: { projectId: params.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    await prisma.deliverable.create({
      data: {
        projectId: params.id,
        name: name.trim(),
        status: 'pending',
        order: nextOrder,
      },
    });

    const updated = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, name: true } },
        deliverables: { orderBy: { order: 'asc' } },
      },
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
// 兼容旧 API：可用 index 或 deliverableId
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { index, deliverableId } = await req.json();

    const project = await getOwnedProjectWithDeliverables(params.id, userId);
    if (!project) return errorResponse('项目不存在', 404);

    let target = project.deliverables.find(d => d.id === deliverableId);
    if (!target && typeof index === 'number' && index >= 0 && index < project.deliverables.length) {
      target = project.deliverables[index];
    }
    if (!target) return errorResponse('交付物不存在');

    await prisma.deliverable.delete({ where: { id: target.id } });

    const updated = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, name: true } },
        deliverables: { orderBy: { order: 'asc' } },
      },
    });

    return successResponse(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('删除交付物失败', 500);
  }
}
