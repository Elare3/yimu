import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// ── 简单内存速率限制器（每用户每分钟60次） ──
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// 定期清理过期条目（防内存泄漏）
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  });
}, 60_000);

export default withAuth(
  async function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // ── API速率限制：每用户每分钟60次 ──
    if (pathname.startsWith('/api/')) {
      const userId = (token?.id as string) || req.headers.get('x-forwarded-for') || 'anonymous';
      if (!checkRateLimit(userId)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '请求过于频繁，请稍后再试' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
    }

    // 已登录且需要引导设置 → 重定向到 /onboarding
    if (
      token?.needsOnboarding === true &&
      !pathname.startsWith('/onboarding') &&
      !pathname.startsWith('/api/')
    ) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }

    // 已完成引导但访问 /onboarding → 重定向到 /dashboard
    if (
      token?.needsOnboarding !== true &&
      pathname.startsWith('/onboarding')
    ) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/clients/:path*',
    '/projects/:path*',
    '/quotes/:path*',
    '/finance/:path*',
    '/payments/:path*',
    '/settings/:path*',
    '/api/clients/:path*',
    '/api/projects/:path*',
    '/api/quotes/:path*',
    '/api/transactions/:path*',
    '/api/payments/:path*',
    '/api/dashboard/:path*',
    '/api/notifications/:path*',
    '/api/users/:path*',
  ],
};
