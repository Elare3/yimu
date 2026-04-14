import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, parsePagination } from '@/lib/utils';

// GET /api/clients - 客户列表
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'active';
    const tag = searchParams.get('tag') || '';
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    const where: Record<string, unknown> = { userId, status };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    if (tag) {
      where.tags = { has: tag };
    }

    // 高级筛选：累计收入范围
    const revenueMin = searchParams.get('revenueMin');
    const revenueMax = searchParams.get('revenueMax');
    if (revenueMin || revenueMax) {
      where.totalRevenue = {};
      if (revenueMin) (where.totalRevenue as Record<string, unknown>).gte = parseFloat(revenueMin);
      if (revenueMax) (where.totalRevenue as Record<string, unknown>).lte = parseFloat(revenueMax);
    }

    // 高级筛选：来源
    const source = searchParams.get('source');
    if (source) where.source = source;

    // 排序
    const sortBy = searchParams.get('sortBy') || 'updatedAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const validSorts = ['updatedAt', 'createdAt', 'totalRevenue', 'projectCount', 'name'];
    const orderField = validSorts.includes(sortBy) ? sortBy : 'updatedAt';
    const orderDir = sortOrder === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip,
        take,
      }),
      prisma.client.count({ where }),
    ]);

    return successResponse({ items, total, page, pageSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取客户列表失败', 500);
  }
}

// POST /api/clients - 创建客户
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { name, contactPerson, phone, email, wechat, address, tags, notes, source } = body;

    if (!name) {
      return errorResponse('客户名称不能为空');
    }

    const client = await prisma.client.create({
      data: {
        userId,
        name,
        contactPerson: contactPerson || '',
        phone: phone || '',
        email: email || '',
        wechat: wechat || '',
        address: address || '',
        tags: tags || [],
        notes: notes || '',
        source: source || '',
      },
    });

    return successResponse(client);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('创建客户失败', 500);
  }
}
