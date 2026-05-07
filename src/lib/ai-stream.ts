// ============================================================
// 一木 YiMu — AI 流式响应帮手（B 组）
//
// 不上 SSE 因为 EventSource 只支持 GET，业务侧很多都是 POST + body。
// 用 NDJSON（每行一个 JSON 对象）：服务端 ReadableStream 拼字节，客户端
// fetch + ReadableStream + TextDecoder 边读边按 \n 切就行，浏览器全兼容。
//
// 协议：
//   {"type":"progress","phase":"gathering","message":"收集数据..."}
//   {"type":"progress","phase":"ai","message":"小木思考中..."}
//   {"type":"result","data":{...最终结果}}
//   或者
//   {"type":"error","error":"...","kind":"timeout"}
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export type StreamEvent =
  | { type: 'progress'; phase: string; message: string; elapsedMs?: number }
  | { type: 'result'; data: any }
  | { type: 'error'; error: string; kind?: string };

/**
 * 服务端：把一系列 StreamEvent 包成 ReadableStream<Uint8Array>，可直接给 NextResponse(body)
 *
 * 用法：
 *   const stream = createNdjsonStream(async (emit) => {
 *     emit({ type: 'progress', phase: 'gather', message: '收集数据...' });
 *     const ctx = await gatherInsightContext(userId);
 *     emit({ type: 'progress', phase: 'ai', message: '小木思考中...' });
 *     const result = await smartGenerateInsight(userId, { onProgress: emit });
 *     emit({ type: 'result', data: result });
 *   });
 *   return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson' } });
 */
export function createNdjsonStream(
  producer: (emit: (event: StreamEvent) => void) => Promise<void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {
          // controller 已关闭（客户端断连），静默吞掉
        }
      };

      try {
        await producer(emit);
      } catch (err: any) {
        const message = err?.message || String(err);
        const kind = err?.kind || 'unknown';
        emit({ type: 'error', error: message, kind });
      } finally {
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
}

/**
 * 客户端：消费 NDJSON 流，按事件类型回调
 *
 * 用法：
 *   await consumeNdjsonStream(response, {
 *     onProgress: (e) => setStatus(e.message),
 *     onResult: (data) => setResult(data),
 *     onError: (e) => toast.error(e.error),
 *   });
 */
export async function consumeNdjsonStream(
  response: Response,
  handlers: {
    onProgress?: (event: Extract<StreamEvent, { type: 'progress' }>) => void;
    onResult?: (data: any) => void;
    onError?: (event: Extract<StreamEvent, { type: 'error' }>) => void;
  },
): Promise<void> {
  if (!response.ok || !response.body) {
    handlers.onError?.({ type: 'error', error: `HTTP ${response.status}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按行切，最后一段不完整的留给下一轮
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as StreamEvent;
          dispatchEvent(event, handlers);
        } catch {
          // 单行 JSON 解析失败：忽略这行，继续读后面的
          console.warn('[ai-stream] failed to parse line:', trimmed.slice(0, 100));
        }
      }
    }
    // flush 最后残留
    if (buffer.trim()) {
      try {
        dispatchEvent(JSON.parse(buffer.trim()) as StreamEvent, handlers);
      } catch { /* ignore */ }
    }
  } finally {
    reader.releaseLock();
  }
}

function dispatchEvent(
  event: StreamEvent,
  handlers: {
    onProgress?: (e: Extract<StreamEvent, { type: 'progress' }>) => void;
    onResult?: (d: any) => void;
    onError?: (e: Extract<StreamEvent, { type: 'error' }>) => void;
  },
): void {
  if (event.type === 'progress') handlers.onProgress?.(event);
  else if (event.type === 'result') handlers.onResult?.(event.data);
  else if (event.type === 'error') handlers.onError?.(event);
}

/**
 * orchestrator 内部用的进度回调签名
 * 用 noop 默认值，让 orchestrator 内现有代码无需改判空逻辑
 */
export type ProgressEmit = (event: { phase: string; message: string }) => void;

export const noopEmit: ProgressEmit = () => { /* noop */ };
