// ============================================================
// 一木 YiMu — AI 统一调用接口 v2.2
// 支持：任务路由 / 快速思考(thinking_budget) / JSON解析 / 重试降级 / 超时控制
// ============================================================

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

// 统一调用选项接口
export interface AICallOptions {
  task: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;       // 默认 0.7
  maxTokens?: number;         // 默认 2000
  jsonMode?: boolean;         // 默认 true
  timeoutMs?: number;         // 默认 60000 (60秒)
  thinkingBudget?: number;    // 思考token预算，undefined=使用任务默认值
}

/**
 * 统一 AI 调用接口
 * 通过 DashScope 兼容模式调用通义千问（qwen3.5-plus 推理模型）
 *
 * 思考模式说明：
 * - enable_thinking: true  + thinking_budget 限制思考深度
 * - 各任务自动匹配最优思考预算（TASK_THINKING_BUDGET）
 * - 复杂任务（洞察/合同）分配更多思考预算以提升质量
 * - 简单任务（解析/分类）分配较少思考预算以保证速度
 */
export async function callAI(options: AICallOptions) {
  const {
    task,
    systemPrompt,
    userPrompt,
    temperature = 0.7,
    maxTokens = 2000,
    jsonMode = true,
    timeoutMs = 60000,
    thinkingBudget,
  } = options;

  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY 环境变量未配置');
  }

  const model = getModelForTask(task);

  // 思考预算：优先使用调用方指定的，否则使用任务默认值
  const budget = thinkingBudget ?? TASK_THINKING_BUDGET[task] ?? 256;
  const enableThinking = budget > 0;

  // 超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
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
          // 推理思考配置
          enable_thinking: enableThinking,
          ...(enableThinking && { thinking_budget: budget }),
          ...(jsonMode && { response_format: { type: 'json_object' } }),
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      // 解析错误详情
      let errorDetail = '';
      try {
        const errBody = await response.json();
        errorDetail = errBody?.error?.message || errBody?.message || JSON.stringify(errBody);
      } catch {
        errorDetail = await response.text().catch(() => '');
      }
      throw new Error(`AI API error: ${response.status} — ${errorDetail}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('AI returned empty response');
    }

    if (jsonMode) {
      try {
        return JSON.parse(content);
      } catch {
        // 尝试提取最外层JSON块（贪婪匹配最后一个 }）
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch {
            throw new Error(`AI response contains invalid JSON: ${match[0].slice(0, 100)}...`);
          }
        }
        throw new Error('AI response is not valid JSON');
      }
    }

    return content;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`AI request timeout after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 带降级的 AI 调用
 * 主模型失败后关闭思考 + 降温重试
 */
export async function callAIWithFallback(options: AICallOptions) {
  try {
    return await callAI(options);
  } catch (error) {
    console.warn(`Primary AI call failed for task [${options.task}], retrying with fallback config:`, error);
    // 降级策略：关闭思考 + 降低温度 + 延长超时
    return await callAI({
      ...options,
      task: 'fallback',
      temperature: 0.3,
      timeoutMs: 90000,
      thinkingBudget: 0, // 降级时关闭思考以最快速度返回
    });
  }
}


// ============================================================
// 响应验证函数
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
