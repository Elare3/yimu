import { successResponse } from '@/lib/utils';
import {
  gatherInsightContext,
  buildRulesInsightResponse,
  smartGenerateInsight,
} from '@/lib/ai-orchestrator';
import { withAuth } from '@/lib/with-auth';
import { createNdjsonStream } from '@/lib/ai-stream';

// GET /api/dashboard/ai-insight - 规则引擎即时洞察（~200ms，无AI调用）
export const GET = withAuth(async (userId) => {
  const ctx = await gatherInsightContext(userId);
  const result = buildRulesInsightResponse(ctx);
  return successResponse(result);
}, '生成经营洞察失败');

/**
 * POST /api/dashboard/ai-insight — AI 深度洞察（规则 + AI，~10-20s）
 *
 * 改成 NDJSON 流式：客户端先看到 `{type:"progress", ...}` 阶段事件，
 * 最后收到 `{type:"result", data: {...}}`。把"卡住的 spinner"变成"动起来的进度提示"。
 *
 * 客户端用 src/lib/ai-stream.ts 的 consumeNdjsonStream 消费即可。
 */
export const POST = withAuth(async (userId) => {
  const stream = createNdjsonStream(async (emit) => {
    const result = await smartGenerateInsight(userId, {
      onProgress: (e) => emit({ type: 'progress', phase: e.phase, message: e.message }),
    });

    emit({
      type: 'result',
      data: {
        healthScore: result.healthScore,
        rulesHealthScore: result.rulesHealthScore,
        scoreDimensions: result.scoreDimensions,
        insights: result.insights,
        taxAlerts: result.taxAlerts,
        dataSnapshot: result.dataSnapshot,
        mode: result.mode,
      },
    });
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      // 禁用代理缓存，避免阶段事件被缓冲后一次性吐出（Nginx 默认会缓冲 application/* 响应）
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}, '生成经营洞察失败，请稍后重试');
