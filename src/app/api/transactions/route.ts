import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, parsePagination, safeParseFloat } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';
import { isOneOf, TRANSACTION_TYPE } from '@/lib/constants';

// GET /api/transactions - 收支列表
export const GET = withAuth(async (userId, req: Request) => {
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

  // 高级筛选：金额范围（safeParseFloat 防 NaN 注入）
  const amountMin = safeParseFloat(searchParams.get('amountMin'));
  const amountMax = safeParseFloat(searchParams.get('amountMax'));
  if (amountMin !== null || amountMax !== null) {
    where.amount = {};
    if (amountMin !== null) (where.amount as Record<string, unknown>).gte = amountMin;
    if (amountMax !== null) (where.amount as Record<string, unknown>).lte = amountMax;
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
}, '获取收支列表失败');

// POST /api/transactions - 手动创建记录
export const POST = withAuth(async (userId, req: Request) => {
  const body = await req.json();
  const { type, amount, category, subcategory, description, projectId, clientId, date, paymentMethod, tags, isBusiness } = body;

  if (!isOneOf(TRANSACTION_TYPE, type)) return errorResponse('请选择收入或支出');
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
}, '创建记录失败');
