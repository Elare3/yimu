import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// POST /api/users/onboarding - 完成引导设置
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { businessType, entityType, companyName, phone } = body;

    const updateData: Record<string, unknown> = {
      needsOnboarding: false,
    };

    if (businessType) {
      const validTypes = ['design', 'development', 'consulting', 'content', 'operations', 'other'];
      if (validTypes.includes(businessType)) {
        updateData.businessType = businessType;
      }
    }

    if (entityType) {
      const validEntityTypes = ['individual', 'sole_proprietor', 'micro_company', 'freelance'];
      if (validEntityTypes.includes(entityType)) {
        updateData.entityType = entityType;
      }
    }

    if (companyName) {
      updateData.companyName = companyName.trim();
    }

    if (phone && /^1[3-9]\d{9}$/.test(phone)) {
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing && existing.id !== userId) {
        return errorResponse('该手机号已绑定其他账户');
      }
      updateData.phone = phone;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return successResponse({ id: user.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('引导设置失败:', e);
    return errorResponse('保存失败', 500);
  }
}
