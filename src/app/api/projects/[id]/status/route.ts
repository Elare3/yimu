import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { PROJECT_STATUS_LABELS as STATUS_LABELS } from '@/lib/constants';
import { logActivity } from '@/lib/activity';
import { PROJECT_STATE_MACHINE } from '@/lib/rules';
import { emit } from '@/lib/events';
import { withAuth } from '@/lib/with-auth';

// PUT /api/projects/[id]/status - 更新项目状态（v3.0 规则状态机+事件总线版）
export const PUT = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
  const { status: newStatus } = await req.json();

  if (!newStatus) {
    return errorResponse('请提供目标状态');
  }

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
  });
  if (!project) {
    return errorResponse('项目不存在', 404);
  }

  const currentStatus = project.status;

  // 使用规则引擎的状态机校验（替代原来 utils 中的 STATUS_TRANSITIONS）
  if (!PROJECT_STATE_MACHINE.canTransition(currentStatus, newStatus)) {
    const currentLabel = STATUS_LABELS[currentStatus] || currentStatus;
    const targetLabel = STATUS_LABELS[newStatus] || newStatus;
    return errorResponse(
      `无法从「${currentLabel}」变更为「${targetLabel}」`
    );
  }

  // 构建更新数据
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'in_progress' && !project.startDate) {
    updateData.startDate = new Date();
  }
  if (newStatus === 'completed') {
    updateData.completedAt = new Date();
  }
  if (newStatus === 'quoted' && currentStatus === 'cancelled') {
    updateData.completedAt = null;
  }

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: updateData,
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  // 记录活动日志
  const currentLabel = STATUS_LABELS[currentStatus] || currentStatus;
  const targetLabel = STATUS_LABELS[newStatus] || newStatus;
  await logActivity({
    userId,
    entityType: 'project',
    entityId: params.id,
    action: 'status_changed',
    description: `项目「${updated.name}」状态从「${currentLabel}」变更为「${targetLabel}」`,
    metadata: { from: currentStatus, to: newStatus },
  });

  // 触发事件总线：执行跨模块副作用
  await emit('project.status_changed', {
    projectId: params.id,
    userId,
    from: currentStatus,
    to: newStatus,
  });

  return successResponse(updated);
}, '状态变更失败');
