import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/transactions/by-week — 按周维度汇总收支时间线
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || '';

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (month) {
      const [year, m] = month.split('-').map(Number);
      startDate = new Date(year, m - 1, 1);
      endDate = new Date(year, m, 1);
    } else {
      // 默认最近8周
      startDate = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);
      endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
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

    // 按周分组 (ISO周)
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
      // 获取周一作为周起始
      const day = d.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const key = monday.toISOString().split('T')[0];
      const weekLabel = `${monday.getMonth() + 1}/${monday.getDate()} - ${sunday.getMonth() + 1}/${sunday.getDate()}`;

      if (!weekMap[key]) {
        weekMap[key] = {
          weekLabel,
          weekStart: key,
          weekEnd: sunday.toISOString().split('T')[0],
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
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取周汇总失败', 500);
  }
}
