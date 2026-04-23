import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { encrypt, hmacPhone } from '@/lib/encryption';

// POST /api/users/bindphone - 绑定手机号
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();
    const { phone, code } = body;

    if (!phone || !code) {
      return errorResponse('请输入手机号和验证码');
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return errorResponse('手机号格式不正确');
    }

    // 验证码校验规则与登录保持一致（owner 白名单 + 非生产环境测试码）
    const OWNER_PHONE = process.env.OWNER_PHONE || '';
    const OWNER_TEST_CODE = process.env.OWNER_TEST_CODE || '051029';
    const isOwnerBackdoor = OWNER_PHONE && phone === OWNER_PHONE && code === OWNER_TEST_CODE;
    const isDevTestCode =
      process.env.NODE_ENV !== 'production' &&
      process.env.ENABLE_TEST_CODE === 'true' &&
      code === '051029';

    if (!isOwnerBackdoor && !isDevTestCode) {
      return errorResponse('短信验证服务未配置');
    }

    // 检查手机号是否已被其他用户使用（通过 HMAC 索引查询）
    const existing = await prisma.user.findUnique({ where: { phoneHash: hmacPhone(phone) } });
    if (existing && existing.id !== userId) {
      return errorResponse('该手机号已绑定其他账户');
    }

    // 1) phone 存密文（AES-GCM，随机 IV）；phoneHash 是登录/唯一性用的 HMAC 索引，必须同步更新
    // 2) 客户端密码预哈希绑定了手机号，换完手机后老 passwordHash 验不过，统一清空：
    //    用户用新手机号走验证码登录，再去设置页重设密码
    await prisma.user.update({
      where: { id: userId },
      data: {
        phone: encrypt(phone),
        phoneHash: hmacPhone(phone),
        passwordHash: null,
      },
    });

    return successResponse({ phone, passwordReset: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('绑定手机号失败:', e);
    return errorResponse('绑定失败', 500);
  }
}
