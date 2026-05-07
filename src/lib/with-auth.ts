// ============================================================
// 一木 YiMu — API 路由通用包装器
//
// 47 个 route.ts 之前都重复这段：
//   try {
//     const userId = await requireUserId();
//     ... 业务逻辑 ...
//   } catch (e) {
//     if (e instanceof Error && e.message === 'Unauthorized') {
//       return errorResponse('请先登录', 401);
//     }
//     console.error('xxx', e);
//     return errorResponse('xxx失败', 500);
//   }
//
// 改成 withAuth 后：
//   export const GET = withAuth(async (userId) => { ... }, '获取列表失败');
//   export const POST = withAuth(async (userId, req) => { ... }, '创建失败');
//   export const DELETE = withAuth(
//     async (userId, _req, ctx: { params: { id: string } }) => { ... },
//     '删除失败'
//   );
//
// 业务逻辑里用 errorResponse('参数错误', 400) 直接 return —— 不会被吞掉。
// 业务逻辑里 throw 的非 Unauthorized 错误，由这里统一记 console.error + 返回 500。
// ============================================================

import { requireUserId } from '@/lib/session';
import { errorResponse } from '@/lib/utils';

type RouteHandler<TArgs extends unknown[]> = (
  userId: string,
  ...args: TArgs
) => Promise<Response>;

export function withAuth<TArgs extends unknown[]>(
  handler: RouteHandler<TArgs>,
  fallbackError = '操作失败'
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      const userId = await requireUserId();
      return await handler(userId, ...args);
    } catch (e) {
      if (e instanceof Error && e.message === 'Unauthorized') {
        return errorResponse('请先登录', 401);
      }
      // Next.js 在静态分析时通过抛 DynamicServerError 标识动态路由，
      // 必须原样抛出让 Next 自己捕获，否则会污染构建日志且可能导致路由被错标静态。
      if (e !== null && typeof e === 'object' && 'digest' in e &&
          typeof (e as { digest: unknown }).digest === 'string' &&
          (e as { digest: string }).digest.startsWith('DYNAMIC_SERVER_USAGE')) {
        throw e;
      }
      console.error(`[${fallbackError}]`, e);
      return errorResponse(fallbackError, 500);
    }
  };
}
