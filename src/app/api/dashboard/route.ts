import { prisma } from '@/lib/prisma';
import {
  successResponse,
  beijingMidnight,
  beijingMonthRange,
  beijingYMD,
} from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';
import {
  PAYMENT_UNPAID,
  PAYMENT_PENDING_OR_REMINDED,
  QUOTE_SENT_OR_BEYOND,
  type QuoteStatus,
} from '@/lib/constants';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// GET /api/dashboard - 仪表盘聚合数据
//
// 时区策略：所有月份/今天边界按北京时间（UTC+8）算。原版用 new Date(yyyy, mm, 1) 走的是
// 服务器本地 TZ，UTC 服务器会把"2026-05-01 BJ"的交易切到 4 月份。改用 lib/utils 里的
// 纯偏移量 helpers，跨 UTC / Asia-Shanghai 行为一致。
export const GET = withAuth(async (userId) => {
  const now = new Date();
  const todayBjMidnight = beijingMidnight(now);
  const { year, month } = beijingYMD(now); // month 1..12

  // 当月 [start, end)
  const { start: monthStart, end: monthEnd } = beijingMonthRange(year, month);

  // 6 个月趋势查询的下边界：当前月起向前数 5 个月的 1 号（北京时间）
  // 用 month - 5 自然处理跨年（month=2 → -3 → 上一年的 9 月）
  let trendYear = year;
  let trendMonth = month - 5;
  while (trendMonth < 1) {
    trendMonth += 12;
    trendYear -= 1;
  }
  const { start: trendStart } = beijingMonthRange(trendYear, trendMonth);

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
      where: { userId, status: { in: [...PAYMENT_UNPAID] } },
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
    // 即将到期收款（未来 30 天内，未收）— 从北京"今天 00:00"算起，避免 UTC 服务器把
    // 北京当天 23:00 的应收节点错误归到"已逾期"
    prisma.paymentNode.findMany({
      where: {
        userId,
        status: { in: [...PAYMENT_PENDING_OR_REMINDED] },
        dueDate: {
          gte: todayBjMidnight,
          lt: new Date(todayBjMidnight.getTime() + 30 * 86_400_000),
        },
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    // 最近 6 个月收支趋势（单条 SQL 聚合，原本是 12 次 aggregate 串行循环）
    getMonthlyTrend(userId, trendStart, monthEnd, year, month),
    // 报价漏斗统计（单条 groupBy + 单条 aggregate，原本是 8 次 count）
    getQuoteFunnel(userId),
    // 逾期收款数（dueDate 早于北京今天 00:00 视为逾期）
    prisma.paymentNode.count({
      where: {
        userId,
        status: { in: [...PAYMENT_PENDING_OR_REMINDED] },
        dueDate: { lt: todayBjMidnight },
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
}, '获取仪表盘数据失败');

// 报价漏斗统计：原版每个状态各 count 一次（5 次），再 count 总数（1 次），再 aggregate 金额（2 次）
// 改成：单次 groupBy + 单次 aggregate，从 8 次 DB 来回降到 2 次。
async function getQuoteFunnel(userId: string) {
  const [byStatus, totalAgg] = await Promise.all([
    prisma.quote.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.quote.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ]);

  // 把 groupBy 结果摊平成对象，方便取
  const counts: Record<QuoteStatus, number> = { draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 };
  let acceptedAmount = 0;
  for (const row of byStatus) {
    const s = row.status as QuoteStatus;
    if (s in counts) counts[s] = row._count._all;
    if (s === 'accepted') acceptedAmount = row._sum.total || 0;
  }

  const sentOrBeyond = QUOTE_SENT_OR_BEYOND.reduce((sum, s) => sum + counts[s], 0);
  const conversionRate = sentOrBeyond > 0 ? counts.accepted / sentOrBeyond : 0;

  return {
    total: totalAgg._count._all,
    draft: counts.draft,
    sent: counts.sent,
    accepted: counts.accepted,
    rejected: counts.rejected,
    expired: counts.expired,
    conversionRate: Math.round(conversionRate * 100),
    acceptedAmount,
    totalAmount: totalAgg._sum.total || 0,
  };
}

// 最近 6 个月收支趋势：原版在循环里跑 12 次 aggregate（串行 await，惨）。
// 改成单条 SQL：DATE_TRUNC('month', date AT TIME ZONE 'Asia/Shanghai') + GROUP BY，然后在
// JS 里组装成 [{ month, income, expense }] 的固定 6 行结构。从 12 次 DB 来回降到 1 次。
//
// 时区注意：必须 `AT TIME ZONE 'Asia/Shanghai'` 才能在北京时间维度切月，否则 UTC 服务器
// 会把"北京 5 月 1 日 00:00"的交易（UTC 4 月 30 日 16:00）错误归到 4 月。
// 返回的 month 是 timestamp（无 TZ），表示北京月初的"墙上时间"，可直接读 year/month。
async function getMonthlyTrend(
  userId: string,
  start: Date,
  end: Date,
  nowYear: number,
  nowMonth: number, // 1..12（北京时间）
) {
  type Row = { month: Date; type: string; total: number | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      DATE_TRUNC('month', "date" AT TIME ZONE 'Asia/Shanghai') AS month,
      "type",
      SUM("amount")::float8 AS total
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "date" >= ${start}
      AND "date" < ${end}
    GROUP BY DATE_TRUNC('month', "date" AT TIME ZONE 'Asia/Shanghai'), "type"
  `;

  // 摊到 "yyyy-mm" → { income, expense } 的 map。
  // 关键：r.month 是 `timestamp without time zone`，PG 驱动会按 UTC 反序列化成 JS Date。
  // 所以要用 getUTCFullYear/getUTCMonth 读出"墙上时间"的年月，否则又会被服务器 TZ 污染。
  const bucket = new Map<string, { income: number; expense: number }>();
  for (const r of rows) {
    const d = new Date(r.month);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`; // 1..12
    const cur = bucket.get(key) ?? { income: 0, expense: 0 };
    if (r.type === 'income') cur.income = Number(r.total) || 0;
    else if (r.type === 'expense') cur.expense = Number(r.total) || 0;
    bucket.set(key, cur);
  }

  // 输出固定 6 个月的有序数组（缺月填 0），从 5 个月前到当月
  const months: { month: string; income: number; expense: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    let y = nowYear;
    let m = nowMonth - i; // 可能 <= 0
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const key = `${y}-${m}`;
    const v = bucket.get(key) ?? { income: 0, expense: 0 };
    months.push({ month: `${m}月`, income: v.income, expense: v.expense });
  }
  return months;
}

