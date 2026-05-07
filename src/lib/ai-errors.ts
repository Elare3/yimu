// ============================================================
// 一木 YiMu — AI 错误分类（A3）
//
// 把所有 AI 调用失败收敛到一个 AIError，按 kind 区分：
//   • timeout / parse / schema / rate-limit / http / auth / unknown
//
// 关键属性 retryable —— callAIWithFallback 据此决定是否值得换降级配置重试：
//   • timeout / http(5xx) / schema / parse → 可重试
//   • rate-limit / auth → 不重试（再调一次也是同样错）
//   • unknown → 保守不重试，避免把成本花在无解错误上
//
// orchestrator 接住 AIError 后可以按 kind 决定走规则兜底还是返回错误给前端。
// ============================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

export type AIErrorKind =
  | 'timeout'      // AbortController 超时
  | 'parse'        // JSON.parse 失败
  | 'schema'       // Zod 校验失败
  | 'rate-limit'   // HTTP 429 / quota 类错误
  | 'http'         // 其他 HTTP 错误
  | 'auth'         // 401 / 403 / API key 无效
  | 'empty'        // AI 返回空字符串 / null
  | 'unknown';     // 兜底，不分类的网络/运行时错误

export class AIError extends Error {
  public readonly kind: AIErrorKind;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly raw?: string;

  constructor(
    kind: AIErrorKind,
    message: string,
    options: { retryable?: boolean; status?: number; raw?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AIError';
    this.kind = kind;
    this.status = options.status;
    this.raw = options.raw;
    // 默认按 kind 推导 retryable，调用方可显式覆盖
    this.retryable = options.retryable ?? defaultRetryable(kind, options.status);
    if (options.cause !== undefined) {
      // ES2022 cause 属性，方便栈追踪
      (this as any).cause = options.cause;
    }
  }
}

function defaultRetryable(kind: AIErrorKind, status?: number): boolean {
  switch (kind) {
    case 'timeout':
    case 'parse':
    case 'schema':
    case 'empty':
      return true;
    case 'http':
      // 5xx 可重试；4xx 一般不重试（参数错就是错）
      return !status || status >= 500;
    case 'rate-limit':
    case 'auth':
      return false;
    case 'unknown':
    default:
      return false;
  }
}

/**
 * 把 HTTP 状态码 + body 映射成具体 AIError kind
 */
export function classifyHttpError(status: number, detail: string): AIError {
  if (status === 401 || status === 403) {
    return new AIError('auth', `AI auth failed (${status}): ${detail}`, { status });
  }
  if (status === 429) {
    return new AIError('rate-limit', `AI rate limited (429): ${detail}`, { status });
  }
  return new AIError('http', `AI HTTP ${status}: ${detail}`, { status });
}

/**
 * 把任意未知异常包成 AIError（保留原 message + cause）
 */
export function wrapUnknown(err: unknown): AIError {
  if (err instanceof AIError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AIError('unknown', message, { cause: err });
}

/** 类型守卫，给 orchestrator 用 */
export function isAIError(err: unknown): err is AIError {
  return err instanceof AIError;
}
