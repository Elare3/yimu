// ============================================================
// 一木 YiMu — 语义分离层
// 将真实业务数据 → 抽象意图参数（零隐私数据）
// AI永远不接触用户真实数据
// ============================================================

import * as crypto from 'crypto';
import { REMINDER_ESCALATION_RULES } from './rules';
import { PROMPT_VERSION } from './prompts';

// ═══ 通用参数转换函数 ═══

export function amountTier(amount: number): string {
  if (amount < 1000) return 'micro';
  if (amount < 5000) return 'small';
  if (amount < 20000) return 'medium';
  if (amount < 50000) return 'large';
  if (amount < 200000) return 'major';
  return 'enterprise';
}

export function overdueTier(days: number): string {
  if (days <= 0) return 'due_today';
  if (days <= 3) return 'just_overdue';
  if (days <= 7) return 'one_week';
  if (days <= 14) return 'two_weeks';
  if (days <= 30) return 'one_month';
  return 'over_month';
}

export function incomeTrend(current: number, previous: number): string {
  if (previous === 0) return 'first_month';
  const change = (current - previous) / previous;
  if (change > 0.2) return 'strong_growth';
  if (change > 0) return 'slight_growth';
  if (change > -0.2) return 'slight_decline';
  return 'significant_decline';
}

export function profitTier(rate: number): string {
  if (rate >= 0.6) return 'excellent';
  if (rate >= 0.4) return 'healthy';
  if (rate >= 0.2) return 'thin';
  return 'loss';
}

export function concentrationTier(topRatio: number): string {
  if (topRatio < 0.3) return 'healthy';
  if (topRatio < 0.5) return 'moderate';
  return 'risky';
}

export function relationshipTier(projectCount: number, paymentSpeed?: string): string {
  if (projectCount >= 3 && paymentSpeed !== 'slow' && paymentSpeed !== 'deadbeat') return 'trusted_partner';
  if (projectCount >= 1) return 'established';
  return 'new_client';
}

export function pipelineTier(active: number, hasLeads: boolean): string {
  if (active === 0 && !hasLeads) return 'empty';
  if (active <= 1) return 'thin';
  if (active <= 4) return 'healthy';
  return 'overloaded';
}

export function cashflowTier(overdueCount: number, maxOverdueDays: number): string {
  if (overdueCount === 0) return 'good';
  if (maxOverdueDays <= 7) return 'moderate';
  if (maxOverdueDays <= 30) return 'stressed';
  return 'critical';
}

export function complexityTier(requirementLength: number): string {
  if (requirementLength < 50) return 'simple';
  if (requirementLength < 200) return 'medium';
  if (requirementLength < 500) return 'complex';
  return 'enterprise';
}

export function deadlineTier(daysUntilDeadline?: number): string {
  if (!daysUntilDeadline) return 'unspecified';
  if (daysUntilDeadline > 30) return 'relaxed';
  if (daysUntilDeadline > 14) return 'normal';
  if (daysUntilDeadline > 7) return 'tight';
  return 'rush';
}

/** 报价接受率分层（用于历史信号意图） */
export function tierAcceptRate(rate: number): string {
  if (rate >= 0.7) return 'high';      // 报价很受欢迎
  if (rate >= 0.4) return 'mid';       // 半数成交
  if (rate >= 0.2) return 'low';       // 多被拒
  return 'very_low';                    // 几乎不成交，说明定价/方向有问题
}

// ═══ 各任务的意图构建函数 ═══

export function buildReminderIntent(data: {
  amount: number;
  overdueDays: number;
  reminderCount: number;
  clientProjectCount: number;
  clientPaymentSpeed?: string;
  hasContract: boolean;
  serviceType: string;
}) {
  const level = REMINDER_ESCALATION_RULES.getLevel(data.overdueDays, data.reminderCount);
  return {
    task: 'reminder' as const,
    level,
    amountTier: amountTier(data.amount),
    overdueTier: overdueTier(data.overdueDays),
    relationship: relationshipTier(data.clientProjectCount, data.clientPaymentSpeed),
    previousReminders: data.reminderCount,
    hasContract: data.hasContract,
    serviceType: data.serviceType,
    channels: REMINDER_ESCALATION_RULES.levels[level].channels,
    generatePDF: REMINDER_ESCALATION_RULES.levels[level].generatePDF || false,
  };
}

export function buildQuoteIntent(data: {
  serviceType: string;
  requirementText: string;
  requirementKeywords: string[];
  budgetHint?: number;
  userExperience?: string;
  clientProjectCount: number;
  clientPaymentSpeed?: string;
  deadline?: number;
}) {
  return {
    task: 'quote' as const,
    serviceType: data.serviceType,
    complexity: complexityTier(data.requirementText.length),
    userExperience: data.userExperience || 'mid',
    clientBudgetTier: data.budgetHint ? amountTier(data.budgetHint) : 'unspecified',
    relationship: relationshipTier(data.clientProjectCount, data.clientPaymentSpeed),
    deadline: deadlineTier(data.deadline),
    requirementKeywords: data.requirementKeywords,
  };
}

export function buildInsightIntent(data: {
  monthIncome: number;
  lastMonthIncome: number;
  monthExpense: number;
  overdueCount: number;
  maxOverdueDays: number;
  topClientRatio: number;
  activeProjects: number;
  hasLeads: boolean;
  entityType: string;
  currentMonth: number;
  quarterIncome?: number;
  yearProfit?: number;
}) {
  const profitRate = data.monthIncome > 0 ? (data.monthIncome - data.monthExpense) / data.monthIncome : 0;
  return {
    task: 'insight' as const,
    incomeTrend: incomeTrend(data.monthIncome, data.lastMonthIncome),
    profitTier: profitTier(profitRate),
    cashflowStatus: cashflowTier(data.overdueCount, data.maxOverdueDays),
    concentrationTier: concentrationTier(data.topClientRatio),
    pipelineStatus: pipelineTier(data.activeProjects, data.hasLeads),
    overdueCount: data.overdueCount,
    activeProjects: data.activeProjects,
    entityType: data.entityType,
    currentMonth: data.currentMonth,
    taxApproaching: data.quarterIncome ? data.quarterIncome > 250000 : false,
    profitNearThreshold: data.yearProfit ? (
      data.entityType === 'individual' ? data.yearProfit > 1800000 :
      data.entityType === 'micro_company' ? data.yearProfit > 2500000 : false
    ) : false,
  };
}

// ═══ 从需求文本提取关键词（不含隐私信息） ═══

export function extractKeywords(text: string): string[] {
  // 移除可能的客户名称、联系方式等
  const cleaned = text
    .replace(/1[3-9]\d{9}/g, '')            // 手机号
    .replace(/[\w.-]+@[\w.-]+\.\w{2,}/g, '') // 邮箱
    .replace(/\d{17}[\dXx]/g, '');           // 身份证

  // 提取服务类型相关关键词
  const serviceKeywords = [
    '官网', '网站', '小程序', 'APP', 'Logo', 'VI', '海报', '包装',
    '视频', '短视频', '文案', '公众号', '小红书', '详情页', 'Banner',
    '响应式', '移动端', 'H5', '原型', 'UI', '插画', '三维', '动画',
    '页', '套', '张', '条', '个', '版', '稿',
  ];

  const found = serviceKeywords.filter(kw => cleaned.includes(kw));

  // 提取数量词（如"5页""3套"）
  const quantities = cleaned.match(/\d+[页套张条个版稿]/g) || [];

  return Array.from(new Set([...found, ...quantities])).slice(0, 10);
}

// ═══ 意图哈希（用于缓存命中） ═══

/**
 * 把意图参数 + 当前 PROMPT_VERSION 混合后 md5，截 12 位作为模板缓存 key。
 *
 * 把 PROMPT_VERSION 烤进哈希里 ——  prompts.ts 的 system foundation 一旦升级（PROMPT_VERSION ++），
 * 整批旧缓存自动 miss 重新生成，不用写迁移脚本删 AITemplateCache 表。
 */
export function hashIntent(intent: Record<string, unknown>): string {
  const { task, ...params } = intent;
  // 注入版本号；下游 task 列里也带版本，避免不同 task 共享同一个 hash
  const versionedParams = { ...params, __pv: PROMPT_VERSION };
  const normalized = JSON.stringify(versionedParams, Object.keys(versionedParams).sort());
  return `${task}_${crypto.createHash('md5').update(normalized).digest('hex').slice(0, 12)}`;
}
