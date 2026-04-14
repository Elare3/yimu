import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

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

    // 开发环境：固定验证码 123456
    if (process.env.NODE_ENV === 'development') {
      if (code !== '123456') {
        return errorResponse('验证码错误');
      }
    } else {
      // TODO: 对接短信验证服务
      return errorResponse('短信验证服务未配置');
    }

    // 检查手机号是否已被其他用户使用
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing && existing.id !== userId) {
      return errorResponse('该手机号已绑定其他账户');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { phone },
    });

    return successResponse({ phone });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('绑定手机号失败:', e);
    return errorResponse('绑定失败', 500);
  }
}
