import { prisma } from '@/lib/prisma';
import {
  successResponse,
  beijingMonthRange,
  beijingMidnight,
  beijingWeekStart,
  beijingYMD,
  formatBeijingDate,
} from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/transactions/by-week — 按周维度汇总收支时间线（北京时间 ISO 周，周一开始）
//
// 时区策略：所有"周/月"边界按北京时间。原版用 d.getDay()/setHours/Date(yyyy,mm,dd)，
// UTC 服务器会把北京周日 23:30 的交易归入"下一周"。改用 lib/utils 里的 helpers。
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') || '';

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (month) {
    const [year, m] = month.split('-').map(Number);
    if (!year || !m || m < 1 || m > 12) {
      // 兜底：参数非法 → 当月
      const today = beijingYMD(now);
      const range = beijingMonthRange(today.year, today.month);
      startDate = range.start;
      endDate = range.end;
    } else {
      const range = beijingMonthRange(year, m);
      startDate = range.start;
      endDate = range.end;
    }
  } else {
    // 默认最近 8 周（按北京"今天 00:00"为锚，向前 8*7 天起）
    const todayBj = beijingMidnight(now);
    startDate = new Date(todayBj.getTime() - 8 * 7 * 86_400_000);
    endDate = new Date(todayBj.getTime() + 86_400_000); // 含今天
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startDate, lt: endDate },
    },
    select: {
      type: true,
      amount: true,
      category: true,
      description: true,
      date: true,
    },
    orderBy: { date: 'asc' },
  });

  // 按周分组 (北京 ISO 周，周一为起始)
  const weekMap: Record<string, {
    weekLabel: string;
    weekStart: string;
    weekEnd: string;
    income: number;
    expense: number;
    profit: number;
    transactionCount: number;
    transactions: { type: string; amount: number; category: string; description: string; date: Date }[];
  }> = {};

  for (const t of transactions) {
    const d = new Date(t.date);
    const monday = beijingWeekStart(d); // 北京周一 00:00 的绝对时刻
    const sunday = new Date(monday.getTime() + 6 * 86_400_000); // 周日 00:00（北京）

    const key = formatBeijingDate(monday); // YYYY-MM-DD（北京）
    const sundayKey = formatBeijingDate(sunday);
    const mondayYMD = beijingYMD(monday);
    const sundayYMD = beijingYMD(sunday);
    const weekLabel = `${mondayYMD.month}/${mondayYMD.day} - ${sundayYMD.month}/${sundayYMD.day}`;

    if (!weekMap[key]) {
      weekMap[key] = {
        weekLabel,
        weekStart: key,
        weekEnd: sundayKey,
        income: 0,
        expense: 0,
        profit: 0,
        transactionCount: 0,
        transactions: [],
      };
    }

    if (t.type === 'income') {
      weekMap[key].income += t.amount;
    } else {
      weekMap[key].expense += t.amount;
    }
    weekMap[key].profit = weekMap[key].income - weekMap[key].expense;
    weekMap[key].transactionCount++;
    weekMap[key].transactions.push({
      type: t.type,
      amount: t.amount,
      category: t.category,
      description: t.description,
      date: t.date,
    });
  }

  const weeks = Object.values(weekMap).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  return successResponse({ weeks });
}, '获取周汇总失败');
