import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

const OWNER_PHONE = process.env.OWNER_PHONE || '';

// GET /api/feedback - 查询反馈列表（仅 Owner）
export const GET = withAuth(async (userId, req: Request) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneHash: true },
  });

  if (!OWNER_PHONE || !user) {
    return errorResponse('无权限', 403);
  }

  const { hmacPhone } = await import('@/lib/encryption');
  if (user.phoneHash !== hmacPhone(OWNER_PHONE)) {
    return errorResponse('无权限', 403);
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20')));
  const type = searchParams.get('type') || undefined;

  const where = type ? { type } : {};

  const [feedbacks, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.feedback.count({ where }),
  ]);

  return successResponse({ feedbacks, total, page, pageSize });
}, '查询反馈失败');

// POST /api/feedback - 提交反馈
export const POST = withAuth(async (userId, req: Request) => {
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
}, '提交反馈失败');
