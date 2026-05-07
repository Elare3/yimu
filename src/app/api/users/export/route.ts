import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/with-auth';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// GET /api/users/export — 导出当前用户的全部数据
export const GET = withAuth(async (userId) => {
  const [user, clients, projects, quotes, transactions, paymentNodes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, phone: true, name: true, companyName: true,
        businessType: true, entityType: true, plan: true,
        privacyMode: true, settings: true, createdAt: true,
      },
    }),
    prisma.client.findMany({ where: { userId } }),
    prisma.project.findMany({ where: { userId } }),
    prisma.quote.findMany({ where: { userId } }),
    prisma.transaction.findMany({ where: { userId } }),
    prisma.paymentNode.findMany({ where: { userId } }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    user,
    clients,
    projects,
    quotes,
    transactions,
    paymentNodes,
  };

  // 审计：全量数据导出落 ActivityLog
  prisma.activityLog.create({
    data: {
      userId,
      entityType: 'export',
      entityId: userId,
      action: 'full_export',
      description: '导出全部账户数据',
      metadata: JSON.stringify({
        clients: clients.length,
        projects: projects.length,
        quotes: quotes.length,
        transactions: transactions.length,
        paymentNodes: paymentNodes.length,
      }),
    },
  }).catch((err) => console.error('[users/export] audit failed:', err));

  return new Response(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="yimu-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}, '导出失败');
