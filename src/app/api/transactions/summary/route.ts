import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/transactions/summary - 收支汇总
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || '';

    // 默认当月
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (month) {
      const [year, m] = month.split('-').map(Number);
      startDate = new Date(year, m - 1, 1);
      endDate = new Date(year, m, 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
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
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取汇总失败', 500);
  }
}
