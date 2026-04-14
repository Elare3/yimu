// ============================================================
// 一木 YiMu — 知识库注入引擎 v1.0
// 从 MongoDB 读取知识文档，按任务类型 + 上下文关键词匹配
// 注入到 AI System Prompt，政策变了改数据库就行，不用动代码
// ============================================================

import { prisma } from './prisma';

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
}

interface KnowledgeResult {
  /** 拼接好的注入文本，直接追加到 system prompt 后面 */
  injection: string;
  /** 命中的文档数 */
  matchCount: number;
  /** 命中的文档标题（用于日志/审计） */
  matchedTitles: string[];
}

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

/** 手动清除缓存（seed 后或更新文档后调用） */
export function clearKnowledgeCache() {
  cachedDocs = null;
  cacheTimestamp = 0;
}

// ────────────────────────────────────────
// 核心匹配函数
// ────────────────────────────────────────

/**
 * 根据任务类型和上下文，从数据库匹配相关知识文档并拼接注入文本
 *
 * @param task    - AI 任务类型
 * @param context - 上下文文本（用户输入 / 需求描述等），用于关键词匹配
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
  } = {}
): Promise<KnowledgeResult> {
  const { maxDocs = 3, maxChars = 4000, city, category } = options;

  try {
    const allDocs = await loadDocs();
    if (allDocs.length === 0) {
      return { injection: '', matchCount: 0, matchedTitles: [] };
    }

    // 构建上下文搜索串（全小写）
    const contextLower = [context, city || '', category || ''].join(' ').toLowerCase();

    // 当前日期，用于检查政策有效期
    const now = new Date();

    // 评分每篇文档
    const scored: MatchedDoc[] = [];

    for (const doc of allDocs) {
      // 检查政策有效期
      if (doc.expiresDate && new Date(doc.expiresDate) < now) continue;
      if (doc.effectiveDate && new Date(doc.effectiveDate) > now) continue;

      let score = 0;

      // 1) 任务类型匹配（核心权重）
      const taskMatch = doc.tasks.length === 0 || doc.tasks.includes(task);
      if (doc.tasks.includes(task)) score += 100;

      // 2) 关键词命中（每个 +10）
      let keywordHits = 0;
      for (const tag of doc.tags) {
        if (contextLower.includes(tag.toLowerCase())) {
          keywordHits++;
          score += 10;
        }
      }

      // 3) 地区匹配（城市命中 +30）
      if (doc.region && doc.region !== '全国' && city) {
        if (doc.region === city) score += 30;
      }
      // 全国性政策任务匹配时也加分
      if (doc.region === '全国' || doc.region === '') score += 5;

      // 4) 优先级加权（priority 越小分越高）
      score += Math.max(0, 20 - doc.priority);

      // 必须满足：任务匹配 OR 关键词命中 ≥ 1
      if ((taskMatch || keywordHits > 0) && score > 0) {
        scored.push({ title: doc.title, content: doc.content, score });
      }
    }

    // 按分数降序排列
    scored.sort((a, b) => b.score - a.score);

    // 取 top N，且不超过字符限制
    const selected: MatchedDoc[] = [];
    let totalChars = 0;

    for (const doc of scored) {
      if (selected.length >= maxDocs) break;
      if (totalChars + doc.content.length > maxChars) {
        // 尝试截断
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
      return { injection: '', matchCount: 0, matchedTitles: [] };
    }

    // 拼接注入文本
    const injection = '\n\n' + selected
      .map(d => `## 【知识库：${d.title}】\n${d.content}`)
      .join('\n\n');

    return {
      injection,
      matchCount: selected.length,
      matchedTitles: selected.map(d => d.title),
    };
  } catch (error) {
    // 知识库查询失败不应阻断 AI 核心流程
    console.error('[Knowledge] 知识库查询失败:', error);
    return { injection: '', matchCount: 0, matchedTitles: [] };
  }
}
