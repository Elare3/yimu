import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { smartClassifyTransaction, smartBatchClassify } from '@/lib/ai-orchestrator';

// POST /api/transactions/ai-classify - AI智能分类（v3.0 先规则后AI版）
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    // 模式1: 批量分类 - { ids: string[] }
    if (body.ids && Array.isArray(body.ids)) {
      if (body.ids.length === 0) return errorResponse('请选择需要分类的记录');
      if (body.ids.length > 20) return errorResponse('单次最多分类20条记录');

      const transactions = await prisma.transaction.findMany({
        where: { id: { in: body.ids }, userId },
        select: { id: true, type: true, description: true, amount: true },
      });

      if (transactions.length === 0) return errorResponse('未找到指定记录');

      // 通过AI调度器批量分类（先规则后AI）
      const results = await smartBatchClassify(
        transactions.map(t => ({ id: t.id, type: t.type, description: t.description, amount: t.amount }))
      );

      if (!Array.isArray(results) || results.length === 0) {
        return errorResponse('分类结果异常，请重试', 500);
      }

      // 自动保存
      if (body.autoSave) {
        const updateResults = [];
        for (const result of results) {
          if (!result.id || !result.category) continue;
          try {
            const updated = await prisma.transaction.update({
              where: { id: result.id },
              data: {
                category: result.category,
                subcategory: result.subcategory || '',
                aiClassified: true,
              },
            });
            updateResults.push({ id: result.id, success: true, transaction: updated });
          } catch {
            updateResults.push({ id: result.id, success: false });
          }
        }

        return successResponse({
          classifications: results,
          saved: true,
          updateResults,
        });
      }

      return successResponse({
        classifications: results,
        saved: false,
      });
    }

    // 模式2: 单条分类 - { id, type, description, amount }
    const { id, type, description, amount } = body;

    if (!id) return errorResponse('请提供记录ID');

    const transaction = await prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true, type: true, description: true, amount: true },
    });

    if (!transaction) return errorResponse('记录不存在', 404);

    // 通过AI调度器单条分类（先规则后AI）
    const result = await smartClassifyTransaction({
      id,
      type: type || transaction.type,
      description: description || transaction.description,
      amount: amount || transaction.amount,
    });

    // 自动保存
    if (body.autoSave) {
      await prisma.transaction.update({
        where: { id },
        data: {
          category: result.category,
          subcategory: result.subcategory || '',
          aiClassified: true,
        },
      });

      return successResponse({
        classification: result,
        saved: true,
      });
    }

    return successResponse({
      classification: result,
      saved: false,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('AI分类失败:', e);
    return errorResponse('AI分类失败，请手动分类', 500);
  }
}
