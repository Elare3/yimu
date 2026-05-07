import { prisma } from '@/lib/prisma';
import { successResponse, beijingMonthRange, beijingYMD } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/transactions/by-project — 按项目维度汇总收支（北京时间月度边界）
//
// 时区策略：原版用 new Date(yyyy, mm, 1) 走服务器本地 TZ，UTC 服务器会把
// 北京 5 月 1 日 00:30 的交易切到 4 月份。改用 beijingMonthRange 强制按北京时间切月。
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month') || '';

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
}, '获取项目汇总失败');
