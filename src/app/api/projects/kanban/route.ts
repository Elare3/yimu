import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';
import { ACTIVE_PROJECT_STATUSES } from '@/lib/constants';

// GET /api/projects/kanban - 看板视图数据（按status分组）
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const completedSearch = searchParams.get('completedSearch') || '';

  const completedWhere: Record<string, unknown> = { userId, status: 'completed' };
  if (completedSearch) {
    completedWhere.name = { contains: completedSearch, mode: 'insensitive' };
  }

  const [activeProjects, completedProjects, completedTotal] = await Promise.all([
    // 活跃项目：全量
    prisma.project.findMany({
      where: { userId, status: { in: [...ACTIVE_PROJECT_STATUSES] } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    }),
    // 已完成项目：全量返回，搜索时最多20条
    prisma.project.findMany({
      where: completedWhere,
      include: { client: { select: { id: true, name: true } } },
      orderBy: { completedAt: 'desc' },
      take: completedSearch ? 20 : 50,
    }),
    // 已完成总数
    prisma.project.count({
      where: { userId, status: 'completed' },
    }),
  ]);

  // 按状态分组
  const columns: Record<string, typeof activeProjects> = {
    quoted: [],
    in_progress: [],
    review: [],
    completed: completedProjects,
  };

  for (const project of activeProjects) {
    if (columns[project.status]) {
      columns[project.status].push(project);
    }
  }

  return successResponse({ columns, completedTotal });
}, '获取看板数据失败');
