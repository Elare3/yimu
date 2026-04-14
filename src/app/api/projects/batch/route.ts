import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// POST /api/projects/batch — 批量操作项目
// body: { action: 'delete'|'status'|'tag', ids: string[], value?: string }
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { action, ids, value } = await req.json();

    if (!ids?.length) return errorResponse('请选择项目');
    if (!action) return errorResponse('请指定操作类型');

    // 验证所有项目属于当前用户
    const count = await prisma.project.count({
      where: { id: { in: ids }, userId },
    });
    if (count !== ids.length) {
      return errorResponse('部分项目不存在或无权操作');
    }

    const result: { affected: number } = { affected: 0 };

    switch (action) {
      case 'delete': {
        // 批量取消（软删除）
        const updated = await prisma.project.updateMany({
          where: { id: { in: ids }, userId },
          data: { status: 'cancelled' },
        });
        result.affected = updated.count;
        break;
      }
      case 'status': {
        if (!value) return errorResponse('请指定目标状态');
        const validStatuses = ['quoted', 'in_progress', 'review', 'completed', 'cancelled'];
        if (!validStatuses.includes(value)) return errorResponse('无效的状态');

        const updateData: Record<string, unknown> = { status: value };
        if (value === 'completed') updateData.completedAt = new Date();
        if (value === 'in_progress') updateData.startDate = new Date();

        const updated = await prisma.project.updateMany({
          where: { id: { in: ids }, userId },
          data: updateData,
        });
        result.affected = updated.count;
        break;
      }
      case 'tag': {
        if (!value) return errorResponse('请指定标签');
        // 逐个更新（MongoDB 不支持 arrayPush 在 updateMany）
        let affected = 0;
        for (const id of ids) {
          const project = await prisma.project.findUnique({ where: { id }, select: { tags: true } });
          if (project && !project.tags.includes(value)) {
            await prisma.project.update({
              where: { id },
              data: { tags: { push: value } },
            });
            affected++;
          }
        }
        result.affected = affected;
        break;
      }
      default:
        return errorResponse('不支持的操作类型');
    }

    return successResponse(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('批量操作失败:', e);
    return errorResponse('批量操作失败', 500);
  }
}
