import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { smartGenerateContract } from '@/lib/ai-orchestrator';

// POST /api/contracts/ai-generate - AI生成合同条款（基于报价单）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const {
      quoteId,
      serviceType,
      includeNDA,
      includeNonCompete,
      afterSupportDays,
      customClauses,
    } = body;

    if (!quoteId) return errorResponse('请选择报价单');
    if (!serviceType) return errorResponse('请选择服务类型');

    const validTypes = ['design', 'development', 'content', 'consulting', 'operation'];
    if (!validTypes.includes(serviceType)) return errorResponse('无效的服务类型');

    // 获取报价单 + 客户 + 用户信息
    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, userId },
      include: {
        client: true,
        project: true,
        items: { orderBy: { order: 'asc' } },
      },
    });
    if (!quote) return errorResponse('报价单不存在');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse('用户不存在');

    // 构建报价概要
    const itemsSummary = quote.items
      .map(i => `${i.name}（¥${i.amount}）`)
      .join('、');
    const quoteSummary = `报价单${quote.quoteNumber}：${quote.title}，包含 ${itemsSummary}，合计 ¥${quote.total}`;

    // 提取交付物列表
    const deliverables = quote.items.map(i => i.name);

    // 修改轮数默认值（按服务类型）
    const defaultRevisionMap: Record<string, number> = {
      design: 3, development: 2, content: 2, consulting: 1, operation: 0,
    };
    const revisionLimit = defaultRevisionMap[serviceType] ?? 2;

    // 售后支持默认值
    const defaultSupportMap: Record<string, number> = {
      design: 15, development: 30, content: 0, consulting: 0, operation: 0,
    };

    const result = await smartGenerateContract({
      quoteSummary,
      clientName: quote.client.name,
      clientContact: quote.client.contactPerson || undefined,
      userName: user.name || '服务方',
      userCompany: user.companyName || user.name || '服务方',
      serviceType,
      paymentTerms: quote.paymentTerms || '签约付50%，验收付50%',
      deliverables,
      revisionLimit,
      totalAmount: quote.total,
      estimatedDays: quote.project?.deadline
        ? Math.ceil((new Date(quote.project.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 30,
      includeNDA: includeNDA ?? true,
      includeNonCompete: includeNonCompete ?? false,
      afterSupportDays: afterSupportDays ?? defaultSupportMap[serviceType] ?? 0,
      customClauses: customClauses || [],
      userId,
    });

    if (!result.success) {
      return errorResponse(result.error || 'AI合同生成失败', 500);
    }

    return successResponse({
      contract: result.data,
      warnings: result.warnings,
      quoteRef: {
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        total: quote.total,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('AI合同生成失败:', e);
    return errorResponse('AI合同生成失败，请稍后重试', 500);
  }
}
