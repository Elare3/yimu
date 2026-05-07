'use client';

// ============================================================
// 一木 YiMu — 全局错误兜底页
//
// 触发场景：根 layout 自己崩溃了，或者其他 error.tsx 也接不住的极端错误。
// 这是浏览器最后能看到的东西，所以必须自带 <html><body>（替换掉 RootLayout）。
//
// 设计：温和、可恢复、给一个明确的退路。不要把 stack trace 直接 alert
// 给非技术用户看；非生产环境再展开调试。
// ============================================================

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 上报到 console，运维/SaaS 监控会捕到这个 digest
    console.error('[GlobalError]', error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: '100dvh',
          background: '#FAF6F0',
          color: '#2C2420',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#FFFFFF',
            border: '1.5px solid #E8E0D4',
            borderRadius: 18,
            padding: '32px 28px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>🪵</div>
          <h1
            style={{
              fontFamily: 'serif',
              fontSize: 20,
              fontWeight: 700,
              color: '#2C2420',
              marginBottom: 8,
            }}
          >
            出了点意外
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#7A6E62',
              lineHeight: 1.6,
              marginBottom: 24,
            }}
          >
            一木遇到了点麻烦没能继续。你的数据没有丢失，先刷新试一下。
            {error.digest && (
              <>
                <br />
                <span style={{ fontSize: 12, color: '#B5AA9E' }}>
                  错误码 {error.digest}
                </span>
              </>
            )}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                background: '#5B8C5A',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              重试
            </button>
            <button
              onClick={() => (window.location.href = '/dashboard')}
              style={{
                background: '#FAF6F0',
                color: '#2C2420',
                border: '1.5px solid #E8E0D4',
                padding: '10px 20px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              回到首页
            </button>
          </div>
          {isDev && (
            <pre
              style={{
                marginTop: 24,
                padding: 12,
                background: '#FDF0EF',
                color: '#C44536',
                fontSize: 11,
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                borderRadius: 8,
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {error.message}
              {error.stack && '\n\n' + error.stack}
            </pre>
          )}
        </div>
      </body>
    </html>
  );
}
