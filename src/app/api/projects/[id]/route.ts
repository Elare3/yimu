import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, safeParseFloat } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/projects/[id] - 项目详情
export const GET = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: {
      client: { select: { id: true, name: true, contactPerson: true, phone: true, email: true } },
      quotes: { orderBy: { createdAt: 'desc' }, take: 5 },
      transactions: { orderBy: { date: 'desc' }, take: 10 },
      paymentNodes: { orderBy: { dueDate: 'asc' } },
      deliverables: { orderBy: { order: 'asc' } },
    },
  });

  if (!project) {
    return errorResponse('项目不存在', 404);
  }

  return successResponse(project);
}, '获取项目详情失败');

// PUT /api/projects/[id] - 更新项目
export const PUT = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
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
  if (totalAmount !== undefined) updateData.totalAmount = safeParseFloat(totalAmount) ?? 0;
  if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
  if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
  // deliverables 是关联表：全量替换（删掉旧的，插入新的）
  if (deliverables !== undefined) {
    updateData.deliverables = {
      deleteMany: {},
      create: Array.isArray(deliverables)
        ? deliverables.map((d: { name: string; status?: string; completedAt?: string | Date | null }, i: number) => ({
            name: d.name,
            status: d.status || 'pending',
            completedAt: d.completedAt ? new Date(d.completedAt) : null,
            order: i,
          }))
        : [],
    };
  }
  if (revisionLimit !== undefined) updateData.revisionLimit = revisionLimit ? parseInt(revisionLimit) : null;
  if (revisionCount !== undefined) updateData.revisionCount = parseInt(revisionCount);
  if (tags !== undefined) updateData.tags = tags;
  if (notes !== undefined) updateData.notes = notes;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: updateData,
    include: {
      client: { select: { id: true, name: true } },
      deliverables: { orderBy: { order: 'asc' } },
    },
  });

  return successResponse(project);
}, '更新项目失败');

// DELETE /api/projects/[id] - 删除项目
export const DELETE = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
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
}, '删除项目失败');
