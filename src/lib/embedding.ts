// ============================================================
// 一木 YiMu — 文本向量化服务（C 组）
//
// 包了 DashScope 的 text-embedding-v3（1024 维），加内存 LRU 缓存避免重复算同一段文本。
// 用于：
//   1) 知识库 RAG 检索 —— 用户上下文 vs 文档 embedding 的 cosine 相似度
//   2) AI 模板缓存的语义命中 —— 相近意图共享模板，避免 hash 不同就打 AI
//
// 失败策略：embedding 不是核心路径，超时/HTTP 错都直接抛 AIError，调用方应该
// catch 后退化到非 RAG / 仅 hash 匹配，绝不能因为 embedding 挂了就让 AI 主流程崩。
//
// 模型：dashscope:text-embedding-v3
//   - 1024 dim
//   - 中文英文都行，对中文优化好
//   - ¥0.0007/千 tokens，便宜到可以"想算就算"
// ============================================================
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as crypto from 'crypto';
import { AIError, classifyHttpError, wrapUnknown } from './ai-errors';

// 当前 embedding 模型标识 —— 写到 KnowledgeDoc.embeddingModel 里，未来换模型时方便筛出旧向量重算
export const EMBEDDING_MODEL = 'dashscope:text-embedding-v3';
export const EMBEDDING_DIM = 1024;

const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';
const DEFAULT_TIMEOUT_MS = 8000;

// ────────────────────────────────────────
// 内存 LRU 缓存
// 同一段文本（同一段意图串）多个调用方都会问，缓存命中直接走 0 网络 0 成本
// ────────────────────────────────────────

interface CacheEntry {
  vec: number[];
  expireAt: number;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 分钟
const CACHE_MAX = 500;
const cache = new Map<string, CacheEntry>();

function cacheKey(text: string): string {
  // 用内容哈希做 key 而不是原文，避免长文本占大内存
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
}

function cacheGet(text: string): number[] | null {
  const key = cacheKey(text);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expireAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // LRU：把命中的项移到末尾
  cache.delete(key);
  cache.set(key, entry);
  return entry.vec;
}

function cacheSet(text: string, vec: number[]): void {
  const key = cacheKey(text);
  // 超出容量时丢最旧的
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { vec, expireAt: Date.now() + CACHE_TTL });
}

// ────────────────────────────────────────
// 核心：调 DashScope 拿向量
// ────────────────────────────────────────

/**
 * 计算文本的向量表示。失败抛 AIError，调用方决定是否兜底。
 *
 * 空字符串 / 仅空白的文本直接返回零向量（不发 API 请求），这种文本本来就没语义价值。
 */
export async function getEmbedding(text: string, options: { timeoutMs?: number } = {}): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) {
    return new Array(EMBEDDING_DIM).fill(0);
  }

  // 缓存命中直接返回
  const cached = cacheGet(trimmed);
  if (cached) return cached;

  if (!process.env.DASHSCOPE_API_KEY) {
    throw new AIError('auth', 'DASHSCOPE_API_KEY 环境变量未配置', { retryable: false });
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-v3',
        input: trimmed.slice(0, 2048), // v3 单条 input 上限 ~2048 chars，超出截断
        dimensions: EMBEDDING_DIM,
        encoding_format: 'float',
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AIError('timeout', `Embedding timeout after ${timeoutMs}ms`, { cause: err });
    }
    throw wrapUnknown(err);
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
    const vec: number[] | undefined = data.data?.[0]?.embedding;

    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
      throw new AIError('parse', `embedding shape mismatch: got ${Array.isArray(vec) ? vec.length : typeof vec}, expected ${EMBEDDING_DIM}`);
    }

    cacheSet(trimmed, vec);
    return vec;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 批量算 embedding —— DashScope text-embedding-v3 支持单次最多 25 条 input。
 * backfill 脚本用，节省 RTT。
 */
export async function getEmbeddings(
  texts: string[],
  options: { timeoutMs?: number } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await getEmbedding(texts[0], options)];

  const BATCH_SIZE = 25;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const trimmed = batch.map(t => t.trim().slice(0, 2048));

    // 批内有缓存命中的，先记下索引避免重复请求
    const need: { idx: number; text: string }[] = [];
    const out: (number[] | null)[] = trimmed.map((t, idx) => {
      if (!t) return new Array(EMBEDDING_DIM).fill(0);
      const c = cacheGet(t);
      if (c) return c;
      need.push({ idx, text: t });
      return null;
    });

    if (need.length > 0) {
      if (!process.env.DASHSCOPE_API_KEY) {
        throw new AIError('auth', 'DASHSCOPE_API_KEY 环境变量未配置', { retryable: false });
      }
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS * 2;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'text-embedding-v3',
            input: need.map(n => n.text),
            dimensions: EMBEDDING_DIM,
            encoding_format: 'float',
          }),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new AIError('timeout', `Embedding batch timeout`, { cause: err });
        }
        throw wrapUnknown(err);
      }

      try {
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          throw classifyHttpError(response.status, detail);
        }
        const data = await response.json();
        const list: { embedding: number[]; index: number }[] = data.data || [];
        for (const item of list) {
          const localIdx = item.index;
          const target = need[localIdx];
          if (!target) continue;
          const vec = item.embedding;
          if (Array.isArray(vec) && vec.length === EMBEDDING_DIM) {
            cacheSet(target.text, vec);
            out[target.idx] = vec;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // out 里此时不应再有 null（API 没失败的话），保险起见兜个零向量
    for (let j = 0; j < out.length; j++) {
      results.push(out[j] ?? new Array(EMBEDDING_DIM).fill(0));
    }
  }

  return results;
}

// ────────────────────────────────────────
// 相似度工具
// ────────────────────────────────────────

/**
 * 余弦相似度 ∈ [-1, 1]，越接近 1 越相似。
 * 维度不匹配 / 任一向量是零向量 → 返回 0（不可比）。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 生成稳定的内容哈希（用于判断"内容没变就别重算 embedding"）
 */
export function embeddingTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * 把一组候选向量按 cosine 排序，返回前 k 个 (索引 + 分数)
 */
export function topKByCosine(
  query: number[],
  candidates: number[][],
  k: number,
): { index: number; score: number }[] {
  const scored = candidates.map((vec, index) => ({
    index,
    score: cosineSimilarity(query, vec),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// ────────────────────────────────────────
// 测试用：清空缓存（生产代码不调）
// ────────────────────────────────────────
export function _clearEmbeddingCacheForTests(): void {
  cache.clear();
}
