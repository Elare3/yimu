import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { smartGenerateReminder } from '@/lib/ai-orchestrator';

// POST /api/payments/[id]/remind - AI生成催款文案（v3.0 规则定级+AI写文案版）
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    // 归属校验 + 状态校验（避免给他人节点催款 / 把已付节点打回 reminded）
    const existing = await prisma.paymentNode.findFirst({
      where: { id: params.id, userId },
      select: { status: true },
    });
    if (!existing) return errorResponse('收款节点不存在', 404);
    if (existing.status === 'paid') return errorResponse('该节点已收款，无需催款', 400);

    // 从请求中获取可选的附加信息
    let channelHint: 'wechat' | 'email' | undefined;
    try {
      const body = await req.json();
      channelHint = body?.channel;
    } catch {
      // 无请求体，使用默认值
    }

    // 通过AI调度器生成催款（规则定级别+利息计算+AI写文案+合规校验）
    const result = await smartGenerateReminder({
      paymentNodeId: params.id,
      userId,
      channelHint,
    });

    // 记录催款（写入关联表）
    await prisma.paymentNode.update({
      where: { id: params.id },
      data: {
        status: 'reminded',
        reminderCount: { increment: 1 },
        lastReminderAt: new Date(),
        reminderMessages: {
          create: {
            sentAt: new Date(),
            channel: result.channel,
            content: result.content,
            aiGenerated: true,
          },
        },
      },
    });

    // 检查用户手机号是否缺失，给前端提示
    const userForCheck = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    const warning = !userForCheck?.phone
      ? '建议在设置中补全手机号，让催款函更正式'
      : undefined;

    return successResponse({
      content: result.content,
      level: result.level,
      levelName: result.levelName,
      channel: result.channel,
      tone: result.tone,
      legalBasis: result.legalBasis,
      overdueInterest: result.overdueInterest,
      overdueDays: result.overdueDays,
      reminderCount: result.reminderCount,
      channels: result.channels,
      generatePDF: result.generatePDF,
      interest: result.interest,
      cacheHit: result.cacheHit,
      source: result.source,
      warning,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('催款失败:', e);
    return errorResponse('生成催款文案失败', 500);
  }
}
