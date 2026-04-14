import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// POST /api/clients/batch — 批量操作客户
// body: { action: 'archive'|'activate'|'delete'|'tag', ids: string[], value?: string }
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { action, ids, value } = await req.json();

    if (!ids?.length) return errorResponse('请选择客户');
    if (!action) return errorResponse('请指定操作类型');

    // 验证所有客户属于当前用户
    const count = await prisma.client.count({
      where: { id: { in: ids }, userId },
    });
    if (count !== ids.length) {
      return errorResponse('部分客户不存在或无权操作');
    }

    const result: { affected: number } = { affected: 0 };

    switch (action) {
      case 'archive': {
        const updated = await prisma.client.updateMany({
          where: { id: { in: ids }, userId },
          data: { status: 'archived' },
        });
        result.affected = updated.count;
        break;
      }
      case 'activate': {
        const updated = await prisma.client.updateMany({
          where: { id: { in: ids }, userId },
          data: { status: 'active' },
        });
        result.affected = updated.count;
        break;
      }
      case 'delete': {
        // 检查是否有关联项目
        const projectCount = await prisma.project.count({
          where: { clientId: { in: ids }, status: { not: 'cancelled' } },
        });
        if (projectCount > 0) {
          return errorResponse(`选中客户有 ${projectCount} 个进行中的项目，请先处理项目后再删除`);
        }
        const deleted = await prisma.client.deleteMany({
          where: { id: { in: ids }, userId },
        });
        result.affected = deleted.count;
        break;
      }
      case 'tag': {
        if (!value) return errorResponse('请指定标签');
        let affected = 0;
        for (const id of ids) {
          const client = await prisma.client.findUnique({ where: { id }, select: { tags: true } });
          if (client && !client.tags.includes(value)) {
            await prisma.client.update({
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
