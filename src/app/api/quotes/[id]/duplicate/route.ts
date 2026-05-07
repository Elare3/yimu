import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, beijingYMD } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// POST /api/quotes/[id]/duplicate — 复制报价单
export const POST = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const original = await prisma.quote.findFirst({
    where: { id: params.id, userId },
    include: { items: { orderBy: { order: 'asc' } } },
  });
  if (!original) return errorResponse('报价单不存在', 404);

  // 生成新编号（年份按北京时间，避免 UTC 服务器跨年瞬间拿到上一年）
  const count = await prisma.quote.count({ where: { userId } });
  const quoteNumber = `Q${beijingYMD().year}${String(count + 1).padStart(4, '0')}`;

  // 复制报价单（重置状态为 draft，清除项目关联）
  const duplicate = await prisma.quote.create({
    data: {
      userId,
      clientId: original.clientId,
      projectId: null,
      quoteNumber,
      title: `${original.title}（副本）`,
      items: {
        create: original.items.map((item, i) => ({
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          amount: item.amount,
          priceReference: item.priceReference,
          order: i,
        })),
      },
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
      items: { orderBy: { order: 'asc' } },
    },
  });

  return successResponse(duplicate);
}, '复制报价单失败');
