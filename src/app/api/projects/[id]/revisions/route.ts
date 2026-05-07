import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// POST /api/projects/[id]/revisions — 递增修订次数（含上限校验）
export const POST = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!project) return errorResponse('项目不存在', 404);

  // 上限校验
  if (project.revisionLimit !== null && project.revisionCount >= project.revisionLimit) {
    return errorResponse(
      `修订次数已达上限 (${project.revisionCount}/${project.revisionLimit})，需与客户协商增加修订次数`,
      400
    );
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: { revisionCount: { increment: 1 } },
    include: { client: { select: { id: true, name: true } } },
  });

  const remaining = updated.revisionLimit !== null
    ? updated.revisionLimit - updated.revisionCount
    : null;

  return successResponse({
    ...updated,
    revisionRemaining: remaining,
    reachedLimit: remaining !== null && remaining <= 0,
  });
}, '记录修订失败');

// PUT /api/projects/[id]/revisions — 更新修订上限
export const PUT = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
  const { revisionLimit } = await req.json();

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!project) return errorResponse('项目不存在', 404);

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: {
      revisionLimit: revisionLimit !== null && revisionLimit !== undefined
        ? parseInt(revisionLimit)
        : null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  return successResponse(updated);
}, '更新修订上限失败');
