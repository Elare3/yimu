// Re-export Prisma types for convenience
export type {
  User,
  Client,
  Project,
  Quote,
  Transaction,
  PaymentNode,
  PricingFeedback,
  BusinessMemory,
} from '@prisma/client';

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// AI related types
export interface AIQuoteResult {
  title: string;
  items: {
    name: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[];
  paymentTerms: string;
  notes: string;
  estimatedDays: number;
}

export interface AITransactionResult {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  subcategory: string;
  description: string;
  date: string;
  paymentMethod: string;
  isBusiness: boolean;
  confidence: number;
}

export interface AIReminderResult {
  content: string;
}

export interface AIContractResult {
  contractTitle: string;
  partyA: { name: string; role: string };
  partyB: { name: string; role: string };
  clauses: {
    number: string;
    title: string;
    content: string;
    legalBasis?: string;
  }[];
  attachments: string[];
  riskWarnings: {
    level: 'high' | 'medium' | 'low';
    content: string;
  }[];
  signingGuide: string;
  disclaimer: string;
}

// 报价反馈 — 数据回流
export type PricingOutcome = 'accepted' | 'rejected' | 'negotiated' | 'expired_no_response';
export type RejectReason = 'too_expensive' | 'scope_mismatch' | 'competitor' | 'budget_cut' | 'other';

export interface PricingFeedbackInput {
  quoteId: string;
  clientId: string;
  outcome: PricingOutcome;
  finalAmount?: number;
  rejectReason?: RejectReason;
  clientFeedback?: string;
  negotiationRounds?: number;
}

// 经营记忆类型
export type MemoryType =
  | 'pricing_pattern'
  | 'client_preference'
  | 'seasonal_trend'
  | 'cost_benchmark'
  | 'negotiation_insight';
