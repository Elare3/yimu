// ============================================================
// 一木 YiMu — AI 输出 Zod schemas（A1）
//
// 每个 AI 任务的输出都有对应的 schema。callAI 拿到 LLM 返回 + JSON.parse 后，
// 用 schema 校验：失败一次 → 重试一次（带"上次输出不合规"提示）→ 仍失败抛
// AIError(kind:'schema')，由 orchestrator 走规则兜底。
//
// 设计取舍：
//   • 用 .passthrough() 不剥离多余字段 —— LLM 偶尔会多返回 hint/explanation，
//     不阻断主流程；只确保关键字段存在且类型正确
//   • 数值字段一律 .nonnegative()，金额不能负
//   • 字符串字段限定 max，防止 prompt 注入回流污染下游存储
// ============================================================

import { z } from 'zod';

// ── 报价生成 ──
const QuoteItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  quantity: z.number().nonnegative(),
  unit: z.string().max(20).default('项'),
  unitPrice: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  priceReference: z.string().max(200).optional().default(''),
}).passthrough();

const PaymentMilestoneSchema = z.object({
  stage: z.string().max(50),
  percentage: z.number().min(0).max(100),
  amount: z.number().nonnegative(),
  trigger: z.string().max(100).optional().default(''),
}).passthrough();

export const QuoteResponseSchema = z.object({
  title: z.string().min(1).max(200),
  items: z.array(QuoteItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  // discount 既可能是数字也可能是结构体，兼容两种
  discount: z.union([
    z.number().nonnegative(),
    z.object({
      type: z.string().optional(),
      description: z.string().max(300).optional(),
      amount: z.number().nonnegative(),
    }).passthrough(),
  ]).optional(),
  finalTotal: z.number().nonnegative().optional(),
  paymentTerms: z.union([
    z.string().max(2000),
    z.object({
      plan: z.string().max(2000),
      milestones: z.array(PaymentMilestoneSchema).optional(),
    }).passthrough(),
  ]).optional(),
  estimatedDays: z.number().nonnegative().optional(),
  revisionPolicy: z.string().max(500).optional(),
  notes: z.string().max(2000).optional().default(''),
  bonusItems: z.string().max(500).optional().default(''),
  negotiationTips: z.string().max(1000).optional().default(''),
  marketBenchmark: z.string().max(500).optional().default(''),
}).passthrough();

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// ── 交易解析（单笔 / 多笔） ──
const SingleTransactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  category: z.string().min(1).max(50),
  subcategory: z.string().max(50).optional().default(''),
  description: z.string().max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 必须为 YYYY-MM-DD'),
  paymentMethod: z.enum(['wechat', 'alipay', 'bank_transfer', 'credit_card', 'cash', 'transfer', 'other', 'unknown']).optional(),
  isBusiness: z.boolean().optional(),
  isDeductible: z.boolean().optional(),
  taxCategory: z.string().max(50).optional(),
  confidence: z.number().min(0).max(1).optional(),
  needsConfirmation: z.boolean().optional(),
  confirmationReason: z.string().max(200).optional(),
}).passthrough();

export const TransactionParseResponseSchema = z.union([
  SingleTransactionSchema,
  z.object({
    transactions: z.array(SingleTransactionSchema).min(1),
    summary: z.string().max(200).optional(),
  }).passthrough(),
]);

export type TransactionParseResponse = z.infer<typeof TransactionParseResponseSchema>;

// ── 交易分类（单条 / 批量） ──
const ClassifyResultSchema = z.object({
  category: z.string().min(1).max(50),
  subcategory: z.string().max(50).optional().default(''),
  isDeductible: z.boolean().optional(),
  taxCategory: z.string().max(50).optional(),
  confidence: z.number().min(0).max(1).optional(),
}).passthrough();

export const ClassifyResponseSchema = ClassifyResultSchema;

// 批量返回数组
export const BatchClassifyResponseSchema = z.array(
  ClassifyResultSchema.extend({ id: z.string() })
).min(1);

export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;

// ── 催款文案 ──
export const ReminderResponseSchema = z.object({
  level: z.number().int().min(0).max(6).optional(),
  channel: z.enum(['wechat', 'email', 'sms', 'phone_script']).optional(),
  content: z.string().min(1).max(2000),
  emailSubject: z.string().max(200).optional().default(''),
  tone: z.string().max(20).optional(),
  legalBasis: z.string().max(500).optional().default(''),
  overdueInterest: z.object({
    applicable: z.boolean(),
    dailyRate: z.string().max(50).optional(),
    accumulatedAmount: z.number().optional(),
    calculation: z.string().max(500).optional(),
  }).passthrough().optional(),
  followUpStrategy: z.object({
    nextAction: z.string().max(300),
    nextActionDate: z.string().max(20).optional(),
    escalationTrigger: z.string().max(300).optional(),
    channelSuggestion: z.string().max(50).optional(),
  }).passthrough().optional(),
  riskAssessment: z.object({
    collectionDifficulty: z.enum(['low', 'medium', 'high']).optional(),
    suggestedAction: z.string().max(300).optional(),
  }).passthrough().optional(),
  userOnlyTips: z.string().max(1000).optional().default(''),
}).passthrough();

export type ReminderResponse = z.infer<typeof ReminderResponseSchema>;

// ── 经营洞察 ──
const InsightItemSchema = z.object({
  priority: z.enum(['urgent', 'warning', 'tip', 'achievement']),
  dimension: z.string().max(20).optional(),
  icon: z.string().max(8).optional().default('💡'),
  title: z.string().min(1).max(20),
  content: z.string().min(1).max(200),
  action: z.string().max(200).optional().default(''),
}).passthrough();

export const InsightResponseSchema = z.object({
  healthScore: z.number().min(0).max(100).optional(),
  scoreDimensions: z.object({
    income: z.number().min(0).max(100).optional(),
    cost: z.number().min(0).max(100).optional(),
    cashflow: z.number().min(0).max(100).optional(),
    clientDiversity: z.number().min(0).max(100).optional(),
    pipeline: z.number().min(0).max(100).optional(),
    taxEfficiency: z.number().min(0).max(100).optional(),
  }).passthrough().optional(),
  insights: z.array(InsightItemSchema).min(1).max(8),
}).passthrough();

export type InsightResponse = z.infer<typeof InsightResponseSchema>;

// ── 合同生成 ──
const ContractClauseSchema = z.object({
  number: z.string().max(20),
  title: z.string().min(1).max(50),
  content: z.string().min(1).max(3000),
  legalBasis: z.string().max(200).optional().default(''),
}).passthrough();

const RiskWarningSchema = z.object({
  level: z.enum(['high', 'medium', 'low']),
  content: z.string().min(1).max(500),
}).passthrough();

export const ContractResponseSchema = z.object({
  contractTitle: z.string().min(1).max(100),
  partyA: z.object({ name: z.string().max(100), role: z.string().max(20).optional() }).passthrough(),
  partyB: z.object({ name: z.string().max(100), role: z.string().max(20).optional() }).passthrough(),
  clauses: z.array(ContractClauseSchema).min(1),
  attachments: z.array(z.string().max(100)).optional().default([]),
  riskWarnings: z.array(RiskWarningSchema).optional().default([]),
  signingGuide: z.string().max(2000).optional().default(''),
  // 合同 disclaimer 在 system prompt 里被强制要求，这里同样校验存在
  disclaimer: z.string().min(1).max(1000),
}).passthrough();

export type ContractResponse = z.infer<typeof ContractResponseSchema>;

// ── 模板生成（用于 template-cache 的 3 候选模板生成调用） ──
export const TemplateGenResponseSchema = z.object({
  templates: z.array(z.string().min(1).max(2000)).length(3),
}).passthrough();

export type TemplateGenResponse = z.infer<typeof TemplateGenResponseSchema>;

// ── 报价二次调整 ──
// 调整指令的输出与 QuoteResponse 主体一致，复用即可
export const QuoteAdjustResponseSchema = QuoteResponseSchema;
export type QuoteAdjustResponse = QuoteResponse;
