import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, parsePagination, safeParseFloat } from '@/lib/utils';

// GET /api/transactions - 收支列表
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || '';
    const month = searchParams.get('month') || '';
    const category = searchParams.get('category') || '';
    const projectId = searchParams.get('projectId') || '';
    const clientId = searchParams.get('clientId') || '';
    const keyword = searchParams.get('keyword') || '';
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    const where: Record<string, unknown> = { userId };
    if (type) where.type = type;
    if (category) where.category = category;
    if (projectId) where.projectId = projectId;
    if (clientId) where.clientId = clientId;
    if (keyword) where.description = { contains: keyword, mode: 'insensitive' };

    // 按月筛选
    if (month) {
      const [year, m] = month.split('-').map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 1);
      where.date = { gte: start, lt: end };
    }

    // 高级筛选：自定义日期范围（优先级高于 month）
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
    }

    // 高级筛选：金额范围
    const amountMin = searchParams.get('amountMin');
    const amountMax = searchParams.get('amountMax');
    if (amountMin || amountMax) {
      where.amount = {};
      if (amountMin) (where.amount as Record<string, unknown>).gte = parseFloat(amountMin);
      if (amountMax) (where.amount as Record<string, unknown>).lte = parseFloat(amountMax);
    }

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.transaction.count({ where }),
    ]);

    return successResponse({ items, total, page, pageSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取收支列表失败', 500);
  }
}

// POST /api/transactions - 手动创建记录
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { type, amount, category, subcategory, description, projectId, clientId, date, paymentMethod, tags, isBusiness } = body;

    if (!type || !['income', 'expense'].includes(type)) return errorResponse('请选择收入或支出');
    if (!amount || amount <= 0) return errorResponse('请填写正确金额');
    if (!category) return errorResponse('请选择分类');

    // 归属校验：projectId / clientId 必须属于当前用户
    if (projectId) {
      const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
      if (!project) return errorResponse('项目不存在', 400);
    }
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, userId }, select: { id: true } });
      if (!client) return errorResponse('客户不存在', 400);
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        type,
        amount: safeParseFloat(amount) ?? 0,
        category,
        subcategory: subcategory || '',
        description: description || '',
        projectId: projectId || null,
        clientId: clientId || null,
        date: date ? new Date(date) : new Date(),
        paymentMethod: paymentMethod || 'other',
        tags: tags || [],
        isBusiness: isBusiness !== undefined ? isBusiness : true,
      },
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
    console.error('创建记录失败:', e);
    return errorResponse('创建记录失败', 500);
  }
}
