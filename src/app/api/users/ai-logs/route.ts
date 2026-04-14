import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/users/ai-logs?days=7 — 查询当前用户的AI调用记录
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await prisma.aICallLog.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // 统计
    const total = logs.length;
    const cacheHitCount = logs.filter(l => l.cacheHit).length;
    const intentOnlyCount = logs.filter(l => l.dataSent === 'intent_only').length;
    const noneCount = logs.filter(l => l.dataSent === 'none').length;

    return successResponse({
      logs: logs.map(l => ({
        createdAt: l.createdAt.toISOString(),
        task: l.task,
        intentParams: l.intentParams,
        dataSent: l.dataSent,
        cacheHit: l.cacheHit,
      })),
      stats: {
        total,
        cacheHitCount,
        intentOnlyCount,
        noneCount,
        days,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('查询AI调用日志失败:', e);
    return errorResponse('查询失败', 500);
  }
}
