import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

/**
 * 登录成功后由客户端调用，根据「记住我」重写 session cookie：
 *  - remember=false（默认）：session-only cookie，关闭浏览器即登出
 *  - remember=true：持久 cookie，Max-Age = 30 天
 *
 * 中间件已经做了：CSRF 校验（Origin/Referer）+ 登录态校验（没有 token 不放行）
 * JWT 本身有效期在 authOptions.session.maxAge = 30 天里已固定，这里只改 cookie 的过期。
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
  }

  let remember = false;
  try {
    const body = await req.json().catch(() => ({}));
    remember = Boolean(body?.remember);
  } catch {
    // ignore
  }

  const cookieName = process.env.ENABLE_HTTPS === 'true'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const token = req.cookies.get(cookieName)?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: '会话异常' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true, remember });

  // NextAuth 的 session cookie 支持分块（chunk）到 next-auth.session-token.0/.1……
  // 我们直接重写根 cookie 即可；如果存在分块，NextAuth 继续识别分块版本。
  // 这里保证：至少根 cookie 的 Max-Age 被覆盖为 session-only 或 30 天。
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.ENABLE_HTTPS === 'true',
    sameSite: 'lax',
    path: '/',
    // 关键：remember=false 时不设置 maxAge/expires → session-only cookie
    ...(remember ? { maxAge: 30 * 24 * 60 * 60 } : {}),
  });

  // 如果存在分块 cookie，同步改写（NextAuth 超过 ~4KB 会分块存储 JWT）
  for (let i = 0; i < 10; i++) {
    const chunkName = `${cookieName}.${i}`;
    const chunkValue = req.cookies.get(chunkName)?.value;
    if (!chunkValue) break;
    res.cookies.set(chunkName, chunkValue, {
      httpOnly: true,
      secure: process.env.ENABLE_HTTPS === 'true',
      sameSite: 'lax',
      path: '/',
      ...(remember ? { maxAge: 30 * 24 * 60 * 60 } : {}),
    });
  }

  return res;
}
