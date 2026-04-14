import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// DELETE /api/users/account — 注销账号，级联删除所有用户数据
export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();

    // 需要请求体中的确认字段
    const body = await req.json();
    if (body.confirmation !== '删除') {
      return errorResponse('请输入"删除"以确认注销操作', 400);
    }

    // 级联删除所有关联数据（顺序：先删子表，再删主表）
    await Promise.all([
      prisma.aICallLog.deleteMany({ where: { userId } }),
      prisma.businessMemory.deleteMany({ where: { userId } }),
      prisma.pricingFeedback.deleteMany({ where: { userId } }),
      prisma.activityLog.deleteMany({ where: { userId } }),
    ]);

    // 删除有外键依赖的表
    await prisma.paymentNode.deleteMany({ where: { userId } });
    await prisma.quote.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.client.deleteMany({ where: { userId } });

    // 最后删除用户本身
    await prisma.user.delete({ where: { id: userId } });

    return successResponse({ deleted: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('账号注销失败:', e);
    return errorResponse('注销失败，请稍后重试', 500);
  }
}
