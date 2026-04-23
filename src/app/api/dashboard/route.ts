import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// GET /api/dashboard - 仪表盘聚合数据
export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // 并行查询各模块数据
    const [
      monthlyIncome,
      monthlyExpense,
      activeProjects,
      pendingPayments,
      recentProjects,
      upcomingPayments,
      monthlyTrend,
      quoteFunnel,
      overduePayments,
    ] = await Promise.all([
      // 本月收入
      prisma.transaction.aggregate({
        where: { userId, type: 'income', date: { gte: monthStart, lt: monthEnd } },
        _sum: { amount: true },
      }),
      // 本月支出
      prisma.transaction.aggregate({
        where: { userId, type: 'expense', date: { gte: monthStart, lt: monthEnd } },
        _sum: { amount: true },
      }),
      // 进行中项目数
      prisma.project.count({
        where: { userId, status: { in: ['in_progress', 'review'] } },
      }),
      // 待收款总额
      prisma.paymentNode.aggregate({
        where: { userId, status: { in: ['pending', 'reminded', 'overdue'] } },
        _sum: { amount: true },
        _count: true,
      }),
      // 最近项目（最近更新的5个）
      prisma.project.findMany({
        where: { userId, status: { not: 'cancelled' } },
        include: {
          client: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      // 即将到期收款（未来30天内，未收）
      prisma.paymentNode.findMany({
        where: {
          userId,
          status: { in: ['pending', 'reminded'] },
          dueDate: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
        },
        include: {
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      // 最近6个月收入趋势
      getMonthlyTrend(userId),
      // 报价漏斗统计
      getQuoteFunnel(userId),
      // 逾期收款数
      prisma.paymentNode.count({
        where: {
          userId,
          status: { in: ['pending', 'reminded'] },
          dueDate: { lt: now },
        },
      }),
    ]);

    const totalIncome = monthlyIncome._sum.amount || 0;
    const totalExpense = monthlyExpense._sum.amount || 0;

    return successResponse({
      summary: {
        totalIncome,
        totalExpense,
        profit: totalIncome - totalExpense,
        activeProjects,
        pendingPaymentAmount: pendingPayments._sum.amount || 0,
        pendingPaymentCount: pendingPayments._count || 0,
        overduePayments,
      },
      recentProjects,
      upcomingPayments,
      monthlyTrend,
      quoteFunnel,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('Dashboard error:', e);
    return errorResponse('获取仪表盘数据失败', 500);
  }
}

// 报价漏斗统计：各状态数量 + 转化率
async function getQuoteFunnel(userId: string) {
  const [total, draft, sent, accepted, rejected, expired] = await Promise.all([
    prisma.quote.count({ where: { userId } }),
    prisma.quote.count({ where: { userId, status: 'draft' } }),
    prisma.quote.count({ where: { userId, status: 'sent' } }),
    prisma.quote.count({ where: { userId, status: 'accepted' } }),
    prisma.quote.count({ where: { userId, status: 'rejected' } }),
    prisma.quote.count({ where: { userId, status: 'expired' } }),
  ]);

  const sentOrBeyond = sent + accepted + rejected + expired;
  const conversionRate = sentOrBeyond > 0 ? accepted / sentOrBeyond : 0;

  // 报价总金额统计
  const [acceptedAmount, totalAmount] = await Promise.all([
    prisma.quote.aggregate({
      where: { userId, status: 'accepted' },
      _sum: { total: true },
    }),
    prisma.quote.aggregate({
      where: { userId },
      _sum: { total: true },
    }),
  ]);

  return {
    total,
    draft,
    sent,
    accepted,
    rejected,
    expired,
    conversionRate: Math.round(conversionRate * 100),
    acceptedAmount: acceptedAmount._sum.total || 0,
    totalAmount: totalAmount._sum.total || 0,
  };
}

// 获取最近6个月的收支趋势
async function getMonthlyTrend(userId: string) {
  const months = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const label = `${start.getMonth() + 1}月`;

    const [income, expense] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId, type: 'income', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId, type: 'expense', date: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
    ]);

    months.push({
      month: label,
      income: income._sum.amount || 0,
      expense: expense._sum.amount || 0,
    });
  }

  return months;
}
