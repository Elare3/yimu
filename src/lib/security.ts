// ============================================================
// 一木 YiMu — AI 安全防护模块 v2.0
// 五层纵深防御：输入清洗 → 速率限制 → API调用 → 输出验证 → 审计日志
// ============================================================

import * as crypto from 'crypto';
import type { z } from 'zod';
import { callAIWithFallback, getModelForTask } from './ai';
import { isAIError } from './ai-errors';
import { prisma } from './prisma';

// ============================================================
// 第1层：输入清洗与验证（Input Sanitization）
// ============================================================

/**
 * Prompt注入攻击模式库
 */
const INJECTION_PATTERNS: { pattern: RegExp; name: string; severity: 'critical' | 'high' | 'medium' }[] = [
  // 角色劫持
  { pattern: /system\s*:/gi, name: 'role_hijack_system', severity: 'critical' },
  { pattern: /assistant\s*:/gi, name: 'role_hijack_assistant', severity: 'critical' },
  { pattern: /\buser\s*:/gi, name: 'role_hijack_user', severity: 'high' },
  { pattern: /\[INST\]/gi, name: 'llama_inst_tag', severity: 'critical' },
  { pattern: /<\|im_start\|>/gi, name: 'chatml_tag', severity: 'critical' },
  { pattern: /<\|endoftext\|>/gi, name: 'eof_tag', severity: 'critical' },

  // 指令覆盖
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)/gi, name: 'ignore_previous', severity: 'critical' },
  { pattern: /忽略(之前|上面|以上|所有)(的)?(指令|规则|提示|要求)/gi, name: 'ignore_previous_cn', severity: 'critical' },
  { pattern: /forget\s+(all\s+)?(instructions|rules|prompts)/gi, name: 'forget_instructions', severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?(previous|above)/gi, name: 'disregard_previous', severity: 'critical' },
  { pattern: /override\s+(system|instructions|rules)/gi, name: 'override_system', severity: 'critical' },
  { pattern: /你(现在)?是(一个)?(?!「一木」)/gi, name: 'role_reassign_cn', severity: 'high' },
  { pattern: /from\s+now\s+on\s+you\s+are/gi, name: 'role_reassign_en', severity: 'high' },
  { pattern: /pretend\s+(to\s+be|you\s+are)/gi, name: 'pretend_role', severity: 'high' },
  { pattern: /act\s+as\s+(if|a|an)/gi, name: 'act_as', severity: 'medium' },
  { pattern: /jailbreak/gi, name: 'jailbreak_keyword', severity: 'critical' },
  { pattern: /DAN\s*mode/gi, name: 'dan_mode', severity: 'critical' },

  // Prompt泄露
  { pattern: /repeat\s+(the\s+)?(system|above|initial)\s+(prompt|instruction|message)/gi, name: 'prompt_leak_en', severity: 'high' },
  { pattern: /重复(一下)?(系统|初始|上面的)(提示|指令|消息)/gi, name: 'prompt_leak_cn', severity: 'high' },
  { pattern: /what\s+(is|are)\s+your\s+(instructions|rules|system\s+prompt)/gi, name: 'prompt_extract', severity: 'high' },
  { pattern: /你的(系统|初始)(提示|指令|规则)是什么/gi, name: 'prompt_extract_cn', severity: 'high' },
  { pattern: /show\s+me\s+(your\s+)?(system|initial)\s+prompt/gi, name: 'show_prompt', severity: 'high' },
  { pattern: /输出(你的)?完整(系统)?提示/gi, name: 'output_prompt_cn', severity: 'high' },

  // 代码注入
  { pattern: /```\s*(system|python|javascript|bash|sh)/gi, name: 'code_block_inject', severity: 'high' },
  { pattern: /<script[\s>]/gi, name: 'xss_script_tag', severity: 'critical' },
  { pattern: /javascript\s*:/gi, name: 'xss_js_proto', severity: 'critical' },
  { pattern: /on(load|error|click)\s*=/gi, name: 'xss_event_handler', severity: 'high' },

  // 数据窃取
  { pattern: /其他用户的?(数据|信息|记录|账单)/gi, name: 'data_theft_cn', severity: 'critical' },
  { pattern: /other\s+users?\s+(data|info|records)/gi, name: 'data_theft_en', severity: 'critical' },
  { pattern: /dump\s+(all|the)\s+(data|database|records)/gi, name: 'data_dump', severity: 'critical' },
  { pattern: /导出(所有|全部)(数据|用户|记录)/gi, name: 'data_dump_cn', severity: 'critical' },
];

/**
 * 敏感信息模式库
 */
const SENSITIVE_PATTERNS: { pattern: RegExp; name: string; replacement: string }[] = [
  // 身份证号
  { pattern: /\b\d{17}[\dXx]\b/g, name: 'id_card', replacement: '[身份证号已脱敏]' },
  // 银行卡号（16-19位数字）
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4,7}\b/g, name: 'bank_card', replacement: '[银行卡号已脱敏]' },
  // 手机号
  { pattern: /\b1[3-9]\d{9}\b/g, name: 'phone', replacement: '[手机号已脱敏]' },
  // 密码/密钥相关
  { pattern: /(password|密码|secret|api[_-]?key|token)\s*[:=]\s*\S+/gi, name: 'credentials', replacement: '[凭证信息已脱敏]' },
];

interface SanitizeResult {
  sanitized: string;
  blocked: boolean;
  threats: { name: string; severity: string; matched: string }[];
  sensitiveRedacted: { name: string; count: number }[];
  originalLength: number;
  sanitizedLength: number;
}

/**
 * 主清洗函数：清理用户输入，防止prompt注入和敏感信息泄露
 */
export function sanitizeInput(input: string, options?: {
  maxLength?: number;
  redactSensitive?: boolean;
  strictMode?: boolean;
}): SanitizeResult {
  const maxLength = options?.maxLength ?? 5000;
  const redactSensitive = options?.redactSensitive ?? true;
  const strictMode = options?.strictMode ?? true;

  const threats: SanitizeResult['threats'] = [];
  const sensitiveRedacted: SanitizeResult['sensitiveRedacted'] = [];
  let sanitized = input;
  const originalLength = input.length;

  // Step 1: 检测并移除注入模式
  for (const { pattern, name, severity } of INJECTION_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      threats.push({ name, severity, matched: matches[0].slice(0, 50) });
      sanitized = sanitized.replace(pattern, '');
    }
  }

  // Step 2: 脱敏敏感信息
  if (redactSensitive) {
    for (const { pattern, name, replacement } of SENSITIVE_PATTERNS) {
      const matches = sanitized.match(pattern);
      if (matches) {
        sensitiveRedacted.push({ name, count: matches.length });
        sanitized = sanitized.replace(pattern, replacement);
      }
    }
  }

  // Step 3: 通用清理
  sanitized = sanitized
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // 移除控制字符
    .replace(/\u200B/g, '')        // 移除零宽空格
    .replace(/\u200C/g, '')        // 移除零宽非连接符
    .replace(/\u200D/g, '')        // 移除零宽连接符
    .replace(/\uFEFF/g, '')        // 移除BOM标记
    .replace(/\n{4,}/g, '\n\n\n') // 压缩过多换行
    .replace(/ {10,}/g, '  ')     // 压缩过多空格
    .trim();

  // Step 4: 长度限制
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  // Step 5: 严格模式下检查是否阻断
  const hasCritical = threats.some(t => t.severity === 'critical');
  const blocked = strictMode && hasCritical;

  return {
    sanitized: blocked ? '' : sanitized,
    blocked,
    threats,
    sensitiveRedacted,
    originalLength,
    sanitizedLength: sanitized.length,
  };
}


// ============================================================
// 第2层：API调用安全（Transport Security）
// ============================================================

/**
 * 速率限制器
 */
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  check(userId: string, maxRequests: number = 20, windowMs: number = 60000): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    // 清除过期请求
    const validRequests = userRequests.filter(t => now - t < windowMs);
    validRequests.push(now);
    this.requests.set(userId, validRequests);

    return validRequests.length <= maxRequests;
  }
}

export const aiRateLimiter = new RateLimiter();

/**
 * API调用安全配置
 */
export const AI_SECURITY_CONFIG = {
  rateLimits: {
    'quote.generate': 5,
    'quote.adjust': 10,
    'transaction.parse': 20,
    'transaction.classify': 60,
    'reminder.generate': 10,
    'insight.generate': 2,
    'contract.generate': 3,
  } as Record<string, number>,
  maxInputLength: {
    'quote.generate': 3000,
    'transaction.parse': 1000,
    'transaction.classify': 5000,
    'reminder.generate': 2000,
    'insight.generate': 10000,
    'contract.generate': 5000,
  } as Record<string, number>,
  timeout: {
    default: 30000,
    'quote.generate': 60000,
    'quote.adjust': 45000,
    'contract.generate': 60000,
    'insight.generate': 45000,
  } as Record<string, number>,
  dailyLimits: {
    default: 200,
    'insight.generate': 5,
    'contract.generate': 10,
  } as Record<string, number>,
};


// ============================================================
// 第3层：输出验证与净化（Output Validation）
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 验证AI输出是否安全、合规
 */
export function validateAIOutput(output: any, task: string): {
  valid: boolean;
  sanitizedOutput: any;
  issues: string[];
} {
  const issues: string[] = [];
  let sanitizedOutput = output;

  // 检查1：输出不能包含系统提示信息泄露
  const outputStr = JSON.stringify(output);
  if (/system\s*prompt|系统提示|QUOTE_SYSTEM_PROMPT|TRANSACTION_SYSTEM/i.test(outputStr)) {
    issues.push('output_contains_system_info');
    return { valid: false, sanitizedOutput: null, issues };
  }

  // 检查2：输出中不能包含其他用户数据的痕迹
  if (/user_id|userId|其他用户/i.test(outputStr)) {
    issues.push('output_may_contain_other_user_data');
  }

  // 检查3：金额合理性校验
  if (task === 'quote.generate' && output.subtotal) {
    if (output.subtotal > 10000000) {
      issues.push('quote_amount_unreasonable');
      sanitizedOutput = { ...output, _warning: '报价金额异常，请人工确认' };
    }
    if (output.subtotal <= 0) {
      issues.push('quote_amount_zero_or_negative');
      return { valid: false, sanitizedOutput: null, issues };
    }
  }

  if (task === 'transaction.parse' && output.amount) {
    if (output.amount > 50000000) {
      issues.push('transaction_amount_unreasonable');
    }
    if (output.amount <= 0) {
      issues.push('transaction_amount_invalid');
      return { valid: false, sanitizedOutput: null, issues };
    }
  }

  // 检查4：合同条款必须包含免责声明
  if (task === 'contract.generate') {
    if (!output.disclaimer || !output.disclaimer.includes('仅供参考')) {
      sanitizedOutput = {
        ...output,
        disclaimer: '本合同条款由小木辅助生成，仅供参考，不构成正式法律意见。建议在签署前请专业律师审核。一木平台不对因使用本条款产生的任何法律后果承担责任。'
      };
      issues.push('disclaimer_missing_auto_added');
    }
  }

  // 检查5：催款内容不能包含威胁/恐吓/违法催收措辞
  if (task === 'reminder.generate' && output.content) {
    const forbiddenPhrases = [
      /死/g, /杀/g, /砍/g, /废/g,
      /曝光/g, /告诉你(老婆|家人|朋友)/g,
      /黑名单/g, /征信/g,
      /不怕.*法律/g, /法院.*传票/g,
      /爆(你的)?通讯录/g,
    ];
    for (const phrase of forbiddenPhrases) {
      if (phrase.test(output.content)) {
        issues.push(`reminder_contains_forbidden_phrase: ${phrase.source}`);
        return { valid: false, sanitizedOutput: null, issues };
      }
    }
  }

  return {
    valid: issues.filter(i => !i.includes('auto_added')).length === 0,
    sanitizedOutput,
    issues,
  };
}


// ============================================================
// 第4层：审计日志（Audit Trail）
// ============================================================

interface AIAuditLog {
  timestamp: string;
  userId: string;
  task: string;
  inputHash: string;
  inputLength: number;
  threats: string[];
  sensitiveRedacted: string[];
  outputValid: boolean;
  outputIssues: string[];
  model: string;
  latencyMs: number;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

/**
 * 记录AI调用审计日志
 */
export async function logAIAudit(log: AIAuditLog): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AI_AUDIT]', JSON.stringify(log, null, 2));
  }
  // 生产 + 非生产环境均落库，用于安全追溯与合规审计
  try {
    await prisma.aIAuditLog.create({
      data: {
        timestamp: new Date(log.timestamp),
        userId: log.userId,
        task: log.task,
        inputHash: log.inputHash,
        inputLength: log.inputLength,
        threats: log.threats,
        sensitiveRedacted: log.sensitiveRedacted,
        outputValid: log.outputValid,
        outputIssues: log.outputIssues,
        model: log.model,
        latencyMs: log.latencyMs,
        tokenPrompt: log.tokenUsage?.prompt,
        tokenCompletion: log.tokenUsage?.completion,
        tokenTotal: log.tokenUsage?.total,
      },
    });
  } catch (e) {
    // 审计写入失败不得阻塞业务流程
    console.error('[AI_AUDIT] persist failed:', e instanceof Error ? e.message : e);
  }
}

/**
 * 生成输入哈希（不存储原文，保护用户隐私）
 */
export function hashInput(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}


// ============================================================
// 第5层：完整的安全调用封装
// ============================================================

/**
 * 安全AI调用入口 — 替代直接调用 callAI()
 * 集成：输入清洗 → 速率检查 → API调用 → 输出验证 → 审计日志
 */
export async function secureCallAI<T = any>(params: {
  userId: string;
  task: string;
  rawInput: string;
  systemPrompt: string;
  buildPromptFn: (sanitized: string) => string;
  temperature?: number;
  maxTokens?: number;
  /**
   * 可选 Zod schema：传入后由 callAI 在 JSON.parse 后做结构校验，失败会自纠重试 1 次。
   * orchestrator 各任务建议从 ai-schemas.ts 引入对应 schema 传进来。
   */
  schema?: z.ZodType<T>;
}): Promise<{ success: boolean; data: T; error?: string; errorKind?: string }> {
  const startTime = Date.now();
  const { userId, task, rawInput, systemPrompt, buildPromptFn, schema } = params;

  // Step 1: 速率限制检查
  const rateLimit = AI_SECURITY_CONFIG.rateLimits[task] ?? 20;
  if (!aiRateLimiter.check(userId, rateLimit)) {
    return { success: false, data: null as unknown as T, error: '请求过于频繁，请稍后再试' };
  }

  // Step 2: 输入清洗
  const maxLen = AI_SECURITY_CONFIG.maxInputLength[task] ?? 5000;
  const sanitizeResult = sanitizeInput(rawInput, {
    maxLength: maxLen,
    redactSensitive: true,
    strictMode: true,
  });

  if (sanitizeResult.blocked) {
    await logAIAudit({
      timestamp: new Date().toISOString(),
      userId,
      task,
      inputHash: hashInput(rawInput),
      inputLength: rawInput.length,
      threats: sanitizeResult.threats.map(t => `${t.severity}:${t.name}`),
      sensitiveRedacted: sanitizeResult.sensitiveRedacted.map(s => s.name),
      outputValid: false,
      outputIssues: ['input_blocked_by_security'],
      model: 'N/A',
      latencyMs: Date.now() - startTime,
    });
    return { success: false, data: null as unknown as T, error: '输入内容包含不安全的内容，请修改后重试' };
  }

  // Step 3: 构建安全的user prompt
  const userPrompt = buildPromptFn(sanitizeResult.sanitized);

  // Step 4: 调用AI
  try {
    const timeout = AI_SECURITY_CONFIG.timeout[task] ?? AI_SECURITY_CONFIG.timeout.default;

    const result = await Promise.race([
      callAIWithFallback<T>({
        task,
        systemPrompt,
        userPrompt,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        schema,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_TIMEOUT')), timeout)
      ),
    ]);

    // Step 5: 输出验证（从新 { data, usage } 结构中取出 data）
    const validation = validateAIOutput(result.data, task);

    // Step 6: 审计日志（带 token 用量）
    await logAIAudit({
      timestamp: new Date().toISOString(),
      userId,
      task,
      inputHash: hashInput(rawInput),
      inputLength: rawInput.length,
      threats: sanitizeResult.threats.map(t => `${t.severity}:${t.name}`),
      sensitiveRedacted: sanitizeResult.sensitiveRedacted.map(s => s.name),
      outputValid: validation.valid,
      outputIssues: validation.issues,
      model: getModelForTask(task),
      latencyMs: Date.now() - startTime,
      tokenUsage: result.usage,
    });

    if (!validation.valid) {
      return { success: false, data: null as unknown as T, error: 'AI输出未通过安全验证，请重试' };
    }

    return { success: true, data: validation.sanitizedOutput as T };

  } catch (error: any) {
    // 区分 AIError 的细分错误（schema/parse/timeout/auth/...）写进审计，便于事后复盘
    const errorKind = isAIError(error)
      ? error.kind
      : (error.message === 'AI_TIMEOUT' ? 'timeout' : 'api_error');

    await logAIAudit({
      timestamp: new Date().toISOString(),
      userId,
      task,
      inputHash: hashInput(rawInput),
      inputLength: rawInput.length,
      threats: sanitizeResult.threats.map(t => `${t.severity}:${t.name}`),
      sensitiveRedacted: [],
      outputValid: false,
      outputIssues: [errorKind],
      model: getModelForTask(task),
      latencyMs: Date.now() - startTime,
    });

    // 用户层错误信息按 kind 给出可读文案，但不暴露 schema 细节
    let userMessage = 'AI服务异常，请稍后重试';
    if (errorKind === 'timeout') userMessage = 'AI响应超时，请重试';
    else if (errorKind === 'rate-limit') userMessage = 'AI调用过于频繁，请稍后再试';
    else if (errorKind === 'auth') userMessage = 'AI服务未正确配置';
    else if (errorKind === 'schema' || errorKind === 'parse') userMessage = 'AI返回结果格式异常，请重试';

    return {
      success: false,
      data: null as unknown as T,
      error: userMessage,
      errorKind,
    };
  }
}
