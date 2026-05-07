import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// ── 简单内存速率限制器 ──
//
// 注意：基于内存的限流仅适用于单实例部署。多副本/横向扩容时各进程独立计数，
// 等于实际倍数放大限额。生产横扩前需要换 Redis/Upstash。
//
// 桶设计（多桶分摊不同成本，先短桶后长桶，命中即拒绝）：
//   • API 通用：每用户 60/min
//   • 登录回调：每 IP 10/10min（防爆破）
//   • 数据导出：每用户 3/hour（高敏感）
//   • AI 路由：每用户 20/min + 200/day（云端 AI 调用单次 ~10-30s 且按量计费）
//   • 验证码发送：每用户 3/min + 10/day（防短信/邮件轰炸）
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;
const LOGIN_WINDOW = 10 * 60_000;
const LOGIN_MAX = 10;
const EXPORT_WINDOW = 60 * 60_000;
const EXPORT_MAX = 3;
const AI_MIN_WINDOW = 60_000;
const AI_MIN_MAX = 20;
const AI_DAY_WINDOW = 24 * 60 * 60_000;
const AI_DAY_MAX = 200;
const VERIFY_MIN_WINDOW = 60_000;
const VERIFY_MIN_MAX = 3;
const VERIFY_DAY_WINDOW = 24 * 60 * 60_000;
const VERIFY_DAY_MAX = 10;
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

// 命中任意一个 AI 路由就走专用限流桶（这些调用慢且按量计费）
// 路径片段以 `/ai-` 开头是项目约定（ai-generate / ai-insight / ai-classify / ai-parse / ai-adjust）
function isAIRoute(pathname: string): boolean {
  return /\/api\/.+\/ai-[a-z]+(\/|$)/.test(pathname) || pathname.startsWith('/api/dashboard/ai-');
}

// 验证码/邮件发送类路径（防止用我们的服务器轰炸目标邮箱/短信）
function isVerifySendRoute(pathname: string): boolean {
  return pathname === '/api/users/notifications/send-verify';
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
    // 例外：/api/auth/callback/* 由 NextAuth 自己的双重提交 cookie（next-auth.csrf-token）
    // 保护 —— 跨站攻击者拿不到该 cookie 也算不出正确的 token|hash，安全等级等价。
    // 而部分移动浏览器 / 运营商代理 / 微信 WebView 会把 Origin 和 Referer 都剥掉，
    // 放在这里校验会导致移动端登录/注册全部 403。所以 callback 这段由 NextAuth 独自把关。
    const isNextAuthCallback = pathname.startsWith('/api/auth/callback/');
    if (pathname.startsWith('/api/') && !isNextAuthCallback && !isCsrfSafe(req)) {
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

    // ── AI 路由限流：每用户 20/min + 200/day（双桶，先短后长） ──
    // AI 单次调用慢且按量付费，必须比通用 60/min 桶更紧。两个桶同时计数：
    // 短桶防瞬时刷接口卡住前端，长桶防整天慢慢刷。
    if (isAIRoute(pathname)) {
      const uid = (token?.id as string) || clientIp(req);
      if (!checkLimit(`ai-min:${uid}`, AI_MIN_WINDOW, AI_MIN_MAX)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: 'AI 请求过于频繁，请稍后再试' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
      if (!checkLimit(`ai-day:${uid}`, AI_DAY_WINDOW, AI_DAY_MAX)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '今日 AI 调用次数已达上限，明天再来' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '86400' } }
        );
      }
    }

    // ── 验证码发送限流：每用户 3/min + 10/day（防邮件/短信轰炸他人邮箱） ──
    if (isVerifySendRoute(pathname)) {
      const uid = (token?.id as string) || clientIp(req);
      if (!checkLimit(`verify-min:${uid}`, VERIFY_MIN_WINDOW, VERIFY_MIN_MAX)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '请稍候再试，验证码发送过于频繁' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } }
        );
      }
      if (!checkLimit(`verify-day:${uid}`, VERIFY_DAY_WINDOW, VERIFY_DAY_MAX)) {
        return new NextResponse(
          JSON.stringify({ success: false, error: '今日验证码发送次数已达上限' }),
          { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '86400' } }
        );
      }
    }

    // ── API速率限制：每用户每分钟60次（通用兜底，前面专用桶都未命中时检查） ──
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
    '/api/feedback',
    '/api/onboarding',
    '/api/pricing-feedback',
    '/api/business-memory',
    '/api/activities',
    '/api/contracts/:path*',
    '/api/auth/callback/:path*',
    '/api/auth/persist-session',
  ],
};
