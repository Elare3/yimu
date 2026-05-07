// ============================================================
// 邮箱验证回调
// GET /api/users/notifications/verify?token=xxx
// 成功后跳转到 /settings?verified=1
// ============================================================
import { NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split('.');
    if (parts.length !== 4) return null;
    const [userId, email, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || Date.now() > exp) return null;

    const secret = process.env.NEXTAUTH_SECRET || 'dev-secret';
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${userId}.${email}.${exp}`)
      .digest('hex')
      .slice(0, 32);

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return { userId, email };
  } catch {
    return null;
  }
}

function redirect(path: string, baseUrl: string) {
  const url = new URL(path, baseUrl);
  return NextResponse.redirect(url, 303);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`;

  const verified = verifyToken(token);
  if (!verified) {
    return redirect('/settings?verifyError=invalid', baseUrl);
  }

  // 把 emailVerified 设 true，但只在邮箱仍是 token 里那个邮箱时
  const user = await prisma.user.findUnique({
    where: { id: verified.userId },
    select: { email: true },
  });

  if (!user || user.email !== verified.email) {
    return redirect('/settings?verifyError=changed', baseUrl);
  }

  await prisma.user.update({
    where: { id: verified.userId },
    data: { emailVerified: true },
  });

  return redirect('/settings?verified=1', baseUrl);
}
