import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { smartGenerateQuote } from '@/lib/ai-orchestrator';

// POST /api/quotes/ai-generate - AI生成报价单（v3.0 规则引擎+AI版）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { requirement, category, budgetHint, clientId, projectId } = await req.json();

    if (!requirement) return errorResponse('请描述客户需求');
    if (!clientId) return errorResponse('请选择客户');

    // 验证客户
    const client = await prisma.client.findFirst({ where: { id: clientId, userId } });
    if (!client) return errorResponse('客户不存在');

    // 获取用户业务类型
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const businessType = user?.businessType || 'other';

    // 通过AI调度器生成报价（规则校验+AI生成+付款方案）
    const result = await smartGenerateQuote({
      requirement,
      category: category || undefined,
      budgetHint: budgetHint || undefined,
      businessType,
      clientName: client.name,
      userId,
    });

    if (!result.success) {
      return errorResponse(result.error || '小木报价失败', 500);
    }

    const data = result.data!;

    // 生成报价编号
    const count = await prisma.quote.count({ where: { userId } });
    const quoteNumber = `Q${new Date().getFullYear()}${String(count + 1).padStart(4, '0')}`;

    // 创建报价单
    const quote = await prisma.quote.create({
      data: {
        userId,
        clientId,
        projectId: projectId || null,
        quoteNumber,
        title: data.title,
        items: {
          create: data.items.map((i: { _warning?: string; _valid?: boolean; name: string; description: string; quantity: number; unit: string; unitPrice: number; amount: number; priceReference: string }, idx: number) => ({
            name: i.name,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            amount: i.amount,
            priceReference: i.priceReference,
            order: idx,
          })),
        },
        subtotal: data.subtotal,
        taxRate: 0,
        taxAmount: 0,
        discount: data.discountAmount,
        total: data.finalTotal,
        paymentTerms: typeof data.paymentTerms === 'object'
          ? (data.paymentTerms.plan || JSON.stringify(data.paymentTerms))
          : (data.paymentTerms || ''),
        notes: data.notes,
        aiGenerated: true,
        aiPrompt: requirement,
      },
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        items: { orderBy: { order: 'asc' } },
      },
    });

    return successResponse({
      quote,
      aiSuggestion: {
        estimatedDays: data.estimatedDays,
        paymentTerms: data.paymentTerms,
        revisionPolicy: data.revisionPolicy,
        notes: data.notes,
        bonusItems: data.bonusItems,
        discount: data.discount,
        negotiationTips: data.negotiationTips,
        marketBenchmark: data.marketBenchmark,
      },
      // 新增：规则引擎输出
      warnings: result.warnings,
      suggestedPaymentPlan: result.suggestedPaymentPlan,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('小木报价失败:', e);
    return errorResponse('小木报价失败，请稍后重试', 500);
  }
}
