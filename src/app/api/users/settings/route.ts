import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, safeParseFloat } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// PUT /api/users/settings - 更新用户经营设置（1:1 关联表，自动 upsert）
export const PUT = withAuth(async (userId, req: Request) => {
  const body = await req.json();

  const { currency, taxRate, paymentReminderDays, defaultPaymentTerms } = body;

  const patch: Record<string, unknown> = {};

  if (currency !== undefined) {
    const validCurrencies = ['CNY', 'USD', 'EUR', 'GBP', 'JPY'];
    if (!validCurrencies.includes(currency)) return errorResponse('无效的货币类型');
    patch.currency = currency;
  }
  if (taxRate !== undefined) {
    const rate = safeParseFloat(taxRate);
    if (rate === null || rate < 0 || rate > 100) return errorResponse('税率应在 0-100 之间');
    patch.taxRate = rate;
  }
  if (paymentReminderDays !== undefined) {
    if (!Array.isArray(paymentReminderDays)) return errorResponse('催款提醒天数格式无效');
    patch.paymentReminderDays = paymentReminderDays.map(Number).filter(n => !isNaN(n) && n >= 0);
  }
  if (defaultPaymentTerms !== undefined) {
    patch.defaultPaymentTerms = String(defaultPaymentTerms).trim();
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse('没有需要更新的设置');
  }

  // UserSettings 1:1：不存在则创建，存在则合并 patch
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      currency: (patch.currency as string) ?? 'CNY',
      taxRate: (patch.taxRate as number) ?? 0,
      paymentReminderDays: (patch.paymentReminderDays as number[]) ?? [3, 1, 0],
      defaultPaymentTerms: (patch.defaultPaymentTerms as string) ?? '',
    },
    update: patch,
  });

  return successResponse({ id: userId, settings });
}, '更新设置失败');
