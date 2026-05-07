'use client';

// ============================================================
// 一木 YiMu — 组件级错误边界
//
// 用途：包在某个易碎的子组件外面（比如 recharts 图表、AI 洞察卡片），
//   让它崩溃时不会把整页拉下水。Next.js 的 error.tsx 是页面级的，
//   颗粒度更粗；这个用于"我只想保护这一块"的场景。
//
// 用法：
//   <ErrorBoundary fallback="此处图表加载失败">
//     <FragileChart />
//   </ErrorBoundary>
//
//   或自定义 fallback 节点：
//   <ErrorBoundary fallback={<MyEmpty />} onError={(e) => report(e)}>
//     ...
//   </ErrorBoundary>
//
// React 至今要求错误边界是 class 组件——hooks API 还没法实现。
// 这是少数我们必须用 class 的地方。
// ============================================================

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** 出错时显示的内容；字符串会用默认样式包一层，节点直接渲染 */
  fallback?: React.ReactNode;
  /** 可选错误回调，用于打点上报 */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 打 console，方便生产抓回溯；同时调用上层 onError 上报
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;

      // 字符串 fallback：用默认样式包一下，保持视觉协调
      if (typeof fallback === 'string' || fallback === undefined) {
        return (
          <div className="bg-cream-50/60 border-[1.5px] border-dashed border-cream-300 rounded-[14px] p-6 text-center">
            <div className="text-2xl mb-2 opacity-60">🪵</div>
            <p className="text-sm text-brown-300">
              {typeof fallback === 'string' ? fallback : '这一块暂时加载不出来'}
            </p>
          </div>
        );
      }

      // 节点 fallback：直接渲染
      return <>{fallback}</>;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
