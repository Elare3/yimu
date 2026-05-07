import { prisma } from '@/lib/prisma';
import { successResponse, parsePagination } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/activities?entityType=project&entityId=xxx
export const GET = withAuth(async (userId, req: Request) => {
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
}, '获取活动日志失败');
