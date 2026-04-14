import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// POST /api/feedback - 提交反馈
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { type, content, contact } = body;

    if (!type || !content?.trim()) {
      return errorResponse('请填写反馈内容');
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId,
        type,
        content: content.trim(),
        contact: contact?.trim() || '',
      },
    });

    return successResponse(feedback);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('提交反馈失败', 500);
  }
}
