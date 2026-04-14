import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, parsePagination } from '@/lib/utils';

// GET /api/activities?entityType=project&entityId=xxx
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType') || '';
    const entityId = searchParams.get('entityId') || '';
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    const where: Record<string, unknown> = { userId };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.activityLog.count({ where }),
    ]);

    // 解析 metadata JSON
    const parsed = items.map(item => ({
      ...item,
      metadata: JSON.parse(item.metadata || '{}'),
    }));

    return successResponse({ items: parsed, total, page, pageSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取活动日志失败', 500);
  }
}
