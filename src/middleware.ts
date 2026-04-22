import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// ── 简单内存速率限制器 ──
// 业务 API：每用户每分钟 60 次
// 登录/注册：每 IP 每 10 分钟 10 次（防验证码/密码爆破）
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;
const LOGIN_WINDOW = 10 * 60_000;
const LOGIN_MAX = 10;
// 数据导出：每用户每小时 3 次
const EXPORT_WINDOW = 60 * 60_000;
const EXPORT_MAX = 3;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

function checkRateLimit(key: string): boolean {
  return checkLimit(key, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX);
}

// 定期清理过期条目（防内存泄漏）
if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    rateLimitMap.forEach((entry, key) => {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    });
    // 硬上限：防止极端情况下内存无限增长
    if (rateLimitMap.size > 10000) rateLimitMap.clear();
  }, 60_000);
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * CSRF 防护：对写请求校验 Origin/Referer 的 host 必须等于当前请求 host。
 * SameSite=Lax 已阻断大多数跨站 POST，这里作为双保险，也覆盖非浏览器客户端伪造 Origin 的情况。
 */
function isCsrfSafe(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

  const host = req.headers.get('host');
  if (!host) return false;

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  // 写请求但既没 Origin 也没 Referer：拒绝
  return false;
}

export default withAuth(
  async function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // ── CSRF 校验：对 /api/ 的写请求检查 Origin/Referer ──
    if (pathname.startsWith('/api/') && !isCsrfSafe(req)) {
      return new NextResponse(
        JSON.stringify({ success: false, error: '来源校验失败' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── 登录爆破防护：每 IP 每 10 分钟 10 次 ──
    // NextAuth 的凭证登录最终都会走 /api/auth/callback/{phone|password}
    if (pathname.startsWith('/api/auth/callback/')) {
      const ip = clientIp(req);
      if (!checkLimit(`login:${ip}`, LOGIN_WINDOW, LOGIN_MAX)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '登录尝试过于频繁，请 10 分钟后再试' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '600' } }
        );
      }
      return NextResponse.next();
    }

    // ── 数据导出限流：每用户每小时 3 次（高敏感操作独立桶） ──
    if (pathname === '/api/export' || pathname === '/api/users/export') {
      const key = `export:${(token?.id as string) || clientIp(req)}`;
      if (!checkLimit(key, EXPORT_WINDOW, EXPORT_MAX)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '导出过于频繁，每小时最多 3 次' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } }
        );
      }
    }

    // ── API速率限制：每用户每分钟60次 ──
    if (pathname.startsWith('/api/')) {
      const userId = (token?.id as string) || clientIp(req);
      if (!checkRateLimit(userId)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '请求过于频繁，请稍后再试' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: '/login',
    },
    callbacks: {
      // /api/auth/callback/* 无需已登录即可通过 middleware（否则登录请求会被重定向）
      authorized: ({ req, token }) => {
        if (req.nextUrl.pathname.startsWith('/api/auth/callback/')) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
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
    '/api/export',
    '/api/export/:path*',
    '/api/auth/callback/:path*',
  ],
};
