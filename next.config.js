/** @type {import('next').NextConfig} */
const nextConfig = {
  // 压缩响应
  compress: true,
  // 优化打包
  experimental: {
    optimizePackageImports: ['recharts', '@dnd-kit/core', '@dnd-kit/sortable'],
  },
  // 关闭 X-Powered-By 头
  poweredByHeader: false,
  // 图片优化配置
  images: {
    remotePatterns: [],
    // 允许本地上传的头像图片
    unoptimized: false,
  },
};

export default nextConfig;
