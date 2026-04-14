import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// POST /api/quotes/[id]/duplicate — 复制报价单
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await requireUserId();

    const original = await prisma.quote.findFirst({
      where: { id: params.id, userId },
    });
    if (!original) return errorResponse('报价单不存在', 404);

    // 生成新编号
    const count = await prisma.quote.count({ where: { userId } });
    const quoteNumber = `Q${new Date().getFullYear()}${String(count + 1).padStart(4, '0')}`;

    // 复制报价单（重置状态为 draft，清除项目关联）
    const duplicate = await prisma.quote.create({
      data: {
        userId,
        clientId: original.clientId,
        projectId: null,
        quoteNumber,
        title: `${original.title}（副本）`,
        items: original.items,
        subtotal: original.subtotal,
        taxRate: original.taxRate,
        taxAmount: original.taxAmount,
        discount: original.discount,
        total: original.total,
        paymentTerms: original.paymentTerms,
        validUntil: null,
        notes: original.notes,
        status: 'draft',
        aiGenerated: false,
        aiPrompt: '',
      },
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });

    return successResponse(duplicate);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('复制报价单失败:', e);
    return errorResponse('复制报价单失败', 500);
  }
}
