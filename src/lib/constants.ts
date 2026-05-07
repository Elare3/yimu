// ============================================================
// 一木 YiMu — 状态枚举常量
//
// 全部用 `as const` 数组导出，配套 type alias 给前后端共用。
// 用法：
//   import { PROJECT_STATUS, type ProjectStatus } from '@/lib/constants';
//   if ((PROJECT_STATUS as readonly string[]).includes(s)) { ... }
//   const next: ProjectStatus = 'in_progress';
//
// 改一处即可，避免散落字符串拼写错（'cancelld' / 'completed_' 之类）。
// ============================================================

// ── 项目（Project） ──
export const PROJECT_STATUS = ['quoted', 'in_progress', 'review', 'completed', 'cancelled'] as const;
export type ProjectStatus = typeof PROJECT_STATUS[number];

// 活跃中（看板上前 3 列、未完结、未取消）
export const ACTIVE_PROJECT_STATUSES: readonly ProjectStatus[] = ['quoted', 'in_progress', 'review'];

// 已开工但未完结（auto-complete 触发资格）
export const PROJECT_IN_FLIGHT_STATUSES: readonly ProjectStatus[] = ['in_progress', 'review'];

export const PROJECT_PRIORITY = ['low', 'medium', 'high'] as const;
export type ProjectPriority = typeof PROJECT_PRIORITY[number];

// 项目状态合法跳转规则（schema 注释有：quoted|in_progress|review|completed|cancelled）
// 类型用 Record<string, ...> 是有意：调用侧拿到的是 Prisma 返回的 `string`，
// 用兜底 `|| status` / `|| []` 保护，避免每个 call site 都 `as ProjectStatus`。
export const PROJECT_STATUS_TRANSITIONS: Record<string, ProjectStatus[]> = {
  quoted: ['in_progress', 'cancelled'],
  in_progress: ['review', 'cancelled'],
  review: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: ['quoted'],
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  quoted: '已报价',
  in_progress: '进行中',
  review: '验收中',
  completed: '已完成',
  cancelled: '已取消',
};

// ── 报价单（Quote） ──
export const QUOTE_STATUS = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;
export type QuoteStatus = typeof QUOTE_STATUS[number];

// "已发出且不在草稿"的状态集合 —— 转化率计算用
export const QUOTE_SENT_OR_BEYOND: readonly QuoteStatus[] = ['sent', 'accepted', 'rejected', 'expired'];

// ── 收款节点（PaymentNode） ──
export const PAYMENT_STATUS = ['pending', 'reminded', 'paid', 'overdue'] as const;
export type PaymentStatus = typeof PAYMENT_STATUS[number];

// "尚未收到款"的状态集合 —— 待收/逾期查询用
export const PAYMENT_UNPAID: readonly PaymentStatus[] = ['pending', 'reminded', 'overdue'];
export const PAYMENT_PENDING_OR_REMINDED: readonly PaymentStatus[] = ['pending', 'reminded'];

// ── 收支（Transaction） ──
export const TRANSACTION_TYPE = ['income', 'expense'] as const;
export type TransactionType = typeof TRANSACTION_TYPE[number];

export const PAYMENT_METHOD = ['wechat', 'alipay', 'bank_transfer', 'cash', 'other'] as const;
export type PaymentMethod = typeof PAYMENT_METHOD[number];

// ── 客户（Client） ──
export const CLIENT_STATUS = ['active', 'archived'] as const;
export type ClientStatus = typeof CLIENT_STATUS[number];

// ── 用户（User） ──
export const USER_PLAN = ['free', 'pro', 'premium'] as const;
export type UserPlan = typeof USER_PLAN[number];

export const USER_ENTITY_TYPE = ['individual', 'sole_proprietor', 'micro_company', 'freelance'] as const;
export type UserEntityType = typeof USER_ENTITY_TYPE[number];

export const USER_BUSINESS_TYPE = ['design', 'development', 'consulting', 'content', 'operations', 'other'] as const;
export type UserBusinessType = typeof USER_BUSINESS_TYPE[number];

export const PRIVACY_MODE = ['standard', 'strict'] as const;
export type PrivacyMode = typeof PRIVACY_MODE[number];

// ── 催款渠道（ReminderMessage.channel） ──
export const REMINDER_CHANNEL = ['wechat', 'sms', 'email'] as const;
export type ReminderChannel = typeof REMINDER_CHANNEL[number];

// ── 通用工具：把 readonly tuple 当 string[] 喂给 .includes() ──
// 用法：isOneOf(QUOTE_STATUS, value) → boolean
export function isOneOf<T extends string>(arr: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (arr as readonly string[]).includes(value);
}
