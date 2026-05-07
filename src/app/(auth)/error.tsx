'use client';

// ============================================================
// 登录/注册页错误兜底
//
// 覆盖范围：(auth)/ 下的页面（login / register / forgot 等）。
// 这里不能假设用户已登录——所有跳转都指向 /login 而非 /dashboard。
// ============================================================

import { useEffect } from 'react';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AuthError]', error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 py-12 bg-cream-50">
      <div className="bg-white border-[1.5px] border-cream-300 rounded-card p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="font-serif text-lg font-bold text-brown-800 mb-2">
          登录页加载失败
        </h2>
        <p className="text-sm text-brown-300 leading-relaxed mb-6">
          先重试一下。如果反复出现，可能是网络问题，等等再来。
          {error.digest && (
            <>
              <br />
              <span className="text-xs text-brown-300/70">
                错误码 {error.digest}
              </span>
            </>
          )}
        </p>
        <button
          onClick={() => reset()}
          className="bg-olive text-white px-5 py-2.5 rounded-[12px] text-sm font-medium hover:bg-olive/90 transition-colors"
        >
          重试
        </button>

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
