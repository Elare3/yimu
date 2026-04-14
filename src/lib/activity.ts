import { prisma } from '@/lib/prisma';

type LogParams = {
  userId: string;
  entityType: 'project' | 'client' | 'quote' | 'payment';
  entityId: string;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export async function logActivity(params: LogParams) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        description: params.description,
        metadata: JSON.stringify(params.metadata || {}),
      },
    });
  } catch (e) {
    // 日志写入失败不影响主业务
    console.error('Activity log error:', e);
  }
}
