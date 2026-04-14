// ============================================================
// 一木 YiMu — 模板缓存池（语义分离隐私保护）
// 相同意图参数命中缓存时零AI调用
// 流程：本地理解（规则引擎算意图）→ 云端表达（AI只看意图参数）→ 本地填充
// ============================================================

import { prisma } from './prisma';
import { hashIntent } from './semantic-intent';
import { secureCallAI } from './security';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 获取或生成模板：优先命中缓存，未命中则调AI生成3个候选模板
 */
export async function getOrGenerateTemplate(
  task: string,
  intent: Record<string, any>,
  systemPrompt: string,
  userId: string,
): Promise<{ template: string; cacheHit: boolean }> {

  const intentHash = hashIntent({ task, ...intent });

  // 查缓存
  const cached = await prisma.aITemplateCache.findUnique({
    where: { intentHash },
  });

  if (cached) {
    const templates = cached.templates as string[];
    const selected = templates[Math.floor(Math.random() * templates.length)];

    await prisma.aITemplateCache.update({
      where: { intentHash },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });

    // 记录调用日志（缓存命中，零数据外发）
    await prisma.aICallLog.create({
      data: { userId, task, intentParams: intent, dataSent: 'none', cacheHit: true },
    });

    return { template: selected, cacheHit: true };
  }

  // 未命中：调AI生成3个模板
  const promptText = buildIntentPrompt(task, intent);

  const result = await secureCallAI({
    userId,
    task: `${task}.generate`,
    rawInput: promptText,
    systemPrompt,
    buildPromptFn: (s) => s,
  });

  if (result.success && result.data?.templates) {
    await prisma.aITemplateCache.create({
      data: { task, intentHash, intentParams: intent, templates: result.data.templates },
    });

    // 记录日志（仅发送意图参数）
    await prisma.aICallLog.create({
      data: { userId, task, intentParams: intent, dataSent: 'intent_only', cacheHit: false },
    });

    return { template: result.data.templates[0], cacheHit: false };
  }

  // AI失败：返回预设模板（规则引擎兜底）
  await prisma.aICallLog.create({
    data: { userId, task, intentParams: intent, dataSent: 'none', cacheHit: false },
  });

  return { template: getFallbackTemplate(task, intent), cacheHit: false };
}

function buildIntentPrompt(task: string, intent: Record<string, any>): string {
  const paramLines = Object.entries(intent)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');

  return `根据以下意图参数生成3个不同风格的模板候选。

任务类型：${task}
${paramLines}

重要规则：
1. 模板中使用占位符引用具体数据，绝对不要编造任何具体的名称、金额、日期
2. 可用占位符：{CLIENT}客户称呼、{PROJECT}项目名、{PAYMENT_NAME}收款节点名、{AMOUNT}金额、{OVERDUE_DAYS}逾期天数、{DUE_DATE}到期日、{USER_NAME}用户姓名、{USER_COMPANY}公司名、{USER_PHONE}手机号、{MONTH_INCOME}月收入、{LAST_MONTH_INCOME}上月收入、{PROFIT_RATE}利润率、{TOP_CLIENT}最大客户、{TOP_CLIENT_RATIO}最大客户占比、{QUARTER_INCOME}季度收入、{TAX_THRESHOLD}免税额度
3. 3个模板在措辞风格上有所不同，但语气级别一致

返回JSON：{ "templates": ["模板1", "模板2", "模板3"] }`;
}

// ═══ 预设兜底模板 ═══

export function getFallbackTemplate(task: string, intent: Record<string, any>): string {
  if (task === 'reminder') {
    const level = intent.level ?? 0;
    const fallbacks: Record<number, string> = {
      0: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）将于{DUE_DATE}到期，届时烦请安排付款。如有疑问随时联系我。{USER_NAME}',
      1: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已超过约定付款日{OVERDUE_DAYS}天，烦请尽快安排转账。{USER_NAME} {USER_PHONE}',
      2: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已逾期{OVERDUE_DAYS}天。请于本周内完成付款，如有困难请及时沟通。{USER_NAME}',
      3: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已逾期{OVERDUE_DAYS}天，已影响我方正常经营。请务必于3个工作日内安排付款。{USER_NAME} {USER_COMPANY}',
      4: '{CLIENT}负责人：关于{PROJECT}的{PAYMENT_NAME}（{AMOUNT}），已逾期{OVERDUE_DAYS}天。现正式函告，请于收到本函后5个工作日内付清欠款。逾期我方将保留依法追索的权利。{USER_COMPANY} {USER_NAME}',
      5: '{CLIENT}负责人：{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已逾期{OVERDUE_DAYS}天。依据《民法典》第577条，我方正式要求贵方于7日内付清全部欠款及逾期利息。届时未付，将依法提起诉讼。{USER_COMPANY} {USER_NAME}',
      6: '{CLIENT}：本律师受{USER_COMPANY}（{USER_NAME}）委托，就贵方拖欠{PROJECT}服务费{AMOUNT}一事致函。该款项已逾期{OVERDUE_DAYS}天，请于收函后10日内付清本金及利息，否则我方将依法向人民法院提起诉讼。',
    };
    return fallbacks[level] || fallbacks[1];
  }

  if (task === 'insight') {
    return '本月经营数据已更新。收入{MONTH_INCOME}，利润率{PROFIT_RATE}。建议关注现金流状况和客户多元化。';
  }

  return '';
}

// ═══ 本地填充：把模板里的占位符替换为真实数据 ═══

export function fillTemplate(template: string, data: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    // Use regex with global flag for compatibility
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  // 清理未被替换的占位符（数据缺失时不显示占位符原文）
  result = result.replace(/\{[A-Z_]+\}/g, '');
  return result.trim();
}
