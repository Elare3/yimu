/** @type {import('next').NextConfig} */
const nextConfig = {
  // 压缩响应
  compress: true,
  // 优化打包
  experimental: {
    optimizePackageImports: ['recharts', '@dnd-kit/core', '@dnd-kit/sortable'],
    missingSuspenseWithCSRBailout: false,
  },
  // 关闭 X-Powered-By 头
  poweredByHeader: false,
  // 图片优化配置
  images: {
    remotePatterns: [],
    // 允许本地上传的头像图片
    unoptimized: false,
  },
  // 安全响应头
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const csp = [
      "default-src 'self'",
      // Next.js 内联脚本需要 'unsafe-inline'；生产加 'strict-dynamic' 需 nonce，这里保守放行
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://dashscope.aliyuncs.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Content-Security-Policy', value: csp },
    ];
    if (isProd) {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' });
    }
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
