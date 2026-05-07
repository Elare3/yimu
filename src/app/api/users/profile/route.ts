import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { encrypt, decrypt, hmacPhone } from '@/lib/encryption';
import { withAuth } from '@/lib/with-auth';
import { isOneOf, USER_BUSINESS_TYPE, USER_ENTITY_TYPE, PRIVACY_MODE } from '@/lib/constants';

// GET /api/users/profile - 获取用户资料
export const GET = withAuth(async (userId) => {
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
      email: true,
      emailVerified: true,
      notifyOverdue: true,
      notifyDueSoon: true,
      notifyQuoteExpiring: true,
      settings: true, // UserSettings 1:1 relation
      createdAt: true,
    },
  });

  if (!user) return errorResponse('用户不存在', 404);
  // DB 里 phone 是 AES-GCM 密文，前端要拿明文做掩码显示和密码预哈希，所以在 API 边界解密
  const { passwordHash, phone, ...rest } = user;
  return successResponse({ ...rest, phone: phone ? decrypt(phone) : phone, hasPassword: !!passwordHash });
}, '获取用户资料失败');

// PUT /api/users/profile - 更新用户资料
export const PUT = withAuth(async (userId, req: Request) => {
  const body = await req.json();

  const { name, companyName, businessType, entityType, phone, privacyMode } = body;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!name.trim()) return errorResponse('昵称不能为空');
    updateData.name = name.trim();
  }
  if (companyName !== undefined) updateData.companyName = companyName.trim();
  if (businessType !== undefined) {
    if (!isOneOf(USER_BUSINESS_TYPE, businessType)) return errorResponse('无效的业务类型');
    updateData.businessType = businessType;
  }
  if (entityType !== undefined) {
    if (!isOneOf(USER_ENTITY_TYPE, entityType)) return errorResponse('无效的身份类型');
    updateData.entityType = entityType;
  }
  if (privacyMode !== undefined) {
    if (!isOneOf(PRIVACY_MODE, privacyMode)) return errorResponse('无效的隐私模式');
    updateData.privacyMode = privacyMode;
  }
  if (phone !== undefined && phone !== '') {
    if (!/^1[3-9]\d{9}$/.test(phone)) return errorResponse('手机号格式不正确');
    // 检查手机号是否已被其他用户使用（通过 HMAC 索引查询）
    const existing = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });
    if (existing && existing.id !== userId) return errorResponse('该手机号已绑定其他账户');
    // 三件套必须一起：phone 存密文 / phoneHash 同步索引 / passwordHash 清空
    // 客户端密码预哈希绑定了手机号，换号后老 hash 验不过，统一清空走"重设密码"流程
    updateData.phone = encrypt(phone);
    updateData.phoneHash = hmacPhone(phone);
    updateData.passwordHash = null;
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

  // 同样在 API 边界把 phone 解密回明文，前端逻辑（掩码/预哈希）才能继续工作
  return successResponse({ ...user, phone: user.phone ? decrypt(user.phone) : user.phone });
}, '更新失败');
