import { preload } from 'swr';

/**
 * 路由 → API 端点映射
 * 当用户 hover 导航链接时，提前预取目标页面的数据
 * 这样切换页面时 SWR 缓存已有数据，页面瞬间渲染
 */

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// 记录已预取的路由，避免重复请求
const preloaded = new Set<string>();

/** 获取当前月份字符串，与 finance 页面初始化逻辑一致 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 路由 → 需要预取的 API 列表 */
function getApisForRoute(href: string): string[] {
  switch (href) {
    case '/dashboard':
      return ['/api/dashboard', '/api/dashboard/alerts'];
    case '/clients':
      return ['/api/clients?'];
    case '/projects':
      return ['/api/projects/kanban'];
    case '/quotes':
      return ['/api/quotes?'];
    case '/finance': {
      const m = getCurrentMonth();
      return [
        `/api/transactions?month=${m}`,
        `/api/transactions/summary?month=${m}`,
      ];
    }
    case '/payments':
      return ['/api/payments?'];
    case '/settings':
      return ['/api/users/profile'];
    default:
      return [];
  }
}

export function preloadRoute(href: string) {
  if (preloaded.has(href)) return;
  preloaded.add(href);

  const apis = getApisForRoute(href);
  for (const api of apis) {
    preload(api, fetcher);
  }

  // 30秒后允许重新预取（数据可能已过期）
  setTimeout(() => preloaded.delete(href), 30_000);
}
