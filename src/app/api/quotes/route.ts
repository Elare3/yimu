import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, parsePagination } from '@/lib/utils';

// GET /api/quotes - 报价单列表
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const projectId = searchParams.get('projectId') || '';
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    // 自动将已过期的报价标记为 expired（draft/sent 且 validUntil 已过）
    await prisma.quote.updateMany({
      where: {
        userId,
        status: { in: ['draft', 'sent'] },
        validUntil: { lt: new Date(), not: null },
      },
      data: { status: 'expired' },
    });

    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    const [items, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.quote.count({ where }),
    ]);

    return successResponse({ items, total, page, pageSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取报价单列表失败', 500);
  }
}

// POST /api/quotes - 手动创建报价单
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { clientId, projectId, title, items, paymentTerms, validUntil, notes, taxRate, discount } = body;

    if (!clientId) return errorResponse('请选择客户');
    if (!title) return errorResponse('请填写报价标题');
    if (!items || items.length === 0) return errorResponse('至少添加一项报价内容');

    // 验证客户
    const client = await prisma.client.findFirst({ where: { id: clientId, userId } });
    if (!client) return errorResponse('客户不存在');

    // 计算金额（附带显示顺序）
    const processedItems = items.map((item: { quantity: number; unitPrice: number; name: string; description?: string; unit?: string }, i: number) => ({
      name: item.name,
      description: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || '项',
      unitPrice: item.unitPrice,
      amount: (item.quantity || 1) * item.unitPrice,
      order: i,
    }));

    const subtotal = processedItems.reduce((sum: number, item: { amount: number }) => sum + item.amount, 0);
    const rate = taxRate || 0;
    const taxAmount = subtotal * rate / 100;
    const discountAmount = discount || 0;
    const total = subtotal + taxAmount - discountAmount;

    // 生成报价编号：count+N 并在唯一约束冲突时重试，避免并发创建时的竞态
    const year = new Date().getFullYear();
    const baseCount = await prisma.quote.count({ where: { userId } });

    let quote;
    for (let attempt = 0; attempt < 5; attempt++) {
      const quoteNumber = `Q${year}${String(baseCount + 1 + attempt).padStart(4, '0')}`;
      try {
        quote = await prisma.quote.create({
          data: {
            userId,
            clientId,
            projectId: projectId || null,
            quoteNumber,
            title,
            items: { create: processedItems },
            subtotal,
            taxRate: rate,
            taxAmount,
            discount: discountAmount,
            total,
            paymentTerms: paymentTerms || '',
            validUntil: validUntil ? new Date(validUntil) : null,
            notes: notes || '',
          },
          include: {
            client: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            items: { orderBy: { order: 'asc' } },
          },
        });
        break;
      } catch (err) {
        // Prisma 唯一约束冲突：编号被并发创建抢占，尝试下一个
        const isUniqueViolation =
          typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
        if (!isUniqueViolation || attempt === 4) throw err;
      }
    }

    return successResponse(quote);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('创建报价单失败:', e);
    return errorResponse('创建报价单失败', 500);
  }
}
