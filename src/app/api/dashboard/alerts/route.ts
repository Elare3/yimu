import { prisma } from '@/lib/prisma';
import {
  successResponse,
  beijingMidnight,
  beijingMonthRange,
  beijingQuarterStart,
  beijingYMD,
  daysUntilBeijing,
} from '@/lib/utils';
import { TAX_RULES_2026 } from '@/lib/rules';
import { withAuth } from '@/lib/with-auth';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// GET /api/dashboard/alerts — 主动提醒（逾期/到期/税务/截止日）
//
// 时区策略：所有"今天/明天/3 天内"的日历窗口按北京时间（UTC+8）计算，
// 不依赖服务器 TZ。底层用 lib/utils 里的纯偏移量算法，跨 UTC/Asia-Shanghai 行为一致。
//
// 返回结构：
//   { alerts: [...], digest: { ... } }
//   - alerts: 按优先级排序的明细列表（每项都可点击跳转），用于"今日明细"抽屉
//   - digest: 各类别 count + sum + worst(逾期最严重的客户) — 用于 Dashboard 顶部 hero 卡片
//             直接给总数，不被 take:5 截断
export const GET = withAuth(async (userId) => {
  const now = new Date();
  const todayBjMidnight = beijingMidnight(now); // 北京"今天 00:00"
  // 北京时间窗口：[今天 00:00, 第 N 天 00:00) — 半开区间，避免边界重复
  const tomorrowStart = new Date(todayBjMidnight.getTime() + 1 * 86_400_000);
  const tomorrowEnd = new Date(todayBjMidnight.getTime() + 2 * 86_400_000);
  const threeDaysEnd = new Date(todayBjMidnight.getTime() + 4 * 86_400_000); // 含今、明、后、大后
  const fiveDaysEnd = new Date(todayBjMidnight.getTime() + 6 * 86_400_000);

  // 当月起止（北京时间）
  const { year, month } = beijingYMD(now);
  const { start: monthStart, end: monthEnd } = beijingMonthRange(year, month);

  // 当季起止（北京时间）
  const quarterStart = beijingQuarterStart(now);
  const q = Math.floor((month - 1) / 3); // 0..3
  const { start: quarterEnd } = beijingMonthRange(
    q === 3 ? year + 1 : year,
    q === 3 ? 1 : (q + 1) * 3 + 1,
  );

  // 公共筛选条件：未结清状态
  // 注意：不要用 `as const`，Prisma 的 in 过滤器需要可变 string[]
  const unpaidStatuses = { in: ['pending', 'reminded'] };

  const [
    // ── 明细（用于 alerts 列表，take:5）──
    overduePayments,
    todayPayments,
    tomorrowPayments,
    laterDuePayments, // 后天 ~ 大后天
    deadlineProjects,
    expiringQuotes,
    // ── 聚合（用于 digest hero 卡片）──
    overdueAgg,
    todayAgg,
    tomorrowAgg,
    laterDueAgg,
    deadlineProjectsCount,
    expiringQuotesCount,
    // ── 税务用收入聚合 ──
    monthlyIncome,
    quarterlyIncome,
    overdueWorst,
  ] = await Promise.all([
    // 逾期收款 top 5
    prisma.paymentNode.findMany({
      where: { userId, status: unpaidStatuses, dueDate: { lt: todayBjMidnight } },
      include: { project: { select: { name: true } }, client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    // 今日到期 top 5
    prisma.paymentNode.findMany({
      where: {
        userId,
        status: unpaidStatuses,
        dueDate: { gte: todayBjMidnight, lt: tomorrowStart },
      },
      include: { project: { select: { name: true } }, client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    // 明天到期（全部，通常很少）
    prisma.paymentNode.findMany({
      where: {
        userId,
        status: unpaidStatuses,
        dueDate: { gte: tomorrowStart, lt: tomorrowEnd },
      },
      include: { project: { select: { name: true } }, client: { select: { name: true } } },
    }),
    // 后天 ~ 大后天 top 5
    prisma.paymentNode.findMany({
      where: {
        userId,
        status: unpaidStatuses,
        dueDate: { gte: tomorrowEnd, lt: threeDaysEnd },
      },
      include: { project: { select: { name: true } }, client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    // 5 天内截止项目 top 5
    prisma.project.findMany({
      where: {
        userId,
        status: { in: ['in_progress', 'review'] },
        deadline: { gte: todayBjMidnight, lt: fiveDaysEnd },
      },
      include: { client: { select: { name: true } } },
      orderBy: { deadline: 'asc' },
      take: 5,
    }),
    // 3 天内（含今天）即将过期的报价 top 5
    prisma.quote.findMany({
      where: {
        userId,
        status: 'sent',
        validUntil: { gte: todayBjMidnight, lt: threeDaysEnd },
      },
      include: { client: { select: { name: true } } },
      orderBy: { validUntil: 'asc' },
      take: 5,
    }),

    // ── 聚合区 ──
    prisma.paymentNode.aggregate({
      where: { userId, status: unpaidStatuses, dueDate: { lt: todayBjMidnight } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.paymentNode.aggregate({
      where: {
        userId,
        status: unpaidStatuses,
        dueDate: { gte: todayBjMidnight, lt: tomorrowStart },
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.paymentNode.aggregate({
      where: {
        userId,
        status: unpaidStatuses,
        dueDate: { gte: tomorrowStart, lt: tomorrowEnd },
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.paymentNode.aggregate({
      where: {
        userId,
        status: unpaidStatuses,
        dueDate: { gte: tomorrowEnd, lt: threeDaysEnd },
      },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.project.count({
      where: {
        userId,
        status: { in: ['in_progress', 'review'] },
        deadline: { gte: todayBjMidnight, lt: fiveDaysEnd },
      },
    }),
    prisma.quote.count({
      where: {
        userId,
        status: 'sent',
        validUntil: { gte: todayBjMidnight, lt: threeDaysEnd },
      },
    }),

    // 税务用
    prisma.transaction.aggregate({
      where: { userId, type: 'income', date: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'income', date: { gte: quarterStart, lt: quarterEnd } },
      _sum: { amount: true },
    }),
    // digest 里要展示"最严重的逾期客户"
    prisma.paymentNode.findFirst({
      where: { userId, status: unpaidStatuses, dueDate: { lt: todayBjMidnight } },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: 'asc' }, // 最早 due 的就是逾期最久的
    }),
  ]);

  // ─── alerts 明细（带优先级排序，给详情抽屉用）───
  type Alert = {
    id: string;
    type: 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'deadline' | 'quote_expiring' | 'tax';
    icon: string;
    message: string;
    link: string;
    priority: 'urgent' | 'warning' | 'info';
  };

  const alerts: Alert[] = [];

  // urgent: 逾期 → 今日 → 明日
  for (const p of overduePayments) {
    const overdueDays = -daysUntilBeijing(new Date(p.dueDate), now);
    alerts.push({
      id: `overdue-${p.id}`,
      type: 'overdue',
      icon: '🔴',
      message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 已逾期 ${overdueDays} 天`,
      link: '/payments',
      priority: 'urgent',
    });
  }
  for (const p of todayPayments) {
    alerts.push({
      id: `today-${p.id}`,
      type: 'today',
      icon: '⏰',
      message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 今天到期`,
      link: '/payments',
      priority: 'urgent',
    });
  }
  for (const p of tomorrowPayments) {
    alerts.push({
      id: `tomorrow-${p.id}`,
      type: 'tomorrow',
      icon: '⏰',
      message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 明天到期`,
      link: '/payments',
      priority: 'urgent',
    });
  }

  // warning: 后天/大后天到期
  for (const p of laterDuePayments) {
    const daysLeft = daysUntilBeijing(new Date(p.dueDate), now);
    alerts.push({
      id: `upcoming-${p.id}`,
      type: 'upcoming',
      icon: '💰',
      message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 还有 ${daysLeft} 天到期`,
      link: '/payments',
      priority: 'warning',
    });
  }

  // warning: 项目截止
  for (const p of deadlineProjects) {
    const daysLeft = daysUntilBeijing(new Date(p.deadline!), now);
    alerts.push({
      id: `deadline-${p.id}`,
      type: 'deadline',
      icon: '📋',
      message: `「${p.name}」(${p.client?.name || '客户'}) 截止日还剩 ${daysLeft} 天`,
      link: `/projects/${p.id}`,
      priority: 'warning',
    });
  }

  // info: 报价快过期
  for (const q of expiringQuotes) {
    if (!q.validUntil) continue;
    const daysLeft = daysUntilBeijing(new Date(q.validUntil), now);
    const dayWord = daysLeft === 0 ? '今天' : daysLeft === 1 ? '明天' : `${daysLeft} 天后`;
    alerts.push({
      id: `quote-${q.id}`,
      type: 'quote_expiring',
      icon: '📜',
      message: `发给 ${q.client?.name || '客户'} 的报价${dayWord}过期`,
      link: '/quotes',
      priority: 'info',
    });
  }

  // info: 税务
  const monthlyIncomeAmount = monthlyIncome._sum.amount ?? 0;
  const quarterlyIncomeAmount = quarterlyIncome._sum.amount ?? 0;
  const taxAlertMessages = TAX_RULES_2026.checkTaxThresholds({
    monthlyIncome: monthlyIncomeAmount,
    quarterlyIncome: quarterlyIncomeAmount,
    yearlyProfit: 0,
    entityType: 'individual',
  });
  for (let idx = 0; idx < taxAlertMessages.length; idx++) {
    alerts.push({
      id: `tax-${idx}`,
      type: 'tax',
      icon: '📊',
      message: taxAlertMessages[idx],
      link: '/finance',
      priority: 'info',
    });
  }

  // ─── digest（hero 卡片用）───
  // Prisma 的 _count: true 直接返回 number；_sum.amount 类型可能为 null
  const overdueCount = overdueAgg._count;
  const todayCount = todayAgg._count;
  const tomorrowCount = tomorrowAgg._count;
  const laterDueCount = laterDueAgg._count;

  const digest = {
    overdue: {
      count: overdueCount,
      amount: overdueAgg._sum.amount ?? 0,
      worstClient: overdueWorst?.client?.name || null,
      worstDays: overdueWorst ? -daysUntilBeijing(new Date(overdueWorst.dueDate), now) : 0,
    },
    today: {
      count: todayCount,
      amount: todayAgg._sum.amount ?? 0,
    },
    tomorrow: {
      count: tomorrowCount,
      amount: tomorrowAgg._sum.amount ?? 0,
    },
    upcoming: {
      // "后天 + 大后天"窗口
      count: laterDueCount,
      amount: laterDueAgg._sum.amount ?? 0,
    },
    projectDeadline: {
      count: deadlineProjectsCount,
    },
    quoteExpiring: {
      count: expiringQuotesCount,
    },
    tax: {
      count: taxAlertMessages.length,
    },
    // 总待办数（用于 hero 顶部"共 N 件"）
    totalUrgent: overdueCount + todayCount + tomorrowCount,
    totalAll:
      overdueCount +
      todayCount +
      tomorrowCount +
      laterDueCount +
      deadlineProjectsCount +
      expiringQuotesCount +
      taxAlertMessages.length,
  };

  return successResponse({ alerts, digest });
}, '获取提醒失败');
