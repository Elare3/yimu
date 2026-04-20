import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/projects/[id] - 项目详情
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
      include: {
        client: { select: { id: true, name: true, contactPerson: true, phone: true, email: true } },
        quotes: { orderBy: { createdAt: 'desc' }, take: 5 },
        transactions: { orderBy: { date: 'desc' }, take: 10 },
        paymentNodes: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!project) {
      return errorResponse('项目不存在', 404);
    }

    return successResponse(project);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取项目详情失败', 500);
  }
}

// PUT /api/projects/[id] - 更新项目
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    // 验证项目存在且属于当前用户
    const existing = await prisma.project.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return errorResponse('项目不存在', 404);
    }

    const {
      name,
      description,
      priority,
      category,
      manager,
      totalAmount,
      startDate,
      deadline,
      deliverables,
      revisionLimit,
      revisionCount,
      tags,
      notes,
    } = body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    if (manager !== undefined) updateData.manager = manager;
    if (totalAmount !== undefined) updateData.totalAmount = parseFloat(totalAmount);
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
    if (deliverables !== undefined) updateData.deliverables = deliverables;
    if (revisionLimit !== undefined) updateData.revisionLimit = revisionLimit ? parseInt(revisionLimit) : null;
    if (revisionCount !== undefined) updateData.revisionCount = parseInt(revisionCount);
    if (tags !== undefined) updateData.tags = tags;
    if (notes !== undefined) updateData.notes = notes;

    const project = await prisma.project.update({
      where: { id: params.id },
      data: updateData,
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return successResponse(project);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('更新项目失败:', e);
    return errorResponse('更新项目失败', 500);
  }
}

// DELETE /api/projects/[id] - 删除项目
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    const { searchParams } = new URL(req.url);
    const deleteQuotes = searchParams.get('deleteQuotes') === 'true';

    const existing = await prisma.project.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return errorResponse('项目不存在', 404);
    }

    // 删除关联的收款节点
    await prisma.paymentNode.deleteMany({
      where: { projectId: params.id, userId },
    });

    // 报价单：按选项决定删除或解除关联
    if (deleteQuotes) {
      await prisma.quote.deleteMany({
        where: { projectId: params.id, userId },
      });
    } else {
      await prisma.quote.updateMany({
        where: { projectId: params.id, userId },
        data: { projectId: null },
      });
    }

    // 解除关联的交易记录
    await prisma.transaction.updateMany({
      where: { projectId: params.id, userId },
      data: { projectId: null },
    });

    // 回滚客户统计：扣减已收金额和项目数
    if (existing.clientId) {
      const decrements: Record<string, unknown> = { projectCount: { decrement: 1 } };
      if (existing.paidAmount > 0) {
        decrements.totalRevenue = { decrement: existing.paidAmount };
      }
      await prisma.client.update({
        where: { id: existing.clientId },
        data: decrements,
      });
    }

    // 删除项目
    await prisma.project.delete({
      where: { id: params.id },
    });

    return successResponse({ message: '项目已删除' });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('删除项目失败:', e);
    return errorResponse('删除失败', 500);
  }
}
