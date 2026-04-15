import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { hashPassword, verifyPassword } from '@/lib/password';

// POST /api/users/password - 设置或修改密码
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!newPassword || typeof newPassword !== 'string') {
      return errorResponse('请输入新密码');
    }
    if (newPassword.length < 6 || newPassword.length > 64) {
      return errorResponse('密码长度需为 6-64 位');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) return errorResponse('用户不存在', 404);

    if (user.passwordHash) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return errorResponse('请输入当前密码');
      }
      if (!verifyPassword(currentPassword, user.passwordHash)) {
        return errorResponse('当前密码错误');
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashPassword(newPassword) },
    });

    return successResponse({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('修改密码失败:', e);
    return errorResponse('操作失败', 500);
  }
}
