import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { hmacPhone } from '@/lib/encryption';

// GET /api/users/profile - 获取用户资料
export async function GET() {
  try {
    const userId = await requireUserId();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        name: true,
        companyName: true,
        avatarUrl: true,
        businessType: true,
        entityType: true,
        plan: true,
        planExpiresAt: true,
        privacyMode: true,
        passwordHash: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!user) return errorResponse('用户不存在', 404);
    const { passwordHash, ...rest } = user;
    return successResponse({ ...rest, hasPassword: !!passwordHash });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取用户资料失败', 500);
  }
}

// PUT /api/users/profile - 更新用户资料
export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { name, companyName, businessType, entityType, phone, privacyMode } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) return errorResponse('昵称不能为空');
      updateData.name = name.trim();
    }
    if (companyName !== undefined) updateData.companyName = companyName.trim();
    if (businessType !== undefined) {
      const validTypes = ['design', 'development', 'consulting', 'content', 'operations', 'other'];
      if (!validTypes.includes(businessType)) return errorResponse('无效的业务类型');
      updateData.businessType = businessType;
    }
    if (entityType !== undefined) {
      const validEntityTypes = ['individual', 'sole_proprietor', 'micro_company', 'freelance'];
      if (!validEntityTypes.includes(entityType)) return errorResponse('无效的身份类型');
      updateData.entityType = entityType;
    }
    if (privacyMode !== undefined) {
      const validModes = ['standard', 'strict'];
      if (!validModes.includes(privacyMode)) return errorResponse('无效的隐私模式');
      updateData.privacyMode = privacyMode;
    }
    if (phone !== undefined && phone !== '') {
      if (!/^1[3-9]\d{9}$/.test(phone)) return errorResponse('手机号格式不正确');
      // 检查手机号是否已被其他用户使用（通过 HMAC 索引查询）
      const existing = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });
      if (existing && existing.id !== userId) return errorResponse('该手机号已绑定其他账户');
      updateData.phone = phone;
    }

    if (Object.keys(updateData).length === 0) {
      return errorResponse('没有需要更新的内容');
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        phone: true,
        name: true,
        companyName: true,
        businessType: true,
        entityType: true,
        plan: true,
        settings: true,
      },
    });

    return successResponse(user);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('更新用户资料失败:', e);
    return errorResponse('更新失败', 500);
  }
}
