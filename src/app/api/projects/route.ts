import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, parsePagination, safeParseFloat } from '@/lib/utils';

// GET /api/projects - 项目列表
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const clientId = searchParams.get('clientId') || '';
    const priority = searchParams.get('priority') || '';
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    const where: Record<string, unknown> = { userId };

    if (status) {
      where.status = status;
    } else {
      // 默认不显示已取消的
      where.status = { not: 'cancelled' };
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (priority) {
      where.priority = priority;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    // 高级筛选：日期范围
    const deadlineFrom = searchParams.get('deadlineFrom');
    const deadlineTo = searchParams.get('deadlineTo');
    if (deadlineFrom || deadlineTo) {
      where.deadline = {};
      if (deadlineFrom) (where.deadline as Record<string, unknown>).gte = new Date(deadlineFrom);
      if (deadlineTo) (where.deadline as Record<string, unknown>).lte = new Date(deadlineTo);
    }

    // 高级筛选：金额范围
    const amountMin = searchParams.get('amountMin');
    const amountMax = searchParams.get('amountMax');
    if (amountMin || amountMax) {
      where.totalAmount = {};
      if (amountMin) (where.totalAmount as Record<string, unknown>).gte = parseFloat(amountMin);
      if (amountMax) (where.totalAmount as Record<string, unknown>).lte = parseFloat(amountMax);
    }

    // 高级筛选：标签（包含任一）
    const tag = searchParams.get('tag');
    if (tag) {
      where.tags = { has: tag };
    }

    // 排序
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSorts = ['updatedAt', 'createdAt', 'deadline', 'totalAmount', 'name'];
    const orderField = validSorts.includes(sortBy) ? sortBy : 'updatedAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, contactPerson: true } },
        },
        orderBy: { [orderField]: orderDir },
        skip,
        take,
      }),
      prisma.project.count({ where }),
    ]);

    return successResponse({ items, total, page, pageSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取项目列表失败', 500);
  }
}

// POST /api/projects - 创建项目
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const {
      clientId,
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
      tags,
      notes,
    } = body;

    if (!name) {
      return errorResponse('项目名称不能为空');
    }
    if (!clientId) {
      return errorResponse('请选择客户');
    }

    // 验证客户存在且属于当前用户
    const client = await prisma.client.findFirst({
      where: { id: clientId, userId },
    });
    if (!client) {
      return errorResponse('客户不存在');
    }

    // 将外部传入的 deliverables 数组转为关联表 nested create
    const deliverableCreate = Array.isArray(deliverables)
      ? deliverables.map((d: { name: string; status?: string; completedAt?: string | Date | null }, i: number) => ({
          name: d.name,
          status: d.status || 'pending',
          completedAt: d.completedAt ? new Date(d.completedAt) : null,
          order: i,
        }))
      : [];

    const project = await prisma.project.create({
      data: {
        userId,
        clientId,
        name,
        description: description || '',
        status: 'quoted',
        priority: priority || 'medium',
        category: category || '',
        manager: manager || '',
        totalAmount: safeParseFloat(totalAmount) ?? 0,
        startDate: startDate ? new Date(startDate) : null,
        deadline: deadline ? new Date(deadline) : null,
        deliverables: { create: deliverableCreate },
        revisionLimit: revisionLimit ? parseInt(revisionLimit) : null,
        tags: tags || [],
        notes: notes || '',
      },
      include: {
        client: { select: { id: true, name: true } },
        deliverables: { orderBy: { order: 'asc' } },
      },
    });

    // 更新客户的项目计数
    await prisma.client.update({
      where: { id: clientId },
      data: { projectCount: { increment: 1 } },
    });

    return successResponse(project);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('创建项目失败:', e);
    return errorResponse('创建项目失败', 500);
  }
}
