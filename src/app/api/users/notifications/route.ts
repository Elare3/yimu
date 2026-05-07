// ============================================================
// 通知设置 API
// - PUT 更新邮箱（自动重置 emailVerified=false，等用户点验证邮件再变 true）
// - PUT 更新通知偏好开关
// ============================================================
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

const EMAIL_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

export const PUT = withAuth(async (userId, req: Request) => {
  const body = await req.json();
  const { email, notifyOverdue, notifyDueSoon, notifyQuoteExpiring } = body;

  const updateData: Record<string, unknown> = {};

  // 邮箱：传空字符串 → 清除邮箱；传新邮箱 → 校验 + 重置 emailVerified
  if (email !== undefined) {
    if (email === '' || email === null) {
      updateData.email = null;
      updateData.emailVerified = false;
    } else if (typeof email === 'string' && EMAIL_RE.test(email.trim())) {
      const normalized = email.trim().toLowerCase();
      // 检查是否被其他用户占用
      const existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing && existing.id !== userId) {
        return errorResponse('该邮箱已被其他账户使用');
      }
      // 当前用户已经验证过同一个邮箱：不重置
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true },
      });
      const sameEmail = current?.email === normalized;
      updateData.email = normalized;
      updateData.emailVerified = sameEmail ? (current?.emailVerified ?? false) : false;
    } else {
      return errorResponse('邮箱格式不正确');
    }
  }

  if (notifyOverdue !== undefined) updateData.notifyOverdue = !!notifyOverdue;
  if (notifyDueSoon !== undefined) updateData.notifyDueSoon = !!notifyDueSoon;
  if (notifyQuoteExpiring !== undefined) updateData.notifyQuoteExpiring = !!notifyQuoteExpiring;

  if (Object.keys(updateData).length === 0) {
    return errorResponse('没有需要更新的内容');
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      email: true,
      emailVerified: true,
      notifyOverdue: true,
      notifyDueSoon: true,
      notifyQuoteExpiring: true,
    },
  });

  return successResponse(user);
}, '更新通知设置失败');
