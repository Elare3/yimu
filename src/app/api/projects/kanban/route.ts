import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// 活跃状态（全量返回）
const ACTIVE_STATUSES = ['quoted', 'in_progress', 'review'];

// GET /api/projects/kanban - 看板视图数据（按status分组）
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const completedSearch = searchParams.get('completedSearch') || '';

    const completedWhere: Record<string, unknown> = { userId, status: 'completed' };
    if (completedSearch) {
      completedWhere.name = { contains: completedSearch, mode: 'insensitive' };
    }

    const [activeProjects, completedProjects, completedTotal] = await Promise.all([
      // 活跃项目：全量
      prisma.project.findMany({
        where: { userId, status: { in: ACTIVE_STATUSES } },
        include: { client: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      // 已完成项目：全量返回，搜索时最多20条
      prisma.project.findMany({
        where: completedWhere,
        include: { client: { select: { id: true, name: true } } },
        orderBy: { completedAt: 'desc' },
        take: completedSearch ? 20 : undefined,
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
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取看板数据失败', 500);
  }
}
