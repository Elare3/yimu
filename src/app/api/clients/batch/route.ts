import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// POST /api/clients/batch — 批量操作客户
// body: { action: 'archive'|'activate'|'delete'|'tag', ids: string[], value?: string }
export const POST = withAuth(async (userId, req: Request) => {
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
      // 只更新尚未包含该标签的客户，避免 N+1
      const clientsToTag = await prisma.client.findMany({
        where: { id: { in: ids }, userId, NOT: { tags: { has: value } } },
        select: { id: true },
      });
      if (clientsToTag.length > 0) {
        await Promise.all(
          clientsToTag.map(c =>
            prisma.client.update({ where: { id: c.id }, data: { tags: { push: value } } })
          )
        );
      }
      result.affected = clientsToTag.length;
      break;
    }
    default:
      return errorResponse('不支持的操作类型');
  }

  return successResponse(result);
}, '批量操作失败');
