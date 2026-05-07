import { prisma } from '@/lib/prisma';
import { successResponse, beijingMonthRange, beijingYMD } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/transactions/summary - 收支汇总（北京时间月度边界）
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') || '';

  // 默认当月（北京时间）
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (month) {
    const [year, m] = month.split('-').map(Number);
    if (!year || !m || m < 1 || m > 12) {
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
    const today = beijingYMD(now);
    const range = beijingMonthRange(today.year, today.month);
    startDate = range.start;
    endDate = range.end;
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
    },
  });

  let totalIncome = 0;
  let totalExpense = 0;
  const categoryMap: Record<string, { income: number; expense: number }> = {};

  for (const t of transactions) {
    if (t.type === 'income') {
      totalIncome += t.amount;
    } else {
      totalExpense += t.amount;
    }

    if (!categoryMap[t.category]) {
      categoryMap[t.category] = { income: 0, expense: 0 };
    }
    categoryMap[t.category][t.type as 'income' | 'expense'] += t.amount;
  }

  const categories = Object.entries(categoryMap).map(([name, data]) => ({
    name,
    income: data.income,
    expense: data.expense,
  }));

  // 总收入（所有时间）
  const allTimeAgg = await prisma.transaction.aggregate({
    where: { userId, type: 'income' },
    _sum: { amount: true },
  });
  const allTimeIncome = allTimeAgg._sum.amount || 0;

  return successResponse({
    totalIncome,
    totalExpense,
    profit: totalIncome - totalExpense,
    transactionCount: transactions.length,
    categories,
    allTimeIncome,
  });
}, '获取汇总失败');
