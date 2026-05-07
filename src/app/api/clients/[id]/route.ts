import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/clients/[id] - 客户详情（含统计）
export const GET = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const [client, stats] = await Promise.all([
    prisma.client.findFirst({
      where: { id: params.id, userId },
      include: {
        projects: { orderBy: { updatedAt: 'desc' }, take: 10 },
        quotes: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, title: true, total: true, status: true, createdAt: true } },
        transactions: { orderBy: { date: 'desc' }, take: 10, select: { id: true, description: true, amount: true, type: true, date: true, category: true } },
        paymentNodes: { orderBy: { dueDate: 'asc' }, take: 10, include: { project: { select: { id: true, name: true } } } },
        _count: { select: { projects: true, transactions: true, quotes: true, paymentNodes: true } },
      },
    }),
    getClientStats(params.id, userId),
  ]);

  if (!client) return errorResponse('客户不存在', 404);
  return successResponse({ ...client, stats });
}, '获取客户详情失败');

async function getClientStats(clientId: string, userId: string) {
  const [
    totalIncome,
    totalExpense,
    projectsByStatus,
    paymentStats,
    quoteStats,
  ] = await Promise.all([
    // 累计收入
    prisma.transaction.aggregate({
      where: { userId, clientId, type: 'income' },
      _sum: { amount: true },
    }),
    // 累计支出
    prisma.transaction.aggregate({
      where: { userId, clientId, type: 'expense' },
      _sum: { amount: true },
    }),
    // 项目状态分布
    prisma.project.groupBy({
      by: ['status'],
      where: { userId, clientId },
      _count: true,
    }),
    // 回款统计
    Promise.all([
      prisma.paymentNode.aggregate({
        where: { userId, clientId, status: 'paid' },
        _sum: { paidAmount: true },
        _count: true,
      }),
      prisma.paymentNode.aggregate({
        where: { userId, clientId },
        _sum: { amount: true },
        _count: true,
      }),
    ]),
    // 报价转化
    Promise.all([
      prisma.quote.count({ where: { userId, clientId } }),
      prisma.quote.count({ where: { userId, clientId, status: 'accepted' } }),
    ]),
  ]);

  const [paidStats, totalPayments] = paymentStats;
  const [totalQuotes, acceptedQuotes] = quoteStats;
  const totalPaymentAmount = totalPayments._sum.amount || 0;
  const paidPaymentAmount = paidStats._sum.paidAmount || 0;

  return {
    totalIncome: totalIncome._sum.amount || 0,
    totalExpense: totalExpense._sum.amount || 0,
    profit: (totalIncome._sum.amount || 0) - (totalExpense._sum.amount || 0),
    projectsByStatus: projectsByStatus.reduce((acc, g) => {
      acc[g.status] = g._count;
      return acc;
    }, {} as Record<string, number>),
    paymentRate: totalPaymentAmount > 0
      ? Math.round((paidPaymentAmount / totalPaymentAmount) * 100)
      : 0,
    paidPaymentAmount,
    totalPaymentAmount,
    quoteConversionRate: totalQuotes > 0
      ? Math.round((acceptedQuotes / totalQuotes) * 100)
      : 0,
  };
}

// PUT /api/clients/[id] - 更新客户
export const PUT = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
  const body = await req.json();

  // 确认所有权
  const existing = await prisma.client.findFirst({ where: { id: params.id, userId } });
  if (!existing) return errorResponse('客户不存在', 404);

  const finalPhone = (body.phone ?? (existing.phone || '')).trim();
  const finalEmail = (body.email ?? (existing.email || '')).trim();
  if (!finalPhone && !finalEmail) {
    return errorResponse('电话和邮箱至少填写一项');
  }

  const client = await prisma.client.update({
    where: { id: params.id },
    data: {
      name: body.name ?? existing.name,
      contactPerson: body.contactPerson ?? existing.contactPerson,
      phone: body.phone ?? existing.phone,
      email: body.email ?? existing.email,
      wechat: body.wechat ?? existing.wechat,
      address: body.address ?? existing.address,
      tags: body.tags ?? existing.tags,
      notes: body.notes ?? existing.notes,
      source: body.source ?? existing.source,
      status: body.status ?? existing.status,
    },
  });

  return successResponse(client);
}, '更新客户失败');

// DELETE /api/clients/[id] - 软删除
export const DELETE = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const existing = await prisma.client.findFirst({ where: { id: params.id, userId } });
  if (!existing) return errorResponse('客户不存在', 404);

  await prisma.client.update({
    where: { id: params.id },
    data: { status: 'archived' },
  });

  return successResponse({ message: '客户已归档' });
}, '删除客户失败');
