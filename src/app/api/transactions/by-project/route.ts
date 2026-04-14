import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/transactions/by-project — 按项目维度汇总收支
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
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    // 获取关联项目的交易
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
        projectId: true,
        project: { select: { id: true, name: true, totalAmount: true, status: true } },
      },
      orderBy: { date: 'desc' },
    });

    // 按项目分组
    const projectMap: Record<string, {
      projectId: string | null;
      projectName: string;
      projectStatus: string;
      projectBudget: number;
      income: number;
      expense: number;
      profit: number;
      transactionCount: number;
      transactions: { type: string; amount: number; category: string; description: string; date: Date }[];
    }> = {};

    for (const t of transactions) {
      const key = t.projectId || '__unlinked__';
      if (!projectMap[key]) {
        projectMap[key] = {
          projectId: t.projectId,
          projectName: t.project?.name || '未关联项目',
          projectStatus: t.project?.status || '',
          projectBudget: t.project?.totalAmount || 0,
          income: 0,
          expense: 0,
          profit: 0,
          transactionCount: 0,
          transactions: [],
        };
      }
      if (t.type === 'income') {
        projectMap[key].income += t.amount;
      } else {
        projectMap[key].expense += t.amount;
      }
      projectMap[key].profit = projectMap[key].income - projectMap[key].expense;
      projectMap[key].transactionCount++;
      projectMap[key].transactions.push({
        type: t.type,
        amount: t.amount,
        category: t.category,
        description: t.description,
        date: t.date,
      });
    }

    const projects = Object.values(projectMap).sort((a, b) => b.income - a.income);

    return successResponse({ projects });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取项目汇总失败', 500);
  }
}
