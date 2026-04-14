import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { errorResponse } from '@/lib/utils';

// GET /api/users/export — 导出当前用户的全部数据
export async function GET() {
  try {
    const userId = await requireUserId();

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

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="yimu-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('数据导出失败:', e);
    return errorResponse('导出失败', 500);
  }
}
