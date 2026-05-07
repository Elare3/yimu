// ============================================================
// 一木 YiMu — AI 统一调用接口 v2.3
// 支持：任务路由 / 快速思考(thinking_budget) / JSON解析 / Zod schema 校验
//      / 重试降级 / 超时控制 / AIError 分类
// ============================================================

import type { z } from 'zod';
import { AIError, classifyHttpError, wrapUnknown, isAIError } from './ai-errors';

// 主/轻模型从环境变量读取，未配置时兜底到 qwen3.5-plus
const PRIMARY_MODEL = process.env.PRIMARY_MODEL || 'qwen3.5-plus';
const LIGHT_MODEL = process.env.LIGHT_MODEL || 'qwen3.5-plus';

// 任务→模型路由：复杂推理任务走 PRIMARY，结构化/解析任务走 LIGHT
export const TASK_MODEL_MAP: Record<string, string> = {
  'quote.generate':        PRIMARY_MODEL,    // 报价生成（需要商务理解）
  'quote.adjust':          LIGHT_MODEL,      // 报价调整（改动已有结构）
  'transaction.parse':     LIGHT_MODEL,      // 记账解析（中文 NLP）
  'transaction.classify':  LIGHT_MODEL,      // 简单分类
  'reminder.generate':     PRIMARY_MODEL,    // 催款文案（需要商务写作）
  'insight.generate':      PRIMARY_MODEL,    // 经营洞察（深度推理）
  'contract.generate':     PRIMARY_MODEL,    // 合同条款生成
  'fallback':              LIGHT_MODEL,      // 降级备选
};

export function getModelForTask(task: string): string {
  return TASK_MODEL_MAP[task] || LIGHT_MODEL;
}

/**
 * 任务→思考预算路由（thinking_budget）
 *
 * qwen3.5-plus 是推理模型，支持 thinking_budget 控制思考深度：
 * - 0   = 关闭思考（最快，~5s，适合简单结构化任务）
 * - 256 = 快速思考（~8s，适合解析/分类）
 * - 512 = 适度思考（~12s，适合报价/催款等需要策略的任务）
 * - 1024 = 深度思考（~20s，适合经营洞察/合同等复杂分析）
 */
export const TASK_THINKING_BUDGET: Record<string, number> = {
  'quote.generate':        512,   // 需要参照基准价做定价策略
  'quote.adjust':          256,   // 调整已有报价，逻辑较简单
  'transaction.parse':     256,   // 需要理解自然语言+分类匹配
  'transaction.classify':  256,   // 关键词匹配+语义推断
  'reminder.generate':     512,   // 需要判断催款阶段和策略
  'insight.generate':      1024,  // 六维分析需要深度推理
  'contract.generate':     1024,  // 法律条款生成需要严谨推理
  'fallback':              256,   // 降级时快速响应
};

/* eslint-disable @typescript-eslint/no-explicit-any */

// 统一调用选项接口
export interface AICallOptions<T = any> {
  task: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;       // 默认 0.7
  maxTokens?: number;         // 默认 2000
  jsonMode?: boolean;         // 默认 true
  timeoutMs?: number;         // 默认 60000 (60秒)
  thinkingBudget?: number;    // 思考token预算，undefined=使用任务默认值
  /**
   * 可选 Zod schema：jsonMode 下提供时会在 JSON.parse 后做结构校验。
   * 校验失败会抛 AIError(kind:'schema')，由 callAI 内部完成 1 次带提示的自纠重试。
   */
  schema?: z.ZodType<T>;
}

// AI 调用返回值 — 携带 token 用量供审计日志写入
export interface AITokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface AICallResult<T = any> {
  data: T;
  usage: AITokenUsage;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// 重试时追加的提示后缀 — 给模型一个明确的"为什么被打回"的信号
const RETRY_SUFFIX_PARSE = '\n\n⚠️ 上次输出不是合法 JSON，请严格返回单一 JSON 对象，不要包含 markdown 代码块、解释文字或多余前后缀。';
const RETRY_SUFFIX_SCHEMA = (issues: string) =>
  `\n\n⚠️ 上次输出未通过结构校验，问题：${issues}。请严格按照 system 中要求的字段名和类型返回 JSON。`;

/**
 * 单次裸 HTTP 调用 + JSON/Schema 校验。
 * 失败时抛 AIError，由外层 callAI 决定是否做自纠重试。
 */
async function callAIOnce<T = unknown>(
  options: AICallOptions<T>,
  promptOverride?: string,
): Promise<AICallResult<T>> {
  const {
    task,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 2000,
    jsonMode = true,
    timeoutMs = 60000,
    thinkingBudget,
    schema,
  } = options;
  const userPrompt = promptOverride ?? options.userPrompt;

  if (!process.env.DASHSCOPE_API_KEY) {
    throw new AIError('auth', 'DASHSCOPE_API_KEY 环境变量未配置', { retryable: false });
  }

  const model = getModelForTask(task);
  const budget = thinkingBudget ?? TASK_THINKING_BUDGET[task] ?? 256;
  const enableThinking = budget > 0;

  // 超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          enable_thinking: enableThinking,
          ...(enableThinking && { thinking_budget: budget }),
          ...(jsonMode && { response_format: { type: 'json_object' } }),
        }),
        signal: controller.signal,
      },
    );
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AIError('timeout', `AI request timeout after ${timeoutMs / 1000}s`, { cause: error });
    }
    throw wrapUnknown(error);
  }

  try {
    if (!response.ok) {
      let detail = '';
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.message || JSON.stringify(errBody);
      } catch {
        detail = await response.text().catch(() => '');
      }
      throw classifyHttpError(response.status, detail);
    }

    const data = await response.json();
    const content: string | undefined = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new AIError('empty', 'AI returned empty response');
    }

    const usage: AITokenUsage = {
      prompt: data.usage?.prompt_tokens ?? 0,
      completion: data.usage?.completion_tokens ?? 0,
      total: data.usage?.total_tokens ?? 0,
    };

    if (!jsonMode) {
      return { data: content as unknown as T, usage };
    }

    // ── JSON parse ──
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // 兜底：抓最外层 {...} 块再试一次（DashScope 偶尔包 markdown）
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          throw new AIError('parse', `AI response is not valid JSON: ${content.slice(0, 200)}`, {
            raw: content,
          });
        }
      } else {
        throw new AIError('parse', `AI response has no JSON object: ${content.slice(0, 200)}`, {
          raw: content,
        });
      }
    }

    // ── Zod 校验（可选） ──
    if (schema) {
      const result = schema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ');
        throw new AIError('schema', `AI output failed schema: ${issues}`, {
          raw: typeof content === 'string' ? content.slice(0, 500) : undefined,
        });
      }
      return { data: result.data, usage };
    }

    return { data: parsed as T, usage };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 统一 AI 调用接口
 *
 * - JSON parse 失败 / schema 校验失败 → 自动追加纠错提示，重试 1 次
 * - 其他错误（超时/HTTP/限流/auth）不在此处重试，由 callAIWithFallback 决定
 *
 * 思考模式说明：
 * - enable_thinking: true  + thinking_budget 限制思考深度
 * - 各任务自动匹配最优思考预算（TASK_THINKING_BUDGET）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callAI<T = any>(options: AICallOptions<T>): Promise<AICallResult<T>> {
  try {
    return await callAIOnce<T>(options);
  } catch (err) {
    if (!isAIError(err)) throw wrapUnknown(err);

    // 仅 parse / schema 错误做"带提示的"自纠重试 1 次
    if (err.kind === 'parse' || err.kind === 'schema') {
      const suffix =
        err.kind === 'parse'
          ? RETRY_SUFFIX_PARSE
          : RETRY_SUFFIX_SCHEMA(err.message.replace(/^AI output failed schema:\s*/, ''));
      try {
        return await callAIOnce<T>(options, options.userPrompt + suffix);
      } catch (retryErr) {
        // 二次失败：保留原始 kind 抛出（不要降级为 unknown）
        if (isAIError(retryErr)) throw retryErr;
        throw wrapUnknown(retryErr);
      }
    }
    throw err;
  }
}

/**
 * 带降级的 AI 调用
 * 主模型失败 + 错误可重试时，关闭思考 + 降温重试
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callAIWithFallback<T = any>(options: AICallOptions<T>): Promise<AICallResult<T>> {
  try {
    return await callAI<T>(options);
  } catch (error) {
    const aiErr = isAIError(error) ? error : wrapUnknown(error);

    // 不可重试的错误（auth / rate-limit / 4xx）直接抛出，避免无意义重试浪费成本
    if (!aiErr.retryable) {
      console.warn(`[AI] non-retryable error for task [${options.task}]: ${aiErr.kind} — ${aiErr.message}`);
      throw aiErr;
    }

    console.warn(`[AI] primary failed for task [${options.task}] (${aiErr.kind}), retrying with fallback config:`, aiErr.message);
    // 降级策略：关闭思考 + 降低温度 + 延长超时
    return await callAI<T>({
      ...options,
      task: 'fallback',
      temperature: 0.3,
      timeoutMs: 90000,
      thinkingBudget: 0, // 降级时关闭思考以最快速度返回
    });
  }
}


// ============================================================
// 响应验证函数（保留：旧路径仍在用，逐步替换为 ai-schemas.ts 的 Zod schema）
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 验证报价响应的基本结构
 */
export function validateQuoteResponse(data: any): boolean {
  return (
    data.title &&
    Array.isArray(data.items) &&
    data.items.length > 0 &&
    data.items.every((item: any) =>
      item.name && typeof item.unitPrice === 'number' && typeof item.amount === 'number'
    ) &&
    typeof data.subtotal === 'number'
  );
}

/**
 * 验证记账解析响应的基本结构
 */
export function validateTransactionResponse(data: any): boolean {
  // 多笔交易格式
  if (data.transactions && Array.isArray(data.transactions)) {
    return data.transactions.every((t: any) => validateSingleTransaction(t));
  }
  // 单笔交易格式
  return validateSingleTransaction(data);
}

function validateSingleTransaction(data: any): boolean {
  return (
    ['income', 'expense'].includes(data.type) &&
    typeof data.amount === 'number' &&
    data.amount > 0 &&
    data.category &&
    data.date
  );
}

/**
 * 验证催款响应的基本结构
 */
export function validateReminderResponse(data: any): boolean {
  return (
    data.content &&
    typeof data.content === 'string' &&
    data.content.length > 0 &&
    data.content.length <= 500
  );
}
