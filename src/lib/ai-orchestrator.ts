// ============================================================
// 一木 YiMu — 复合AI调度器（语义分离隐私保护架构）
// AI永远不接触用户真实数据：本地理解 → 云端表达 → 本地填充
// ============================================================

import { prisma } from './prisma';
import { callAI, getModelForTask, validateQuoteResponse, validateTransactionResponse } from './ai';
import { secureCallAI, validateAIOutput, logAIAudit, hashInput } from './security';
import {
  QuoteResponseSchema,
  QuoteAdjustResponseSchema,
  TransactionParseResponseSchema,
  ClassifyResponseSchema,
  // BatchClassifyResponseSchema 未启用：DashScope JSON mode 强制对象顶层，
  // 而批量分类 prompt 期望数组，schema 校验会失败。后续配合改 prompt 一起接入。
  ContractResponseSchema,
} from './ai-schemas';
import {
  TRANSACTION_INFERENCE_RULES,
  QUOTE_VALIDATION_RULES,
  PAYMENT_SPLIT_RULES,
  REMINDER_ESCALATION_RULES,
  HEALTH_SCORE_RULES,
  TAX_RULES_2026,
} from './rules';
import {
  QUOTE_SYSTEM_PROMPT, buildQuoteUserPrompt,
  TRANSACTION_SYSTEM_PROMPT, buildTransactionParsePrompt,
  CLASSIFY_SYSTEM_PROMPT, buildClassifyPrompt, buildBatchClassifyPrompt,
  REMINDER_SYSTEM_PROMPT,
  INSIGHT_SYSTEM_PROMPT,
  CONTRACT_SYSTEM_PROMPT, buildContractPrompt,
} from './prompts';
import { getRelevantKnowledge } from './knowledge';
import {
  formatDate,
  beijingMonthRange,
  beijingQuarterStart,
  beijingYMD,
  beijingMidnight,
} from './utils';
import {
  buildReminderIntent,
  buildQuoteIntent,
  buildInsightIntent,
  extractKeywords,
  tierAcceptRate,
} from './semantic-intent';
import { getOrGenerateTemplate, fillTemplate, getFallbackTemplate } from './template-cache';
import { type ProgressEmit, noopEmit } from './ai-stream';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ════════════════════════════════════════
// 0. 报价历史信号聚合（喂回 AI：越用越懂你）
// ════════════════════════════════════════

export interface PricingFeedbackStats {
  /** 总样本数 */
  totalCount: number;
  /** 接受率 0-1 */
  acceptRate: number;
  /** 议价率（最终成交但有调整） 0-1 */
  negotiationRate: number;
  /** 拒绝率 0-1 */
  rejectRate: number;
  /** 流失率（发出后无回应） 0-1 */
  expiredRate: number;
  /** 平均偏差：正=用户上调成交，负=被砍价；null=样本不足 */
  avgDeviation: number | null;
  /** 最高频拒绝原因 */
  topRejectReason: string | null;
  /** 该原因占拒绝样本的比例 */
  topRejectReasonRatio: number;
  /** 议价单的平均轮数 */
  avgNegotiationRounds: number;
  /** 平均决策天数（成交+拒绝） */
  avgDaysToDecision: number;
}

/**
 * 聚合用户最近 N 单报价反馈，作为 AI 报价生成的历史信号
 *
 * - 至少 3 个样本才返回，否则返回 null（信号噪声大没意义）
 * - 默认看最近 90 天
 * - 可按 category 过滤（同业务类型的反馈更相关）
 */
export async function getPricingFeedbackStats(
  userId: string,
  category?: string,
  options: { days?: number; minSamples?: number } = {},
): Promise<PricingFeedbackStats | null> {
  const days = options.days ?? 90;
  const minSamples = options.minSamples ?? 3;

  if (userId === 'anonymous') return null;

  const since = new Date(Date.now() - days * 86400_000);

  try {
    const feedbacks = await prisma.pricingFeedback.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // 防止历史数据过多拖慢
    });

    if (feedbacks.length < minSamples) return null;

    const total = feedbacks.length;
    const accepted = feedbacks.filter(f => f.outcome === 'accepted').length;
    const negotiated = feedbacks.filter(f => f.outcome === 'negotiated').length;
    const rejected = feedbacks.filter(f => f.outcome === 'rejected').length;
    const expired = feedbacks.filter(f => f.outcome === 'expired_no_response').length;

    // 平均偏差：只统计有 deviation 字段的（accepted/negotiated 通常都有）
    const withDeviation = feedbacks.filter(f => typeof f.deviation === 'number');
    const avgDeviation = withDeviation.length > 0
      ? withDeviation.reduce((sum, f) => sum + (f.deviation ?? 0), 0) / withDeviation.length
      : null;

    // 拒绝原因频次
    const rejectReasons = feedbacks
      .filter(f => f.outcome === 'rejected' && f.rejectReason)
      .map(f => f.rejectReason);
    const reasonCount = new Map<string, number>();
    for (const r of rejectReasons) reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
    let topRejectReason: string | null = null;
    let topRejectCount = 0;
    for (const [reason, count] of reasonCount) {
      if (count > topRejectCount) { topRejectReason = reason; topRejectCount = count; }
    }
    const topRejectReasonRatio = rejected > 0 ? topRejectCount / rejected : 0;

    // 议价轮数（仅议价样本）
    const negotiationRounds = feedbacks
      .filter(f => f.outcome === 'negotiated' && f.negotiationRounds > 0)
      .map(f => f.negotiationRounds);
    const avgNegotiationRounds = negotiationRounds.length > 0
      ? negotiationRounds.reduce((a, b) => a + b, 0) / negotiationRounds.length
      : 0;

    // 决策天数（仅成交+拒绝，过期那种没意义）
    const decisionDays = feedbacks
      .filter(f => ['accepted', 'negotiated', 'rejected'].includes(f.outcome) && f.daysToDecision > 0)
      .map(f => f.daysToDecision);
    const avgDaysToDecision = decisionDays.length > 0
      ? decisionDays.reduce((a, b) => a + b, 0) / decisionDays.length
      : 0;

    return {
      totalCount: total,
      acceptRate: accepted / total,
      negotiationRate: negotiated / total,
      rejectRate: rejected / total,
      expiredRate: expired / total,
      avgDeviation,
      topRejectReason,
      topRejectReasonRatio,
      avgNegotiationRounds: Math.round(avgNegotiationRounds * 10) / 10,
      avgDaysToDecision: Math.round(avgDaysToDecision * 10) / 10,
    };
  } catch {
    // 查询失败不影响主流程
    return null;
  }
}

/**
 * 把 PricingFeedbackStats 转成可读的中文要点（喂给 AI 的 prompt 段落）
 *
 * 策略：把"原始数字"转成"AI 能据此调整定价的判断"
 * - 平均偏差 < -0.05 → 提醒"用户经常被砍价，建议预留 5-10% 议价空间"
 * - 拒绝原因 too_expensive 占比 > 50% → "当前报价偏高于客户预期，请贴近行业中位数"
 * - 议价轮数 > 2 → "客户议价频繁，首报可适度上浮"
 */
export function describePricingFeedback(stats: PricingFeedbackStats): string {
  const lines: string[] = [];
  lines.push(`样本数：${stats.totalCount} 单（近 90 天）`);
  lines.push(`成交分布：直接接受 ${(stats.acceptRate * 100).toFixed(0)}%，议价后成交 ${(stats.negotiationRate * 100).toFixed(0)}%，拒绝 ${(stats.rejectRate * 100).toFixed(0)}%`);

  if (stats.avgDeviation !== null) {
    const pct = (stats.avgDeviation * 100).toFixed(1);
    if (stats.avgDeviation < -0.05) {
      lines.push(`平均偏差：最终成交比报价低 ${Math.abs(parseFloat(pct))}% → 用户经常被砍价，本次定价可预留 5-10% 议价空间`);
    } else if (stats.avgDeviation > 0.05) {
      lines.push(`平均偏差：最终成交比报价高 ${pct}% → 用户首报通常偏保守，可适度上调`);
    } else {
      lines.push(`平均偏差：${pct}% → 报价基本贴合成交价，沿用现有水位`);
    }
  }

  if (stats.topRejectReason && stats.topRejectReasonRatio > 0.5) {
    const reasonLabel: Record<string, string> = {
      too_expensive: '客户觉得价格高 → 本次请贴近行业中位数下限，避免过度溢价',
      scope_mismatch: '需求范围不匹配 → 本次请把项目拆分得更清晰，让客户看清每项价值',
      competitor: '客户选择竞品 → 强化差异化（资历/案例/交付速度），不要陷入纯价格战',
      budget_cut: '客户预算调整 → 提供 2 档报价（标准/精简版）让客户选',
      other: '杂项原因',
    };
    lines.push(`主要拒绝原因（${(stats.topRejectReasonRatio * 100).toFixed(0)}%）：${reasonLabel[stats.topRejectReason] ?? stats.topRejectReason}`);
  }

  if (stats.avgNegotiationRounds >= 2) {
    lines.push(`平均议价 ${stats.avgNegotiationRounds} 轮成交 → 客户惯于多轮砍价，首报可适度上浮 5-8%`);
  } else if (stats.avgNegotiationRounds > 0 && stats.avgNegotiationRounds < 1.5) {
    lines.push(`平均议价 ${stats.avgNegotiationRounds} 轮成交 → 客户决策较快，价格不要预留太多缓冲`);
  }

  if (stats.avgDaysToDecision > 0) {
    lines.push(`平均决策周期 ${stats.avgDaysToDecision} 天`);
  }

  return lines.join('\n');
}

// ════════════════════════════════════════
// 1. 报价：AI生成 → 规则校验 → 付款方案 → 返回
// ════════════════════════════════════════

export async function smartGenerateQuote(params: {
  requirement: string;
  category?: string;
  budgetHint?: string;
  businessType: string;
  clientName: string;
  userId?: string;
}) {
  const userId = params.userId || 'anonymous';

  // ── Step 0: 读取 BusinessMemory（AI越用越懂我） ──
  const memoryContext: { historicalAvgPrice?: number; pricingHints?: string } = {};
  if (userId !== 'anonymous') {
    try {
      const memories = await prisma.businessMemory.findMany({
        where: {
          userId,
          isActive: true,
          memoryType: { in: ['pricing_pattern', 'client_preference', 'negotiation_insight'] },
          ...(params.category ? { dimension: { contains: params.category } } : {}),
        },
        orderBy: { confidence: 'desc' },
        take: 5,
      });

      if (memories.length > 0) {
        const pricingMemories = memories.filter(m => m.memoryType === 'pricing_pattern');
        if (pricingMemories.length > 0) {
          try {
            const prices = pricingMemories.map(m => {
              const content = JSON.parse(m.content);
              return content.avgPrice || content.finalPrice || 0;
            }).filter((p: number) => p > 0);
            if (prices.length > 0) {
              memoryContext.historicalAvgPrice = Math.round(
                prices.reduce((a: number, b: number) => a + b, 0) / prices.length
              );
            }
          } catch { /* JSON parse fail, skip */ }
        }

        const hints: string[] = [];
        for (const m of memories) {
          try {
            const content = JSON.parse(m.content);
            if (m.memoryType === 'pricing_pattern' && content.summary) {
              hints.push(`历史定价模式：${content.summary}`);
            }
            if (m.memoryType === 'client_preference' && content.summary) {
              hints.push(`客户偏好：${content.summary}`);
            }
            if (m.memoryType === 'negotiation_insight' && content.summary) {
              hints.push(`议价洞察：${content.summary}`);
            }
          } catch { /* skip */ }
        }
        if (hints.length > 0) {
          memoryContext.pricingHints = hints.join('；');
        }
      }
    } catch {
      // BusinessMemory 查询失败不影响核心报价流程
    }
  }

  // ── Step 0.5: 读取 PricingFeedback 历史信号（"越用越懂你"的真实事实层） ──
  const pricingStats = await getPricingFeedbackStats(userId, params.category);

  // ── Step 1: 语义分离 — 从需求文本提取关键词（自动过滤手机号邮箱等隐私） ──
  const requirementKeywords = extractKeywords(params.requirement);
  const clientProjectCount = userId !== 'anonymous'
    ? await prisma.project.count({ where: { userId, client: { name: params.clientName } } })
    : 0;

  const baseIntent = buildQuoteIntent({
    serviceType: params.businessType,
    requirementText: params.requirement,
    requirementKeywords,
    budgetHint: params.budgetHint ? parseFloat(params.budgetHint) : undefined,
    clientProjectCount,
    deadline: undefined,
  });

  // 把历史信号合并进 intent — 用层级标签而非精确数字，避免哈希过敏感
  const intent = pricingStats ? {
    ...baseIntent,
    historicalAcceptTier: tierAcceptRate(pricingStats.acceptRate),
    historicalDeviationDirection:
      pricingStats.avgDeviation === null ? 'unknown' :
      pricingStats.avgDeviation < -0.05 ? 'often_negotiated_down' :
      pricingStats.avgDeviation > 0.05 ? 'often_adjusted_up' : 'stable',
    historicalNegotiationStyle:
      pricingStats.avgNegotiationRounds >= 2 ? 'haggle_heavy' :
      pricingStats.avgNegotiationRounds > 0 ? 'quick_decide' : 'unknown',
    historicalTopRejectReason: pricingStats.topRejectReason ?? 'none',
    historicalSampleSize: pricingStats.totalCount,
  } : baseIntent;

  // ── Step 2: 检查隐私模式 ──
  let isStrictMode = false;
  if (userId !== 'anonymous') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { privacyMode: true } });
    isStrictMode = user?.privacyMode === 'strict';
  }

  // ── Step 3: 知识库注入 ──
  const knowledgeResult = await getRelevantKnowledge(
    'quote.generate',
    [params.category || '', params.businessType, ...requirementKeywords].join(' '),
    { category: params.category }
  );
  const enhancedQuotePrompt = QUOTE_SYSTEM_PROMPT + knowledgeResult.injection;

  // ── Step 4: AI调用（报价是结构化JSON，通过意图参数生成，不含客户真实信息） ──
  // 注意：报价不使用模板缓存，因为输出是结构化items数组，不是纯文本模板
  // 但仍使用语义分离：AI只看到意图参数和关键词，不看到客户名/联系方式/具体金额
  if (isStrictMode) {
    // 严格模式：记录日志，返回错误提示（报价需要AI生成结构化数据，无法纯规则兜底）
    await prisma.aICallLog.create({
      data: { userId, task: 'quote', intentParams: intent as any, dataSent: 'none', cacheHit: false },
    });
    return { success: false, error: '严格隐私模式下暂不支持AI报价生成，请切换到标准模式或手动创建报价' };
  }

  const pricingFeedbackSummary = pricingStats ? describePricingFeedback(pricingStats) : undefined;

  const secureResult = await secureCallAI({
    userId,
    task: 'quote.generate',
    rawInput: JSON.stringify({ ...intent, keywords: requirementKeywords }),
    systemPrompt: enhancedQuotePrompt,
    buildPromptFn: (sanitized) => buildQuoteUserPrompt({
      requirement: sanitized,
      category: params.category,
      budgetHint: params.budgetHint,
      businessType: params.businessType,
      clientName: '客户',  // 语义分离：不发送真实客户名
      historicalAvgPrice: memoryContext.historicalAvgPrice,
      pricingFeedbackSummary,  // 新增：PricingFeedback 喂回
    }) + (memoryContext.pricingHints ? `\n\n【用户历史经营数据参考】\n${memoryContext.pricingHints}\n请参考以上历史数据，让报价更贴合用户的定价风格和客户群体。` : ''),
    temperature: 0.7,
    maxTokens: 3000,
    schema: QuoteResponseSchema,
  });

  // 记录AI调用日志（仅发送意图参数）
  await prisma.aICallLog.create({
    data: { userId, task: 'quote', intentParams: intent as any, dataSent: 'intent_only', cacheHit: false },
  });

  if (!secureResult.success) {
    return { success: false, error: secureResult.error || 'AI生成报价失败' };
  }

  // 注：secureCallAI 已用 QuoteResponseSchema 做了 Zod 校验；这里 cast any 是为了保留
  // 既有的"宽松字段访问"代码风格（例如 discount 既可能是数字也可能是对象，要按对象访问 .amount）
  const aiResult = secureResult.data as any;
  if (!validateQuoteResponse(aiResult)) {
    return { success: false, error: 'AI生成的报价格式异常，请重试' };
  }

  // ── Step 5: 规则引擎校验每一项 ──
  const items = (aiResult.items || []).map((item: any) => {
    const amount = item.amount || (item.quantity || 1) * item.unitPrice;
    const check = QUOTE_VALIDATION_RULES.validateItem(item.category || '', item.unitPrice);
    return {
      name: item.name,
      description: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || '项',
      unitPrice: item.unitPrice,
      amount,
      priceReference: item.priceReference || '',
      _warning: check.warning,
      _valid: check.valid,
    };
  });

  // Step 6: 整单校验
  const subtotal = aiResult.subtotal || items.reduce((sum: number, i: any) => sum + i.amount, 0);
  const quoteWarnings = QUOTE_VALIDATION_RULES.validateQuote(items, subtotal);

  // Step 7: 自动匹配付款分期方案
  const discountAmount = aiResult.discount?.amount || 0;
  const finalTotal = aiResult.finalTotal || subtotal - discountAmount;
  const suggestedPaymentPlan = PAYMENT_SPLIT_RULES.getPlan(finalTotal);

  return {
    success: true,
    data: {
      title: aiResult.title || '报价单',
      items,
      subtotal,
      discountAmount,
      finalTotal,
      paymentTerms: aiResult.paymentTerms,
      notes: aiResult.notes || '',
      estimatedDays: aiResult.estimatedDays,
      revisionPolicy: aiResult.revisionPolicy,
      bonusItems: aiResult.bonusItems,
      discount: aiResult.discount,
      negotiationTips: aiResult.negotiationTips,
      marketBenchmark: aiResult.marketBenchmark,
    },
    warnings: quoteWarnings,
    suggestedPaymentPlan: {
      strategy: suggestedPaymentPlan.strategy,
      label: suggestedPaymentPlan.label,
      splits: suggestedPaymentPlan.splits,
    },
    source: 'ai_semantic_separation + rules_engine',
  };
}


// ════════════════════════════════════════
// 1.5 报价调整：基于现有报价 + 用户指令，AI二次调整
// ════════════════════════════════════════

export async function smartAdjustQuote(params: {
  quoteId: string;
  userId: string;
  instruction: string; // 如 "客户预算只有1.5万，帮我砍到1.5万以内"
}) {
  const quote = await prisma.quote.findFirst({
    where: { id: params.quoteId, userId: params.userId },
    include: {
      client: { select: { name: true } },
      project: { select: { name: true } },
      items: { orderBy: { order: 'asc' } },
    },
  });
  if (!quote) throw new Error('报价单不存在');

  const currentItems = quote.items;
  const currentSummary = currentItems.map(i =>
    `- ${i.name}: ${i.quantity}${i.unit} × ¥${i.unitPrice} = ¥${i.amount}`
  ).join('\n');

  const systemPrompt = `你是「一木」平台的AI报价调整助手。用户已有一份报价单，现在需要根据新指令调整。

## 调整原则
1. 保留核心交付物，优先缩减非核心项目
2. 降价时优先减少数量/简化范围，而非直接压低单价（保护利润率）
3. 加价时说明增值理由
4. 每次调整后重新计算小计和合计
5. 保留原有的付款条款格式

返回JSON格式与原报价一致：
{
  "title": "报价单标题",
  "items": [{"name":"","description":"","quantity":1,"unit":"项","unitPrice":0,"amount":0}],
  "subtotal": 0,
  "finalTotal": 0,
  "discount": {"type":"","amount":0,"reason":""},
  "paymentTerms": "付款条款",
  "notes": "调整说明",
  "adjustmentSummary": "本次调整概要（给用户看的，说明砍了什么保留了什么）"
}`;

  const userPrompt = `## 当前报价单
标题：${quote.title}
客户：${quote.client?.name || '未知'}
当前合计：¥${quote.total}

### 明细：
${currentSummary}

付款条款：${quote.paymentTerms || '无'}
备注：${quote.notes || '无'}

## 调整指令
${params.instruction}

请根据调整指令修改报价单，返回完整JSON。`;

  const secureResult = await secureCallAI({
    userId: params.userId,
    task: 'quote.adjust',
    rawInput: params.instruction,
    systemPrompt,
    buildPromptFn: () => userPrompt,
    temperature: 0.5,
    maxTokens: 3000,
    schema: QuoteAdjustResponseSchema,
  });

  if (!secureResult.success) {
    return { success: false, error: secureResult.error || 'AI调整报价失败' };
  }

  // 同上：schema 已校验，cast any 沿用既有访问风格
  const aiResult = secureResult.data as any;

  // 规则引擎校验
  const items = (aiResult.items || []).map((item: any) => {
    const amount = item.amount || (item.quantity || 1) * item.unitPrice;
    const check = QUOTE_VALIDATION_RULES.validateItem(item.category || '', item.unitPrice);
    return {
      name: item.name,
      description: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || '项',
      unitPrice: item.unitPrice,
      amount,
      priceReference: item.priceReference || '',
      _warning: check.warning,
    };
  });

  const subtotal = aiResult.subtotal || items.reduce((sum: number, i: any) => sum + i.amount, 0);
  const discountAmount = aiResult.discount?.amount || 0;
  const finalTotal = aiResult.finalTotal || subtotal - discountAmount;
  const suggestedPaymentPlan = PAYMENT_SPLIT_RULES.getPlan(finalTotal);

  return {
    success: true,
    data: {
      title: aiResult.title || quote.title,
      items,
      subtotal,
      discountAmount,
      finalTotal,
      paymentTerms: aiResult.paymentTerms || quote.paymentTerms,
      notes: aiResult.notes || '',
      discount: aiResult.discount,
      adjustmentSummary: aiResult.adjustmentSummary || '',
    },
    suggestedPaymentPlan: {
      strategy: suggestedPaymentPlan.strategy,
      label: suggestedPaymentPlan.label,
      splits: suggestedPaymentPlan.splits,
    },
    previousTotal: quote.total,
    newTotal: finalTotal,
    savings: quote.total - finalTotal,
  };
}


// ════════════════════════════════════════
// 2. 记账解析：AI解析 → 规则校验 → 返回
// ════════════════════════════════════════

export async function smartParseTransaction(input: string, userId?: string) {
  const today = new Date().toISOString().split('T')[0];

  // 通过安全入口调用AI（五层防御）
  const secureResult = await secureCallAI({
    userId: userId || 'anonymous',
    task: 'transaction.parse',
    rawInput: input,
    systemPrompt: TRANSACTION_SYSTEM_PROMPT,
    buildPromptFn: (sanitized) => buildTransactionParsePrompt(sanitized, today),
    temperature: 0.3,
    schema: TransactionParseResponseSchema,
  });

  if (!secureResult.success) {
    return { success: false, error: secureResult.error || 'AI解析失败' };
  }

  // schema 是 union(单笔 | { transactions: [] })；这里 cast any 让分支访问更顺手
  const aiResult = secureResult.data as any;

  const isMultiple = aiResult.transactions && Array.isArray(aiResult.transactions);
  const transactions: any[] = isMultiple ? aiResult.transactions : [aiResult];

  for (const tx of transactions) {
    if (!validateTransactionResponse(tx)) {
      return { success: false, error: 'AI解析结果格式异常，请手动记账' };
    }
  }

  // 规则引擎增强：对每笔交易做本地分类校验和金额校验
  const parsedList = transactions.map((tx: any) => {
    const localClassify = TRANSACTION_INFERENCE_RULES.tryLocalClassify(tx.description || input);
    const category = localClassify?.category || tx.category || '其他支出';
    const subcategory = localClassify?.subcategory || tx.subcategory || '';
    const amountCheck = TRANSACTION_INFERENCE_RULES.amountSanityCheck(subcategory, Math.abs(tx.amount || 0));

    return {
      type: tx.type === 'income' ? 'income' as const : 'expense' as const,
      amount: Math.abs(tx.amount || 0),
      category,
      subcategory,
      description: tx.description || input,
      date: tx.date || today,
      paymentMethod: tx.paymentMethod || 'unknown',
      isBusiness: tx.isBusiness !== false,
      isDeductible: localClassify?.isDeductible || tx.isDeductible || false,
      taxCategory: tx.taxCategory || '',
      confidence: localClassify ? 0.95 : (tx.confidence || 0.8),
      fieldConfidence: tx.fieldConfidence || {},
      needsConfirmation: !amountCheck.valid || tx.needsConfirmation || false,
      confirmationReason: amountCheck.warning || tx.confirmationReason || '',
      amountCheck: amountCheck.valid
        ? (tx.amountCheck || { withinRange: true, typicalRange: '', note: '' })
        : { withinRange: false, typicalRange: '', note: amountCheck.warning },
      source: localClassify ? 'local_rules + ai' : 'ai',
    };
  });

  return {
    success: true,
    data: {
      parsed: isMultiple ? parsedList : parsedList[0],
      isMultiple,
      summary: aiResult.summary,
    },
  };
}


// ════════════════════════════════════════
// 3. 记账分类：先规则后AI，成本低95%
// ════════════════════════════════════════

export async function smartClassifyTransaction(params: {
  id: string;
  type: string;
  description: string;
  amount: number;
}) {
  const { id, type, description, amount } = params;

  // Step 1: 本地关键词匹配（0ms，¥0）
  const localResult = TRANSACTION_INFERENCE_RULES.tryLocalClassify(description);
  if (localResult && localResult.confidence >= 0.9) {
    const amountCheck = TRANSACTION_INFERENCE_RULES.amountSanityCheck(localResult.subcategory, amount);
    return {
      id,
      ...localResult,
      amountCheck,
      needsConfirmation: !amountCheck.valid,
      confirmationReason: amountCheck.warning || '',
      source: 'local_rules',
    };
  }

  // Step 2: 调AI分类（内部数据，直接调用 + 输出验证 + 审计）
  const startTime = Date.now();
  const userPrompt = buildClassifyPrompt(type, description, amount);
  const { data: aiResult, usage } = await callAI({
    task: 'transaction.classify',
    systemPrompt: CLASSIFY_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.2,
    maxTokens: 500,
    schema: ClassifyResponseSchema,
  });

  const validation = validateAIOutput(aiResult, 'transaction.classify');
  await logAIAudit({
    timestamp: new Date().toISOString(),
    userId: 'system',
    task: 'transaction.classify',
    inputHash: hashInput(description),
    inputLength: description.length,
    threats: [],
    sensitiveRedacted: [],
    outputValid: validation.valid,
    outputIssues: validation.issues,
    model: getModelForTask('transaction.classify'),
    latencyMs: Date.now() - startTime,
    tokenUsage: usage,
  });

  if (!aiResult.category) {
    throw new Error('AI分类结果异常');
  }

  // Step 3: AI结果校验
  const amountCheck = TRANSACTION_INFERENCE_RULES.amountSanityCheck(aiResult.subcategory || '', amount);

  return {
    id,
    category: aiResult.category,
    subcategory: aiResult.subcategory || '',
    isDeductible: aiResult.isDeductible || false,
    confidence: aiResult.confidence || 0.8,
    amountCheck,
    needsConfirmation: !amountCheck.valid,
    confirmationReason: amountCheck.warning || '',
    source: 'ai',
  };
}

/** 批量分类 */
export async function smartBatchClassify(records: { id: string; type: string; description: string; amount: number }[]) {
  const results: any[] = [];
  const needAI: typeof records = [];

  // Step 1: 先用本地规则过一遍
  for (const record of records) {
    const localResult = TRANSACTION_INFERENCE_RULES.tryLocalClassify(record.description);
    if (localResult && localResult.confidence >= 0.9) {
      const amountCheck = TRANSACTION_INFERENCE_RULES.amountSanityCheck(localResult.subcategory, record.amount);
      results.push({ id: record.id, ...localResult, amountCheck, source: 'local_rules' });
    } else {
      needAI.push(record);
    }
  }

  // Step 2: 剩余的交给AI批量处理（输出验证 + 审计）
  if (needAI.length > 0) {
    const batchStartTime = Date.now();
    const userPrompt = buildBatchClassifyPrompt(needAI);
    const { data: aiResult, usage } = await callAI({
      task: 'transaction.classify',
      systemPrompt: CLASSIFY_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 1500,
    });

    const validation = validateAIOutput(aiResult, 'transaction.classify');
    await logAIAudit({
      timestamp: new Date().toISOString(),
      userId: 'system',
      task: 'transaction.classify.batch',
      inputHash: hashInput(userPrompt),
      inputLength: userPrompt.length,
      threats: [],
      sensitiveRedacted: [],
      outputValid: validation.valid,
      outputIssues: validation.issues,
      model: getModelForTask('transaction.classify'),
      latencyMs: Date.now() - batchStartTime,
      tokenUsage: usage,
    });

    const aiResults = Array.isArray(aiResult) ? aiResult : aiResult.results || aiResult.classifications || [];
    for (const r of aiResults) {
      if (r.id && r.category) {
        const amountCheck = TRANSACTION_INFERENCE_RULES.amountSanityCheck(r.subcategory || '', r.amount || 0);
        results.push({ ...r, amountCheck, source: 'ai' });
      }
    }
  }

  return results;
}


// ════════════════════════════════════════
// 4. 催款：规则定级别 → AI写文案 → 合规校验
// ════════════════════════════════════════

export async function smartGenerateReminder(params: {
  paymentNodeId: string;
  userId: string;
  channelHint?: 'wechat' | 'email';
}) {
  // ── Step 1: 从数据库查出真实数据 ──
  const node = await prisma.paymentNode.findFirst({
    where: { id: params.paymentNodeId, userId: params.userId },
    include: {
      project: { select: { name: true, category: true } },
      client: { select: { name: true, contactPerson: true, projectCount: true } },
    },
  });
  if (!node) throw new Error('收款节点不存在');

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { name: true, companyName: true, phone: true, privacyMode: true },
  });

  const now = new Date();
  const dueDate = new Date(node.dueDate);
  const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

  // ── Step 2: 规则引擎确定催款级别 + 利息（纯本地） ──
  const level = REMINDER_ESCALATION_RULES.getLevel(overdueDays, node.reminderCount);
  const levelConfig = REMINDER_ESCALATION_RULES.levels[level];

  const interest = overdueDays >= 7
    ? REMINDER_ESCALATION_RULES.calculateOverdueInterest(node.amount, overdueDays)
    : null;

  // ── Step 3: 构建语义意图（不含任何真实数据） ──
  const intent = buildReminderIntent({
    amount: node.amount,
    overdueDays,
    reminderCount: node.reminderCount,
    clientProjectCount: node.client?.projectCount || 0,
    hasContract: false,
    serviceType: node.project?.category || 'design',
  });

  // ── Step 4: 获取模板（严格模式跳过AI，直接用兜底模板） ──
  let template: string;
  let cacheHit = false;

  if (user?.privacyMode === 'strict') {
    // 严格模式：纯规则引擎，零AI调用
    template = getFallbackTemplate('reminder', intent);
    await prisma.aICallLog.create({
      data: { userId: params.userId, task: 'reminder', intentParams: intent as any, dataSent: 'none', cacheHit: false },
    });
  } else {
    // 知识库延迟加载：仅缓存未命中时才查询并拼接
    const result = await getOrGenerateTemplate(
      'reminder',
      intent,
      async () => {
        const reminderKnowledge = await getRelevantKnowledge(
          'reminder.generate',
          ['催款', '逾期', intent.overdueTier].join(' ')
        );
        return REMINDER_SYSTEM_PROMPT + reminderKnowledge.injection;
      },
      params.userId,
    );
    template = result.template;
    cacheHit = result.cacheHit;
  }

  // ── Step 5: 本地填充真实数据 ──
  const signerName = user?.companyName || user?.name || '一木用户';
  const content = fillTemplate(template, {
    CLIENT: node.client?.contactPerson || node.client?.name || '未知客户',
    PROJECT: node.project?.name || '未命名项目',
    PAYMENT_NAME: node.name,
    AMOUNT: `¥${node.amount.toLocaleString()}`,
    OVERDUE_DAYS: String(overdueDays),
    DUE_DATE: formatDate(node.dueDate),
    USER_NAME: signerName,
    USER_COMPANY: user?.companyName || '',
    USER_PHONE: user?.phone || '',
  });

  return {
    content,
    level,
    levelName: levelConfig.name,
    tone: levelConfig.tone,
    channels: levelConfig.channels,
    generatePDF: levelConfig.generatePDF,
    interest,
    overdueDays,
    reminderCount: node.reminderCount + 1,
    legalBasis: interest?.legalBasis,
    overdueInterest: interest ? `¥${interest.interest}` : undefined,
    channel: params.channelHint || 'wechat',
    cacheHit,
    source: user?.privacyMode === 'strict' ? 'rules_engine' : (cacheHit ? 'rules_engine + cache' : 'rules_engine + ai_template'),
  };
}


// ════════════════════════════════════════
// 5. 经营洞察：规则计算健康分 + AI生成建议
// ════════════════════════════════════════

/** 洞察数据上下文 — 数据查询+规则计算的完整结果 */
export interface InsightContext {
  // 原始指标
  monthIncome: number;
  monthExpense: number;
  lastMonthIncome: number;
  lastMonthExpense: number;
  monthBeforeLastIncome: number;
  yearIncome: number;
  yearExpense: number;
  quarterIncome: number;
  monthClientCount: number;
  expenseBreakdown: Record<string, number>;
  overduePayments: { project: string; client: string; amount: number; days: number }[];
  pendingPayments: { project: string; client: string; amount: number; dueDate: string }[];
  topClients: { name: string; revenue: number }[];
  activeClientCount: number;
  activeProjectCount: number;
  recentProjects: { name: string; status: string; deadline?: string }[];
  pipelineProjects: { name: string; stage: 'negotiating' | 'quoted' }[];
  entityType: 'individual' | 'sole_proprietor' | 'micro_company';
  userName: string;
  // 规则引擎计算结果
  profitRate: number;
  dimensionScores: Record<string, number>;
  rulesHealthScore: number;
  taxAlerts: string[];
  rulesInsights: any[];
}

/**
 * Step 1: 聚合数据 + 规则引擎计算（无AI调用，~200ms纯DB）
 * 可独立调用，页面加载时即时展示健康分和规则预警
 */
export async function gatherInsightContext(userId: string): Promise<InsightContext> {
  const now = new Date();

  // 时区策略：所有月份/年份/季度边界按北京时间（UTC+8）算。原版用 new Date(yyyy, mm, 1)
  // 走服务器 TZ，UTC 服务器会把"北京 5/1 00:30"的交易切到 4 月份，月度同比/环比全错。
  const { year, month } = beijingYMD(now); // month 1..12
  const { start: monthStart, end: monthEnd } = beijingMonthRange(year, month);
  const lastMonthY = month === 1 ? year - 1 : year;
  const lastMonthM = month === 1 ? 12 : month - 1;
  const { start: lastMonthStart } = beijingMonthRange(lastMonthY, lastMonthM);
  const lastMonthEnd = monthStart;
  const beforeLastY = lastMonthM === 1 ? lastMonthY - 1 : lastMonthY;
  const beforeLastM = lastMonthM === 1 ? 12 : lastMonthM - 1;
  const { start: monthBeforeLastStart } = beijingMonthRange(beforeLastY, beforeLastM);
  const monthBeforeLastEnd = lastMonthStart;
  const threeAgoY = beforeLastM === 1 ? beforeLastY - 1 : beforeLastY;
  const threeAgoM = beforeLastM === 1 ? 12 : beforeLastM - 1;
  const { start: threeMonthsAgo } = beijingMonthRange(threeAgoY, threeAgoM);
  const { start: yearStart } = beijingMonthRange(year, 1);
  const quarterStart = beijingQuarterStart(now);

  const [
    monthIncomeAgg, monthExpenseAgg,
    lastMonthIncomeAgg, lastMonthExpenseAgg,
    monthBeforeLastIncomeAgg,
    yearIncomeAgg, yearExpenseAgg, quarterIncomeAgg,
    monthExpenseByCategory,
    overduePaymentNodes, pendingPaymentNodes,
    monthTransactionsByClient, activeClients,
    activeProjectCount, recentProjects, pipelineProjects,
    user,
  ] = await Promise.all([
    prisma.transaction.aggregate({ where: { userId, type: 'income', date: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'expense', date: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'income', date: { gte: lastMonthStart, lt: lastMonthEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'expense', date: { gte: lastMonthStart, lt: lastMonthEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'income', date: { gte: monthBeforeLastStart, lt: monthBeforeLastEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'income', date: { gte: yearStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'expense', date: { gte: yearStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, type: 'income', date: { gte: quarterStart, lt: monthEnd } }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ['category'], where: { userId, type: 'expense', date: { gte: monthStart, lt: monthEnd } }, _sum: { amount: true } }),
    // 逾期/未到期分界线：北京今天 00:00（= 昨天 24:00），保证截止当天 24:00 前不算逾期
    prisma.paymentNode.findMany({ where: { userId, status: { in: ['pending', 'reminded'] }, dueDate: { lt: beijingMidnight(now) } }, include: { project: { select: { name: true } }, client: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 10 }),
    prisma.paymentNode.findMany({ where: { userId, status: { in: ['pending', 'reminded'] }, dueDate: { gte: beijingMidnight(now) } }, include: { project: { select: { name: true } }, client: { select: { name: true } } }, orderBy: { dueDate: 'asc' }, take: 10 }),
    prisma.transaction.groupBy({ by: ['clientId'], where: { userId, type: 'income', date: { gte: monthStart, lt: monthEnd }, clientId: { not: null } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } }, take: 10 }),
    prisma.transaction.groupBy({ by: ['clientId'], where: { userId, date: { gte: threeMonthsAgo }, clientId: { not: null } }, _count: true }),
    prisma.project.count({ where: { userId, status: { in: ['in_progress', 'review'] } } }),
    prisma.project.findMany({ where: { userId, status: { not: 'cancelled' } }, select: { name: true, status: true, deadline: true }, orderBy: { updatedAt: 'desc' }, take: 8 }),
    prisma.project.findMany({ where: { userId, status: 'quoted' }, select: { name: true, status: true }, take: 5 }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, businessType: true, entityType: true } }),
  ]);

  // ── 数据整理 ──
  const monthIncome = monthIncomeAgg._sum.amount || 0;
  const monthExpense = monthExpenseAgg._sum.amount || 0;
  const lastMonthIncome = lastMonthIncomeAgg._sum.amount || 0;
  const lastMonthExpense = lastMonthExpenseAgg._sum.amount || 0;
  const monthBeforeLastIncome = monthBeforeLastIncomeAgg._sum.amount || 0;
  const yearIncome = yearIncomeAgg._sum.amount || 0;
  const yearExpense = yearExpenseAgg._sum.amount || 0;
  const quarterIncome = quarterIncomeAgg._sum.amount || 0;

  const expenseBreakdown: Record<string, number> = {};
  for (const item of monthExpenseByCategory) {
    expenseBreakdown[item.category] = (expenseBreakdown[item.category] || 0) + (item._sum.amount || 0);
  }

  const overduePayments = overduePaymentNodes.map(p => ({
    project: p.project?.name || '未知项目',
    client: p.client?.name || '未知客户',
    amount: p.amount,
    days: Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / 86400000),
  }));

  const pendingPayments = pendingPaymentNodes.map(p => ({
    project: p.project?.name || '未知项目',
    client: p.client?.name || '未知客户',
    amount: p.amount,
    dueDate: formatDate(p.dueDate),
  }));

  const clientIds = monthTransactionsByClient.filter(t => t.clientId).map(t => t.clientId as string);
  const clientNames = clientIds.length > 0
    ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const clientNameMap = new Map(clientNames.map(c => [c.id, c.name]));
  const topClients = monthTransactionsByClient.map(t => ({
    name: clientNameMap.get(t.clientId || '') || '未知客户',
    revenue: t._sum.amount || 0,
  }));

  const monthClientCount = monthTransactionsByClient.length;

  const statusToStage = (status: string) => {
    if (status === 'quoted') return 'quoted' as const;
    return 'negotiating' as const;
  };

  // ── 规则引擎计算 ──
  const profitRate = monthIncome > 0 ? (monthIncome - monthExpense) / monthIncome : 0;
  const maxOverdueDays = overduePayments.length > 0 ? Math.max(...overduePayments.map(p => p.days)) : 0;
  const totalOverdue = overduePayments.reduce((s, p) => s + p.amount, 0);
  const receivableRatio = monthIncome > 0 ? totalOverdue / monthIncome : 0;
  const topClientRevenue = topClients.length > 0 ? topClients[0].revenue : 0;
  const topClientRatio = monthIncome > 0 ? topClientRevenue / monthIncome : 0;

  // 从 User.entityType 字段读取身份类型
  const rawEntityType = user?.entityType || 'freelance';
  const entityType = rawEntityType === 'sole_proprietor' ? 'sole_proprietor' as const
    : rawEntityType === 'micro_company' ? 'micro_company' as const
      : 'individual' as const; // individual 和 freelance 统一按个体户处理

  const taxAlerts = TAX_RULES_2026.checkTaxThresholds({
    monthlyIncome: monthIncome,
    quarterlyIncome: quarterIncome,
    yearlyProfit: yearIncome - yearExpense,
    entityType,
  });

  const dimensionScores = {
    income: HEALTH_SCORE_RULES.dimensions.income.score(monthIncome, lastMonthIncome),
    cost: HEALTH_SCORE_RULES.dimensions.cost.score(profitRate),
    cashflow: HEALTH_SCORE_RULES.dimensions.cashflow.score(overduePayments.length, maxOverdueDays, receivableRatio),
    clientDiversity: HEALTH_SCORE_RULES.dimensions.clientDiversity.score(topClientRatio, activeClients.length),
    pipeline: HEALTH_SCORE_RULES.dimensions.pipeline.score(activeProjectCount, pipelineProjects.length > 0, false),
    taxEfficiency: HEALTH_SCORE_RULES.dimensions.taxEfficiency.score(taxAlerts.length > 0, false),
  };

  const rulesHealthScore = HEALTH_SCORE_RULES.calculateOverall(dimensionScores);

  // ── 规则引擎生成即时洞察（无需AI） ──
  const rulesInsights: any[] = [];

  // 逾期预警
  if (overduePayments.length > 0) {
    const totalOverdueAmt = overduePayments.reduce((s, p) => s + p.amount, 0);
    const worst = overduePayments.reduce((a, b) => a.days > b.days ? a : b);
    rulesInsights.push({
      priority: worst.days > 30 ? 'urgent' : 'warning',
      dimension: 'cashflow',
      icon: worst.days > 30 ? '🚨' : '⚠️',
      title: `${overduePayments.length}笔逾期应收`,
      content: `逾期总额¥${totalOverdueAmt.toLocaleString()}，最长逾期${worst.days}天（${worst.client}的${worst.project}）`,
      action: '立即跟进逾期最久的客户，发送催款提醒',
    });
  }

  // 收入趋势预警
  if (lastMonthIncome > 0) {
    const changeRate = (monthIncome - lastMonthIncome) / lastMonthIncome;
    if (changeRate <= -0.2) {
      rulesInsights.push({
        priority: 'warning',
        dimension: 'income',
        icon: '📉',
        title: '收入环比下降',
        content: `本月收入¥${monthIncome.toLocaleString()}，较上月下降${Math.abs(Math.round(changeRate * 100))}%`,
        action: '检查项目管道，加速在谈项目推进或拓展新客户',
      });
    } else if (changeRate >= 0.3 && monthIncome >= 10000) {
      rulesInsights.push({
        priority: 'achievement',
        dimension: 'income',
        icon: '🎉',
        title: '收入显著增长',
        content: `本月收入¥${monthIncome.toLocaleString()}，较上月增长${Math.round(changeRate * 100)}%`,
        action: '保持势头，考虑将成功经验复制到更多客户',
      });
    }
  }

  // 利润率预警
  if (monthIncome > 0 && profitRate < 0.2) {
    rulesInsights.push({
      priority: 'warning',
      dimension: 'cost',
      icon: '💸',
      title: '利润率偏低',
      content: `本月利润率仅${Math.round(profitRate * 100)}%，支出¥${monthExpense.toLocaleString()}占收入比过高`,
      action: '逐项审查本月支出，找出可优化的成本项',
    });
  }

  // 客户集中度预警
  if (topClientRatio > 0.5 && monthIncome > 0) {
    rulesInsights.push({
      priority: 'warning',
      dimension: 'client',
      icon: '👤',
      title: '客户过于集中',
      content: `最大客户「${topClients[0]?.name}」占本月收入${Math.round(topClientRatio * 100)}%，依赖风险高`,
      action: '积极拓展新客户渠道，降低单一客户依赖',
    });
  }

  // 项目管道空窗
  if (activeProjectCount === 0 && pipelineProjects.length === 0) {
    rulesInsights.push({
      priority: 'urgent',
      dimension: 'pipeline',
      icon: '🔴',
      title: '项目管道空窗',
      content: '当前无进行中项目且无待报价项目，收入可能断档',
      action: '立即启动获客行动：联系老客户、发朋友圈、或投放推广',
    });
  } else if (activeProjectCount > 5) {
    rulesInsights.push({
      priority: 'warning',
      dimension: 'pipeline',
      icon: '⚡',
      title: '项目过载',
      content: `当前${activeProjectCount}个项目同时进行，超过建议上限4个`,
      action: '评估优先级，考虑推迟低优先级项目或外包部分工作',
    });
  }

  // 税务预警
  for (const alert of taxAlerts) {
    rulesInsights.push({
      priority: 'warning',
      dimension: 'tax',
      icon: '🧾',
      title: '税务提醒',
      content: alert,
      action: '咨询财税顾问或调整收入确认节奏',
    });
  }

  return {
    monthIncome, monthExpense, lastMonthIncome, lastMonthExpense,
    monthBeforeLastIncome, yearIncome, yearExpense, quarterIncome,
    monthClientCount, expenseBreakdown,
    overduePayments, pendingPayments,
    topClients, activeClientCount: activeClients.length,
    activeProjectCount,
    recentProjects: recentProjects.map(p => ({ name: p.name, status: p.status, deadline: p.deadline ? formatDate(p.deadline) : undefined })),
    pipelineProjects: pipelineProjects.map(p => ({ name: p.name, stage: statusToStage(p.status) })),
    entityType, userName: user?.name || '一木用户',
    profitRate, dimensionScores, rulesHealthScore, taxAlerts, rulesInsights,
  };
}

/**
 * 规则即时洞察（无AI调用）— 页面加载时自动展示
 * 返回健康分 + 维度得分 + 规则生成的预警洞察 + 数据快照
 */
export function buildRulesInsightResponse(ctx: InsightContext) {
  return {
    healthScore: ctx.rulesHealthScore,
    scoreDimensions: ctx.dimensionScores,
    insights: ctx.rulesInsights,
    taxAlerts: ctx.taxAlerts,
    dataSnapshot: {
      monthIncome: ctx.monthIncome,
      monthExpense: ctx.monthExpense,
      lastMonthIncome: ctx.lastMonthIncome,
      lastMonthExpense: ctx.lastMonthExpense,
      profitRate: ctx.monthIncome > 0 ? Math.round(ctx.profitRate * 100) : 0,
      overdueCount: ctx.overduePayments.length,
      activeProjects: ctx.activeProjectCount,
      activeClients: ctx.activeClientCount,
    },
    mode: 'rules' as const,
  };
}

/**
 * AI深度洞察（规则 + AI）— 用户点击时调用
 * 在规则结果基础上叠加AI的深度分析建议
 * AI失败时降级返回纯规则结果
 *
 * `onProgress` —— 流式调用方传进来后，会在每个阶段发出进度事件，让 UI 把"卡住的 spinner"变成"动起来的进度提示"。
 *  非流式调用方完全不传，沿用旧行为（noopEmit 啥也不干）。
 */
export async function smartGenerateInsight(
  userId: string,
  options: { onProgress?: ProgressEmit } = {},
) {
  const emit = options.onProgress ?? noopEmit;

  // ── Step 1: 聚合数据 + 规则引擎计算（100%本地） ──
  emit({ phase: 'gathering', message: '收集本月经营数据...' });
  const ctx = await gatherInsightContext(userId);

  // ── Step 2: 健康分已在 gatherInsightContext 中用 HEALTH_SCORE_RULES 计算完毕 ──
  emit({ phase: 'rules', message: '规则引擎评分中...' });

  // ── Step 3: 检查隐私模式 ──
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { privacyMode: true } });
  const isStrictMode = user?.privacyMode === 'strict';

  // ── Step 4: 构建语义意图（不含真实数据） ──
  const maxOverdueDays = ctx.overduePayments.length > 0
    ? Math.max(...ctx.overduePayments.map(p => p.days))
    : 0;
  const topClientRatio = ctx.monthIncome > 0 && ctx.topClients.length > 0
    ? ctx.topClients[0].revenue / ctx.monthIncome
    : 0;

  const intent = buildInsightIntent({
    monthIncome: ctx.monthIncome,
    lastMonthIncome: ctx.lastMonthIncome,
    monthExpense: ctx.monthExpense,
    overdueCount: ctx.overduePayments.length,
    maxOverdueDays,
    topClientRatio,
    activeProjects: ctx.activeProjectCount,
    hasLeads: ctx.pipelineProjects.length > 0,
    entityType: ctx.entityType,
    currentMonth: beijingYMD().month,
    quarterIncome: ctx.quarterIncome,
    yearProfit: ctx.yearIncome - ctx.yearExpense,
  });

  // ── Step 5: 获取AI洞察模板（严格模式跳过） ──
  let aiInsightContent = '';
  let cacheHit = false;

  if (!isStrictMode) {
    emit({ phase: 'ai', message: '小木深度思考中...' });
    try {
      // 知识库延迟加载：仅缓存未命中时才查询并拼接
      const result = await getOrGenerateTemplate(
        'insight',
        intent,
        async () => {
          const insightKnowledge = await getRelevantKnowledge(
            'insight.generate',
            [ctx.entityType || '', '经营', '税收', '利润'].join(' '),
            { city: (ctx as any).city }
          );
          return INSIGHT_SYSTEM_PROMPT + insightKnowledge.injection;
        },
        userId,
      );
      aiInsightContent = result.template;
      cacheHit = result.cacheHit;
      emit({ phase: 'ai-done', message: cacheHit ? '小木命中过往经验...' : '小木分析完成...' });
    } catch (err) {
      console.warn('[INSIGHT] AI模板获取失败，降级为纯规则洞察:', err);
      emit({ phase: 'ai-fallback', message: 'AI 不可用，仅展示规则洞察' });
    }
  } else {
    // 严格模式：记录日志，使用兜底模板
    await prisma.aICallLog.create({
      data: { userId, task: 'insight', intentParams: intent as any, dataSent: 'none', cacheHit: false },
    });
    aiInsightContent = getFallbackTemplate('insight', intent);
  }

  // ── Step 6: 本地填充真实数据 ──
  const filledInsight = aiInsightContent ? fillTemplate(aiInsightContent, {
    MONTH_INCOME: `¥${ctx.monthIncome.toLocaleString()}`,
    LAST_MONTH_INCOME: `¥${ctx.lastMonthIncome.toLocaleString()}`,
    PROFIT_RATE: `${ctx.monthIncome > 0 ? Math.round(ctx.profitRate * 100) : 0}%`,
    TOP_CLIENT: ctx.topClients[0]?.name || '',
    TOP_CLIENT_RATIO: `${Math.round(topClientRatio * 100)}%`,
    QUARTER_INCOME: `¥${ctx.quarterIncome.toLocaleString()}`,
    TAX_THRESHOLD: ctx.entityType === 'micro_company' ? '¥300万' : '¥200万',
  }) : '';

  // ── Step 7: 合并规则洞察 + AI洞察 ──
  const mergedInsights = [...ctx.rulesInsights];
  if (filledInsight) {
    mergedInsights.push({
      priority: 'info',
      dimension: 'ai_summary',
      icon: '🤖',
      title: '小木经营建议',
      content: filledInsight,
      action: '',
    });
  }

  return {
    healthScore: ctx.rulesHealthScore,
    rulesHealthScore: ctx.rulesHealthScore,
    scoreDimensions: ctx.dimensionScores,
    insights: mergedInsights,
    taxAlerts: ctx.taxAlerts,
    dataSnapshot: {
      monthIncome: ctx.monthIncome,
      monthExpense: ctx.monthExpense,
      lastMonthIncome: ctx.lastMonthIncome,
      lastMonthExpense: ctx.lastMonthExpense,
      profitRate: ctx.monthIncome > 0 ? Math.round(ctx.profitRate * 100) : 0,
      overdueCount: ctx.overduePayments.length,
      activeProjects: ctx.activeProjectCount,
      activeClients: ctx.activeClientCount,
    },
    cacheHit,
    mode: isStrictMode ? 'rules' as const : 'full' as const,
  };
}


// ════════════════════════════════════════
// 6. 合同生成：AI生成条款 → 安全校验 → 返回
// ════════════════════════════════════════

export async function smartGenerateContract(params: {
  quoteSummary: string;
  clientName: string;
  clientContact?: string;
  userName: string;
  userCompany?: string;
  serviceType: 'design' | 'development' | 'content' | 'consulting' | 'operation';
  paymentTerms: string;
  deliverables: string[];
  revisionLimit: number;
  totalAmount: number;
  estimatedDays: number;
  includeNDA?: boolean;
  includeNonCompete?: boolean;
  afterSupportDays?: number;
  customClauses?: string[];
  userId?: string;
  /** 流式调用方传入；非流式调用方不传，沿用旧行为 */
  onProgress?: ProgressEmit;
}) {
  const emit = params.onProgress ?? noopEmit;
  emit({ phase: 'preparing', message: '准备合同条款模板...' });

  // Step 1: 通过安全入口调用AI（五层防御）
  emit({ phase: 'ai', message: '小木撰写合同条款中...' });
  const secureResult = await secureCallAI({
    userId: params.userId || 'anonymous',
    task: 'contract.generate',
    rawInput: params.quoteSummary,
    systemPrompt: CONTRACT_SYSTEM_PROMPT,
    buildPromptFn: (sanitized) => buildContractPrompt({
      ...params,
      quoteSummary: sanitized,
    }),
    temperature: 0.4,
    maxTokens: 4000,
    schema: ContractResponseSchema,
  });

  if (!secureResult.success) {
    return { success: false, error: secureResult.error || 'AI合同生成失败' };
  }

  emit({ phase: 'validating', message: '校验合同条款完整性...' });
  // schema 已校验过；这里 cast any 沿用既有访问风格
  const aiResult = secureResult.data as any;

  // Step 2: 结构校验
  if (!aiResult.clauses || !Array.isArray(aiResult.clauses) || aiResult.clauses.length < 8) {
    return { success: false, error: 'AI生成的合同条款不完整，请重试' };
  }

  // Step 3: 强制免责声明（双重保障，security.ts 已校验一次）
  if (!aiResult.disclaimer || !aiResult.disclaimer.includes('仅供参考')) {
    aiResult.disclaimer = '本合同条款由小木辅助生成，仅供参考，不构成正式法律意见。建议在签署前请专业律师审核。一木平台不对因使用本条款产生的任何法律后果承担责任。';
  }

  // Step 4: 校验关键条款存在性
  const clauseTitles = aiResult.clauses.map((c: any) => c.title || '');
  const requiredKeywords = ['服务范围', '交付', '费用', '违约', '知识产权'];
  const missingClauses = requiredKeywords.filter(
    kw => !clauseTitles.some((t: string) => t.includes(kw))
  );

  return {
    success: true,
    data: {
      contractTitle: aiResult.contractTitle || `${params.clientName} - 服务合同`,
      partyA: aiResult.partyA || { name: params.clientName, role: '委托方' },
      partyB: aiResult.partyB || { name: params.userName, role: '受托方' },
      clauses: aiResult.clauses,
      attachments: aiResult.attachments || [],
      riskWarnings: aiResult.riskWarnings || [],
      signingGuide: aiResult.signingGuide || '',
      disclaimer: aiResult.disclaimer,
    },
    warnings: missingClauses.length > 0
      ? [`以下关键条款可能缺失: ${missingClauses.join('、')}，请人工检查`]
      : [],
    source: 'ai_qwen + security_validation',
  };
}
