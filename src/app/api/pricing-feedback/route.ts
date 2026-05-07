import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, parsePagination } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// POST /api/pricing-feedback - 记录报价反馈（数据回流）
export const POST = withAuth(async (userId, req: Request) => {
  const body = await req.json();
  const { quoteId, clientId, outcome, finalAmount, rejectReason, clientFeedback, negotiationRounds } = body;

  if (!quoteId) return errorResponse('缺少报价单ID');
  if (!outcome) return errorResponse('缺少反馈结果');

  const validOutcomes = ['accepted', 'rejected', 'negotiated', 'expired_no_response'];
  if (!validOutcomes.includes(outcome)) return errorResponse('无效的反馈结果');

  // 验证报价单存在且属于当前用户
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, userId } });
  if (!quote) return errorResponse('报价单不存在');

  // 计算偏差
  const quoteAmount = quote.total;
  const deviation = (outcome === 'negotiated' && finalAmount != null)
    ? Math.round(((finalAmount - quoteAmount) / quoteAmount) * 10000) / 100
    : null;

  // 计算决策天数
  const daysToDecision = Math.floor(
    (Date.now() - new Date(quote.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const feedback = await prisma.pricingFeedback.create({
    data: {
      userId,
      quoteId,
      clientId: clientId || quote.clientId,
      outcome,
      quoteAmount,
      finalAmount: finalAmount ?? null,
      deviation,
      category: quote.title || '',
      rejectReason: rejectReason || '',
      clientFeedback: clientFeedback || '',
      negotiationRounds: negotiationRounds || 0,
      daysToDecision,
    },
  });

  // 同步更新报价单状态
  const statusMap: Record<string, string> = {
    accepted: 'accepted',
    rejected: 'rejected',
    negotiated: 'accepted',
    expired_no_response: 'expired',
  };
  await prisma.quote.update({
    where: { id: quoteId },
    data: { status: statusMap[outcome] },
  });

  return successResponse(feedback);
}, '记录报价反馈失败');

// GET /api/pricing-feedback - 获取报价反馈列表（用于数据分析）
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const outcome = searchParams.get('outcome') || '';
  const category = searchParams.get('category') || '';
  const { page, pageSize, skip, take } = parsePagination(searchParams);

  const where: Record<string, unknown> = { userId };
  if (outcome) where.outcome = outcome;
  if (category) where.category = { contains: category };

  const [items, total] = await Promise.all([
    prisma.pricingFeedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.pricingFeedback.count({ where }),
  ]);

  return successResponse({ items, total, page, pageSize });
}, '获取报价反馈列表失败');
