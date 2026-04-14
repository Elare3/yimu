import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import {
  gatherInsightContext,
  buildRulesInsightResponse,
  smartGenerateInsight,
} from '@/lib/ai-orchestrator';

// GET /api/dashboard/ai-insight - 规则引擎即时洞察（~200ms，无AI调用）
export async function GET() {
  try {
    const userId = await requireUserId();
    const ctx = await gatherInsightContext(userId);
    const result = buildRulesInsightResponse(ctx);
    return successResponse(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('规则洞察生成失败:', e);
    return errorResponse('生成经营洞察失败', 500);
  }
}

// POST /api/dashboard/ai-insight - AI深度洞察（规则+AI，~10-20s）
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await smartGenerateInsight(userId);

    return successResponse({
      healthScore: result.healthScore,
      rulesHealthScore: result.rulesHealthScore,
      scoreDimensions: result.scoreDimensions,
      insights: result.insights,
      taxAlerts: result.taxAlerts,
      dataSnapshot: result.dataSnapshot,
      mode: result.mode,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('AI洞察生成失败:', e);
    return errorResponse('生成经营洞察失败，请稍后重试', 500);
  }
}
