import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { hashPassword, verifyPassword } from '@/lib/password';
import { isPreHashed } from '@/lib/client-password';
import { withAuth } from '@/lib/with-auth';

// POST /api/users/password - 设置或修改密码
export const POST = withAuth(async (userId, req: Request) => {
  const body = await req.json();
  const { currentPassword, newPassword } = body;

  // 客户端必须先做 SHA-256 预哈希（见 src/lib/client-password.ts），服务器只接受 64 位小写 hex
  if (!isPreHashed(newPassword)) {
    return errorResponse('密码格式不正确，请刷新页面后重试');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) return errorResponse('用户不存在', 404);

  if (user.passwordHash) {
    if (!isPreHashed(currentPassword)) {
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
}, '操作失败');
