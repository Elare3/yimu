'use client';

// ============================================================
// Dashboard 区域错误兜底
//
// 覆盖范围：所有 (dashboard)/ 下的页面（dashboard / payments / projects / clients
//   / quotes / finance / settings）。Sidebar / Header 仍然会渲染，用户随时可以
//   通过左侧导航切到其他模块——避免一个模块崩溃把整个工作区拉下水。
//
// 触发场景：page.tsx 抛错、page 内 Suspense 抛错、API SWR throw 透传。
// 全局更上层的崩溃由 src/app/global-error.tsx 兜。
// ============================================================

import { useEffect } from 'react';
import Link from 'next/link';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError]', error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white border-[1.5px] border-cream-300 rounded-card p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-3">🌧️</div>
        <h2 className="font-serif text-lg font-bold text-brown-800 mb-2">
          这一页加载失败了
        </h2>
        <p className="text-sm text-brown-300 leading-relaxed mb-6">
          数据没问题，是这一页的渲染遇到了点小意外。先重试一下；如果还不行，回首页或换个模块再试。
          {error.digest && (
            <>
              <br />
              <span className="text-xs text-brown-300/70">
                错误码 {error.digest}
              </span>
            </>
          )}
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => reset()}
            className="bg-olive text-white px-5 py-2.5 rounded-[12px] text-sm font-medium hover:bg-olive/90 transition-colors"
          >
            重试
          </button>
          <Link
            href="/dashboard"
            className="bg-cream-50 text-brown-800 border-[1.5px] border-cream-300 px-5 py-2.5 rounded-[12px] text-sm font-medium hover:bg-cream-100 transition-colors"
          >
            回到首页
          </Link>
        </div>

        {isDev && (
          <pre className="mt-6 p-3 bg-[#FDF0EF] text-danger text-[11px] text-left whitespace-pre-wrap break-words rounded-[8px] max-h-48 overflow-auto">
            {error.message}
            {error.stack && '\n\n' + error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
