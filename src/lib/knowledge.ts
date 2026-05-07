// ============================================================
// 一木 YiMu — 知识库注入引擎 v2.0（C 组）
//
// 升级点：从纯 tag 字符串匹配 → tag 匹配 + cosine 向量混合打分
//
//   • 老版本：doc.tags 必须出现在 context 文本里才算命中。"客户拖了两个月"找不到 tag=["逾期催收"] 的文档
//   • 新版本：算 cosine(context_embedding, doc_embedding) 当语义分；同义词、长句子、口语都能匹上
//   • 最终分 = 0.55 * cosine_norm + 0.45 * tag_score_norm，二者互补：
//       - tag 是高置信度的"作者明示场景"
//       - 语义是低置信度的"实际表达"
//
// 优雅降级：
//   • 文档没 embedding（backfill 没跑过 / 新文档刚加） → 该文档只用 tag 分
//   • 上下文 embedding 计算失败（API 挂了） → 整体退化为纯 tag 匹配，对老调用方完全兼容
//
// 性能：当前 KnowledgeDoc 量级（10s-100s），全表 cosine 在 JS 里 < 5ms。
// 数据量上来再考虑 pgvector + ivfflat 索引。
// ============================================================

import { prisma } from './prisma';
import { getEmbedding, cosineSimilarity } from './embedding';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ────────────────────────────────────────
// 类型定义
// ────────────────────────────────────────

export type KnowledgeTaskType =
  | 'quote.generate'
  | 'quote.adjust'
  | 'reminder.generate'
  | 'contract.generate'
  | 'insight.generate'
  | 'transaction.parse'
  | 'transaction.classify';

interface MatchedDoc {
  title: string;
  content: string;
  score: number;
  // 调试用：拆解最终分的来源，dev 模式能看到为什么这篇命中
  _debug?: { tagScore: number; cosineScore: number; raw: number };
}

interface KnowledgeResult {
  /** 拼接好的注入文本，直接追加到 system prompt 后面 */
  injection: string;
  /** 命中的文档数 */
  matchCount: number;
  /** 命中的文档标题（用于日志/审计） */
  matchedTitles: string[];
  /** 是否走了向量检索（false=embedding 失败/没向量，纯 tag 模式） */
  usedSemantic: boolean;
}

// 混合打分的权重 —— 调试期可以改这两个值看效果
const COSINE_WEIGHT = 0.55;
const TAG_WEIGHT = 0.45;

// ────────────────────────────────────────
// 内存缓存（避免每次 AI 调用都查库）
// ────────────────────────────────────────

let cachedDocs: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

async function loadDocs() {
  const now = Date.now();
  if (cachedDocs && now - cacheTimestamp < CACHE_TTL) {
    return cachedDocs;
  }

  const docs = await prisma.knowledgeDoc.findMany({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
  });

  cachedDocs = docs;
  cacheTimestamp = now;
  return docs;
}

/**
 * 清空内存缓存。backfill 脚本 / 测试用，业务侧别调。
 */
export function _invalidateKnowledgeCache(): void {
  cachedDocs = null;
  cacheTimestamp = 0;
}

// ────────────────────────────────────────
// tag 匹配打分（旧逻辑保留，作为混合分的一部分）
// ────────────────────────────────────────

interface TagScoreResult {
  taskMatch: boolean;
  keywordHits: number;
  raw: number;
}

function computeTagScore(doc: any, contextLower: string, task: string, city?: string): TagScoreResult {
  let raw = 0;

  // 1) 任务类型匹配（核心权重）
  const taskMatch = doc.tasks.length === 0 || doc.tasks.includes(task);
  if (doc.tasks.includes(task)) raw += 100;

  // 2) 关键词命中（每个 +10）
  let keywordHits = 0;
  for (const tag of doc.tags) {
    if (contextLower.includes(tag.toLowerCase())) {
      keywordHits++;
      raw += 10;
    }
  }

  // 3) 地区匹配
  if (doc.region && doc.region !== '全国' && city && doc.region === city) {
    raw += 30;
  }
  if (doc.region === '全国' || doc.region === '') raw += 5;

  // 4) 优先级加权
  raw += Math.max(0, 20 - doc.priority);

  return { taskMatch, keywordHits, raw };
}

// 把 tag 原始分归一化到 [0, 1]，便于和 cosine 加权
// 满分大约：100(task) + 5*10(5个关键词命中) + 30(地区) + 20(优先级) = 200
const TAG_SCORE_NORM = 200;

// ────────────────────────────────────────
// 核心匹配函数
// ────────────────────────────────────────

/**
 * 根据任务类型和上下文，从数据库匹配相关知识文档并拼接注入文本
 *
 * @param task    - AI 任务类型
 * @param context - 上下文文本（用户输入 / 需求描述等），同时用于关键词匹配 + 向量相似度
 * @param options - 可选参数
 */
export async function getRelevantKnowledge(
  task: KnowledgeTaskType,
  context: string,
  options: {
    maxDocs?: number;    // 最多注入几篇（默认 3）
    maxChars?: number;   // 注入文本最大字符数（默认 4000）
    city?: string;       // 用户所在城市（匹配地方政策）
    category?: string;   // 服务类别
    /** 关掉向量检索（测试 / 离线场景） */
    disableSemantic?: boolean;
  } = {}
): Promise<KnowledgeResult> {
  const { maxDocs = 3, maxChars = 4000, city, category, disableSemantic = false } = options;

  try {
    const allDocs = await loadDocs();
    if (allDocs.length === 0) {
      return { injection: '', matchCount: 0, matchedTitles: [], usedSemantic: false };
    }

    const contextLower = [context, city || '', category || ''].join(' ').toLowerCase();
    const now = new Date();

    // ── 算 context 的 embedding（失败就退到纯 tag 模式）──
    let contextVec: number[] | null = null;
    let usedSemantic = false;
    if (!disableSemantic && context && context.trim().length > 0) {
      try {
        contextVec = await getEmbedding(context);
        usedSemantic = true;
      } catch (err) {
        // embedding 挂了不是致命错，退回纯 tag 评分
        console.warn('[Knowledge] embedding 失败，降级为纯 tag 检索:', err instanceof Error ? err.message : err);
      }
    }

    // 评分每篇文档
    const scored: MatchedDoc[] = [];

    for (const doc of allDocs) {
      // 政策有效期过滤
      if (doc.expiresDate && new Date(doc.expiresDate) < now) continue;
      if (doc.effectiveDate && new Date(doc.effectiveDate) > now) continue;

      // ── tag 部分 ──
      const tagResult = computeTagScore(doc, contextLower, task, city);

      // ── cosine 部分 ──
      let cosineScore = 0;
      if (contextVec && Array.isArray(doc.embedding) && doc.embedding.length > 0) {
        // cosine ∈ [-1, 1]，截到 [0, 1]：负相似度直接当 0，避免抵消 tag 分
        cosineScore = Math.max(0, cosineSimilarity(contextVec, doc.embedding));
      }

      // ── 混合分 ──
      const tagNorm = Math.min(1, tagResult.raw / TAG_SCORE_NORM);
      const finalScore = (cosineScore * COSINE_WEIGHT + tagNorm * TAG_WEIGHT) * 200; // 还原到老分数量级，方便阈值复用

      // 入选门槛：任务匹配 OR 关键词命中 OR cosine 分够高（≥0.5 算"语义上明显相关"）
      const cleared =
        (tagResult.taskMatch || tagResult.keywordHits > 0 || cosineScore >= 0.5) &&
        finalScore > 0;

      if (cleared) {
        scored.push({
          title: doc.title,
          content: doc.content,
          score: finalScore,
          _debug: { tagScore: tagResult.raw, cosineScore, raw: finalScore },
        });
      }
    }

    // 按分数降序
    scored.sort((a, b) => b.score - a.score);

    // 取 top N，且不超过字符限制
    const selected: MatchedDoc[] = [];
    let totalChars = 0;

    for (const doc of scored) {
      if (selected.length >= maxDocs) break;
      if (totalChars + doc.content.length > maxChars) {
        const remaining = maxChars - totalChars;
        if (remaining > 200) {
          selected.push({
            ...doc,
            content: doc.content.slice(0, remaining) + '\n...(内容已截断)',
          });
        }
        break;
      }
      selected.push(doc);
      totalChars += doc.content.length;
    }

    if (selected.length === 0) {
      return { injection: '', matchCount: 0, matchedTitles: [], usedSemantic };
    }

    // 拼接注入文本
    const injection = '\n\n' + selected
      .map(d => `## 【知识库：${d.title}】\n${d.content}`)
      .join('\n\n');

    return {
      injection,
      matchCount: selected.length,
      matchedTitles: selected.map(d => d.title),
      usedSemantic,
    };
  } catch (error) {
    // 知识库查询失败不应阻断 AI 核心流程
    console.error('[Knowledge] 知识库查询失败:', error);
    return { injection: '', matchCount: 0, matchedTitles: [], usedSemantic: false };
  }
}
