import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { smartAdjustQuote } from '@/lib/ai-orchestrator';

// POST /api/quotes/[id]/ai-adjust - AI二次调整报价
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();
    const { instruction } = await req.json();

    if (!instruction) return errorResponse('请输入调整指令');

    const result = await smartAdjustQuote({
      quoteId: params.id,
      userId,
      instruction,
    });

    if (!result.success) {
      return errorResponse(result.error || 'AI调整报价失败', 500);
    }

    return successResponse(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    if (e instanceof Error && e.message === '报价单不存在') {
      return errorResponse('报价单不存在', 404);
    }
    console.error('AI调整报价失败:', e);
    return errorResponse('AI调整报价失败，请稍后重试', 500);
  }
}
