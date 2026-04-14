import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// PUT /api/users/settings - 更新用户经营设置
export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = await req.json();

    const { currency, taxRate, paymentReminderDays, defaultPaymentTerms } = body;

    const settings: Record<string, unknown> = {};

    if (currency !== undefined) {
      const validCurrencies = ['CNY', 'USD', 'EUR', 'GBP', 'JPY'];
      if (!validCurrencies.includes(currency)) return errorResponse('无效的货币类型');
      settings.currency = currency;
    }
    if (taxRate !== undefined) {
      const rate = parseFloat(taxRate);
      if (isNaN(rate) || rate < 0 || rate > 100) return errorResponse('税率应在 0-100 之间');
      settings.taxRate = rate;
    }
    if (paymentReminderDays !== undefined) {
      if (!Array.isArray(paymentReminderDays)) return errorResponse('催款提醒天数格式无效');
      settings.paymentReminderDays = paymentReminderDays.map(Number).filter(n => !isNaN(n) && n >= 0);
    }
    if (defaultPaymentTerms !== undefined) {
      settings.defaultPaymentTerms = String(defaultPaymentTerms).trim();
    }

    if (Object.keys(settings).length === 0) {
      return errorResponse('没有需要更新的设置');
    }

    // 先获取现有设置再合并
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true },
    });

    const mergedSettings = {
      currency: 'CNY',
      taxRate: 0,
      paymentReminderDays: [3, 1, 0],
      defaultPaymentTerms: '',
      ...(existing?.settings || {}),
      ...settings,
    };

    const user = await prisma.user.update({
      where: { id: userId },
      data: { settings: mergedSettings },
      select: {
        id: true,
        settings: true,
      },
    });

    return successResponse(user);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('更新设置失败:', e);
    return errorResponse('更新设置失败', 500);
  }
}
