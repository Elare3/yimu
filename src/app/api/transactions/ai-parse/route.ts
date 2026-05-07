import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { smartParseTransaction } from '@/lib/ai-orchestrator';
import { withAuth } from '@/lib/with-auth';

// POST /api/transactions/ai-parse - AI解析记账（v3.0 规则引擎+AI版）
export const POST = withAuth(async (userId, req: Request) => {
  const { input, autoSave } = await req.json();

  if (!input) return errorResponse('请输入记账内容');

  // 通过AI调度器解析（安全检查+AI解析+规则校验+金额校验）
  const result = await smartParseTransaction(input, userId);

  if (!result.success) {
    return errorResponse(result.error || 'AI解析失败', 500);
  }

  const { parsed, isMultiple, summary } = result.data!;
  // 用 Array.isArray 让 TS 正确收窄；orchestrator 端 parsed 是 SingleTx | SingleTx[] 联合
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsedList: any[] = Array.isArray(parsed) ? parsed : [parsed];

  // 如果自动保存且所有记录置信度高且不需要确认
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (autoSave && parsedList.every((p: any) => p.confidence >= 0.8 && !p.needsConfirmation)) {
    const savedTransactions = [];
    for (const p of parsedList) {
      const transaction = await prisma.transaction.create({
        data: {
          userId,
          type: p.type,
          amount: p.amount,
          category: p.category,
          subcategory: p.subcategory,
          description: p.description,
          date: new Date(p.date),
          paymentMethod: p.paymentMethod,
          isBusiness: p.isBusiness,
          aiClassified: true,
        },
      });
      savedTransactions.push(transaction);
    }

    return successResponse({
      parsed: isMultiple ? parsedList : parsedList[0],
      saved: true,
      transactions: savedTransactions,
      summary,
    });
  }

  // 返回解析结果供用户确认
  return successResponse({
    parsed: isMultiple ? parsedList : parsedList[0],
    saved: false,
    summary,
  });
}, 'AI解析失败，请手动记账');
