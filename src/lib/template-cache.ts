// ============================================================
// 一木 YiMu — 模板缓存池 v2.0（C 组：语义缓存）
//
// 核心机制：相同意图参数 → AI 永远不重复生成模板
//
// v1（哈希精确匹配）：
//   intent { amountTier:'medium', complexity:'simple' } → hash A
//   intent { amountTier:'medium', complexity:'medium' } → hash B
//   即使两组参数语义上 99% 相同，hash 不同就各自打 AI 一次。
//
// v2（语义最近邻 + 哈希精确）：
//   1) 先按 intentHash 精确查（最快，0 网络）
//   2) 没命中 → 把 intent 序列化成可读串，算 embedding，KNN 查同 task 的所有 cache，
//      cosine ≥ SEMANTIC_THRESHOLD 就复用对方的模板（仍然 0 AI 调用，多一次 embedding 而已）
//   3) 都没命中才打 AI 生成
//
// 阈值调到 0.92：在 1024 维 cosine 空间里，0.92+ 基本就是"参数差一两个 tier"的细粒度分歧，
// 模板复用风险低。后续可结合用户反馈微调。
//
// 流程依然是：本地理解（规则引擎算意图）→ 云端表达（AI只看意图参数）→ 本地填充
// ============================================================

import { prisma } from './prisma';
import { hashIntent } from './semantic-intent';
import { secureCallAI } from './security';
import { getEmbedding, cosineSimilarity, EMBEDDING_DIM } from './embedding';

/* eslint-disable @typescript-eslint/no-explicit-any */

// 语义命中阈值。1024 维空间里 0.92 算"非常相近"，调高阈值可减少误用、调低阈值可增加缓存命中率
const SEMANTIC_THRESHOLD = 0.92;

// 同 task 候选行最多取多少条做 KNN（避免 task 下缓存爆炸时全表扫）
const SEMANTIC_CANDIDATE_LIMIT = 200;

/**
 * 把意图参数序列化为稳定的可读字符串，作为 embedding 的输入。
 * 关键：对 key 排序，保证不同顺序的同一对象产生同一文本。
 */
function intentToText(task: string, intent: Record<string, any>): string {
  const sortedKeys = Object.keys(intent).sort();
  const lines = sortedKeys.map(k => {
    const v = intent[k];
    const stringified = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `${k}: ${stringified}`;
  });
  return `task=${task}\n${lines.join('\n')}`;
}

/**
 * 语义最近邻查询：在同 task 的 cache 行里找一个 cosine ≥ 阈值的最相似行
 * 返回 null 表示没找到足够近的
 */
async function findSemanticHit(
  task: string,
  intentVec: number[],
): Promise<{ templates: string[]; intentHash: string; cosine: number } | null> {
  // 只取有 embedding 的候选行；按最近用过排序，热门项优先
  const candidates = await prisma.aITemplateCache.findMany({
    where: { task },
    orderBy: [{ lastUsedAt: 'desc' }, { useCount: 'desc' }],
    take: SEMANTIC_CANDIDATE_LIMIT,
    select: {
      intentHash: true,
      templates: true,
      intentEmbedding: true,
    },
  });

  let best: { templates: string[]; intentHash: string; cosine: number } | null = null;

  for (const row of candidates) {
    const vec = row.intentEmbedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) continue;
    const cos = cosineSimilarity(intentVec, vec);
    if (cos >= SEMANTIC_THRESHOLD && (!best || cos > best.cosine)) {
      best = {
        templates: row.templates as string[],
        intentHash: row.intentHash,
        cosine: cos,
      };
    }
  }

  return best;
}

/**
 * 获取或生成模板：精确 hash → 语义 KNN → AI 生成 三级回落
 *
 * `systemPrompt` 可传字符串或 async 构造器函数：
 *   - 传字符串：保留旧用法
 *   - 传函数：仅在缓存全部未命中、需要打 AI 时调用，省一次知识库查询
 */
export async function getOrGenerateTemplate(
  task: string,
  intent: Record<string, any>,
  systemPrompt: string | (() => Promise<string>),
  userId: string,
): Promise<{ template: string; cacheHit: boolean }> {

  const intentHash = hashIntent({ task, ...intent });

  // ── Level 1: 精确 hash 查 ──
  const cached = await prisma.aITemplateCache.findUnique({
    where: { intentHash },
  });

  if (cached) {
    const templates = cached.templates as string[];
    const selected = templates[Math.floor(Math.random() * templates.length)];

    await prisma.aITemplateCache.update({
      where: { intentHash },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });

    await prisma.aICallLog.create({
      data: { userId, task, intentParams: intent, dataSent: 'none', cacheHit: true },
    });

    return { template: selected, cacheHit: true };
  }

  // ── Level 2: 语义 KNN（embedding 失败就跳过，绝不阻塞主流程）──
  const intentText = intentToText(task, intent);
  let intentVec: number[] | null = null;
  try {
    intentVec = await getEmbedding(intentText);
    const semanticHit = await findSemanticHit(task, intentVec);
    if (semanticHit) {
      const selected = semanticHit.templates[Math.floor(Math.random() * semanticHit.templates.length)];

      // 命中的是"近邻行"，更新它的 useCount 让它的热度往上走
      await prisma.aITemplateCache.update({
        where: { intentHash: semanticHit.intentHash },
        data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
      });

      // 顺带把"新意图"也写进缓存，下次精确 hash 直接命中
      // 这是关键：让相近意图的精确 hash 也能秒命中，不必每次都跑 embedding
      try {
        await prisma.aITemplateCache.create({
          data: {
            task,
            intentHash,
            intentParams: intent,
            templates: semanticHit.templates,
            intentText,
            intentEmbedding: intentVec,
            useCount: 1,
            lastUsedAt: new Date(),
          },
        });
      } catch {
        // 并发写竞态：另一个请求抢先创建了 → 忽略
      }

      await prisma.aICallLog.create({
        data: { userId, task, intentParams: intent, dataSent: 'none', cacheHit: true },
      });

      return { template: selected, cacheHit: true };
    }
  } catch (err) {
    // embedding 不可用不影响主流程，继续走 AI 生成
    console.warn('[TemplateCache] 语义查找失败，回退到 AI 生成:', err instanceof Error ? err.message : err);
  }

  // ── Level 3: 都没命中 → 生成新模板 ──
  const resolvedSystemPrompt = typeof systemPrompt === 'function'
    ? await systemPrompt()
    : systemPrompt;

  const promptText = buildIntentPrompt(task, intent);

  const result = await secureCallAI({
    userId,
    task: `${task}.generate`,
    rawInput: promptText,
    systemPrompt: resolvedSystemPrompt,
    buildPromptFn: (s) => s,
  });

  if (result.success && result.data?.templates) {
    await prisma.aITemplateCache.create({
      data: {
        task,
        intentHash,
        intentParams: intent,
        templates: result.data.templates,
        intentText,
        // intentVec 可能因前面的 catch 仍是 null，写入空数组，下次会被 backfill 补上
        intentEmbedding: intentVec ?? [],
      },
    });

    await prisma.aICallLog.create({
      data: { userId, task, intentParams: intent, dataSent: 'intent_only', cacheHit: false },
    });

    return { template: result.data.templates[0], cacheHit: false };
  }

  // AI失败：返回预设模板（规则引擎兜底）
  await prisma.aICallLog.create({
    data: { userId, task, intentParams: intent, dataSent: 'none', cacheHit: false },
  });

  return { template: getFallbackTemplate(task, intent), cacheHit: false };
}

function buildIntentPrompt(task: string, intent: Record<string, any>): string {
  const paramLines = Object.entries(intent)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');

  return `根据以下意图参数生成3个不同风格的模板候选。

任务类型：${task}
${paramLines}

重要规则：
1. 模板中使用占位符引用具体数据，绝对不要编造任何具体的名称、金额、日期
2. 可用占位符：{CLIENT}客户称呼、{PROJECT}项目名、{PAYMENT_NAME}收款节点名、{AMOUNT}金额、{OVERDUE_DAYS}逾期天数、{DUE_DATE}到期日、{USER_NAME}用户姓名、{USER_COMPANY}公司名、{USER_PHONE}手机号、{MONTH_INCOME}月收入、{LAST_MONTH_INCOME}上月收入、{PROFIT_RATE}利润率、{TOP_CLIENT}最大客户、{TOP_CLIENT_RATIO}最大客户占比、{QUARTER_INCOME}季度收入、{TAX_THRESHOLD}免税额度
3. 3个模板在措辞风格上有所不同，但语气级别一致

返回JSON：{ "templates": ["模板1", "模板2", "模板3"] }`;
}

// ═══ 预设兜底模板 ═══

export function getFallbackTemplate(task: string, intent: Record<string, any>): string {
  if (task === 'reminder') {
    const level = intent.level ?? 0;
    const fallbacks: Record<number, string> = {
      0: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）将于{DUE_DATE}到期，届时烦请安排付款。如有疑问随时联系我。{USER_NAME}',
      1: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已超过约定付款日{OVERDUE_DAYS}天，烦请尽快安排转账。{USER_NAME} {USER_PHONE}',
      2: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已逾期{OVERDUE_DAYS}天。请于本周内完成付款，如有困难请及时沟通。{USER_NAME}',
      3: '{CLIENT}您好，{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已逾期{OVERDUE_DAYS}天，已影响我方正常经营。请务必于3个工作日内安排付款。{USER_NAME} {USER_COMPANY}',
      4: '{CLIENT}负责人：关于{PROJECT}的{PAYMENT_NAME}（{AMOUNT}），已逾期{OVERDUE_DAYS}天。现正式函告，请于收到本函后5个工作日内付清欠款。逾期我方将保留依法追索的权利。{USER_COMPANY} {USER_NAME}',
      5: '{CLIENT}负责人：{PROJECT}的{PAYMENT_NAME}（{AMOUNT}）已逾期{OVERDUE_DAYS}天。依据《民法典》第577条，我方正式要求贵方于7日内付清全部欠款及逾期利息。届时未付，将依法提起诉讼。{USER_COMPANY} {USER_NAME}',
      6: '{CLIENT}：本律师受{USER_COMPANY}（{USER_NAME}）委托，就贵方拖欠{PROJECT}服务费{AMOUNT}一事致函。该款项已逾期{OVERDUE_DAYS}天，请于收函后10日内付清本金及利息，否则我方将依法向人民法院提起诉讼。',
    };
    return fallbacks[level] || fallbacks[1];
  }

  if (task === 'insight') {
    return '本月经营数据已更新。收入{MONTH_INCOME}，利润率{PROFIT_RATE}。建议关注现金流状况和客户多元化。';
  }

  return '';
}

// ═══ 本地填充：把模板里的占位符替换为真实数据 ═══

export function fillTemplate(template: string, data: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    // Use regex with global flag for compatibility
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  // 清理未被替换的占位符（数据缺失时不显示占位符原文）
  result = result.replace(/\{[A-Z_]+\}/g, '');
  return result.trim();
}
