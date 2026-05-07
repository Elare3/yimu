import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, parsePagination, safeParseFloat } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/clients - 客户列表
export const GET = withAuth(async (userId, req: Request) => {
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

  // 高级筛选：累计收入范围（safeParseFloat 防 NaN 注入）
  const revenueMin = safeParseFloat(searchParams.get('revenueMin'));
  const revenueMax = safeParseFloat(searchParams.get('revenueMax'));
  if (revenueMin !== null || revenueMax !== null) {
    where.totalRevenue = {};
    if (revenueMin !== null) (where.totalRevenue as Record<string, unknown>).gte = revenueMin;
    if (revenueMax !== null) (where.totalRevenue as Record<string, unknown>).lte = revenueMax;
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
}, '获取客户列表失败');

// POST /api/clients - 创建客户
export const POST = withAuth(async (userId, req: Request) => {
  const body = await req.json();
  const { name, contactPerson, phone, email, wechat, address, tags, notes, source } = body;

  if (!name) {
    return errorResponse('客户名称不能为空');
  }

  if (!phone?.trim() && !email?.trim()) {
    return errorResponse('电话和邮箱至少填写一项');
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
}, '创建客户失败');
