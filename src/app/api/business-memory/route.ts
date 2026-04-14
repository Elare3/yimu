import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// GET /api/business-memory - 获取经营记忆（供AI调用时注入上下文）
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const memoryType = searchParams.get('type') || '';
    const dimension = searchParams.get('dimension') || '';
    const activeOnly = searchParams.get('active') !== 'false';

    const where: Record<string, unknown> = { userId };
    if (memoryType) where.memoryType = memoryType;
    if (dimension) where.dimension = { contains: dimension };
    if (activeOnly) {
      where.isActive = true;
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ];
    }

    const memories = await prisma.businessMemory.findMany({
      where,
      orderBy: [{ confidence: 'desc' }, { dataPoints: 'desc' }],
      take: 50,
    });

    return successResponse(memories);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取经营记忆失败', 500);
  }
}

// POST /api/business-memory - 写入/更新经营记忆
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const { memoryType, dimension, content, confidence, source, expiresAt } = await req.json();

    if (!memoryType || !content) return errorResponse('缺少必要字段');

    const validTypes = ['pricing_pattern', 'client_preference', 'seasonal_trend', 'cost_benchmark', 'negotiation_insight'];
    if (!validTypes.includes(memoryType)) return errorResponse('无效的记忆类型');

    // 查找是否已有同维度记忆 → 更新而非重复创建
    const existing = await prisma.businessMemory.findFirst({
      where: { userId, memoryType, dimension: dimension || '', isActive: true },
    });

    if (existing) {
      const updated = await prisma.businessMemory.update({
        where: { id: existing.id },
        data: {
          content: typeof content === 'string' ? content : JSON.stringify(content),
          confidence: confidence ?? Math.min(existing.confidence + 0.05, 1.0),
          dataPoints: existing.dataPoints + 1,
          lastRefreshedAt: new Date(),
          expiresAt: expiresAt ? new Date(expiresAt) : existing.expiresAt,
          source: source || existing.source,
        },
      });
      return successResponse(updated);
    }

    const memory = await prisma.businessMemory.create({
      data: {
        userId,
        memoryType,
        dimension: dimension || '',
        content: typeof content === 'string' ? content : JSON.stringify(content),
        confidence: confidence ?? 0.5,
        dataPoints: 1,
        source: source || 'system',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return successResponse(memory);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('写入经营记忆失败:', e);
    return errorResponse('写入经营记忆失败', 500);
  }
}
