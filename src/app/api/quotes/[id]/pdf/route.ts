import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/lib/utils';
import { decrypt } from '@/lib/encryption';
import { withAuth } from '@/lib/with-auth';

// GET /api/quotes/[id]/pdf - 导出报价单数据（前端使用 @react-pdf/renderer 渲染）
export const GET = withAuth(async (userId, _req: Request, { params }: { params: { id: string } }) => {
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, userId },
    include: {
      client: {
        select: {
          name: true,
          contactPerson: true,
          phone: true,
          email: true,
          address: true,
        },
      },
      project: { select: { name: true } },
      user: { select: { name: true, companyName: true, phone: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });

  if (!quote) return errorResponse('报价单不存在', 404);

  // 确保敏感字段已解密（防止中间件未生效）
  const safeDecrypt = (val: string | null) => {
    if (!val) return '';
    try { return decrypt(val); } catch { return val; }
  };

  const client = quote.client ? {
    name: quote.client.name,
    contactPerson: quote.client.contactPerson,
    phone: safeDecrypt(quote.client.phone),
    email: safeDecrypt(quote.client.email),
    address: safeDecrypt(quote.client.address),
  } : null;

  return Response.json({
    success: true,
    data: {
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      items: quote.items,
      subtotal: quote.subtotal,
      taxRate: quote.taxRate,
      taxAmount: quote.taxAmount,
      discount: quote.discount,
      total: quote.total,
      paymentTerms: quote.paymentTerms,
      validUntil: quote.validUntil,
      notes: quote.notes,
      createdAt: quote.createdAt,
      client,
      project: quote.project,
      user: {
        name: quote.user.name,
        companyName: quote.user.companyName || quote.user.name,
        phone: safeDecrypt(quote.user.phone),
      },
    },
  });
}, '获取报价单数据失败');
