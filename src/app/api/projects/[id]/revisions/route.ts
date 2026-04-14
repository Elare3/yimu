import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// POST /api/projects/[id]/revisions — 递增修订次数（含上限校验）
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

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
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('记录修订失败', 500);
  }
}

// PUT /api/projects/[id]/revisions — 更新修订上限
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
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
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('更新修订上限失败', 500);
  }
}
