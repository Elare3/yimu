import { successResponse, errorResponse } from '@/lib/utils';
import { smartAdjustQuote } from '@/lib/ai-orchestrator';
import { withAuth } from '@/lib/with-auth';

// POST /api/quotes/[id]/ai-adjust - AI二次调整报价
export const POST = withAuth(async (userId, req: Request, { params }: { params: { id: string } }) => {
  const { instruction } = await req.json();

  if (!instruction) return errorResponse('请输入调整指令');

  let result;
  try {
    result = await smartAdjustQuote({
      quoteId: params.id,
      userId,
      instruction,
    });
  } catch (e) {
    if (e instanceof Error && e.message === '报价单不存在') {
      return errorResponse('报价单不存在', 404);
    }
    throw e;
  }

  if (!result.success) {
    return errorResponse(result.error || 'AI调整报价失败', 500);
  }

  return successResponse(result);
}, 'AI调整报价失败，请稍后重试');
