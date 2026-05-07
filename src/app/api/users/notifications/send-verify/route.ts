// ============================================================
// 发送邮箱验证邮件
// 使用 HMAC 签名 token 替代 DB 表（24h 内有效）
// ============================================================
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';
import { sendMail } from '@/lib/mailer';
import { renderEmailVerifyEmail } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

function signToken(userId: string, email: string): string {
  const exp = Date.now() + 24 * 60 * 60 * 1000; // 24h
  const payload = `${userId}.${email}.${exp}`;
  const secret = process.env.NEXTAUTH_SECRET || 'dev-secret';
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export const POST = withAuth(async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, emailVerified: true },
  });

  if (!user || !user.email) {
    return errorResponse('请先填写邮箱', 400);
  }

  if (user.emailVerified) {
    return errorResponse('邮箱已验证，无需重发', 400);
  }

  const token = signToken(userId, user.email);
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/users/notifications/verify?token=${token}`;

  const tpl = renderEmailVerifyEmail({
    userName: user.name || '',
    verifyUrl,
  });

  const result = await sendMail({
    to: user.email,
    subject: tpl.subject,
    html: tpl.html,
    userId,
    eventType: 'email.verify',
  });

  if (!result.ok) {
    if (result.reason === 'no_smtp') {
      return errorResponse('系统未配置 SMTP，请联系管理员', 503);
    }
    return errorResponse('邮件发送失败，请稍后重试', 500);
  }

  return successResponse({ sent: true, to: user.email });
}, '发送验证邮件失败');
