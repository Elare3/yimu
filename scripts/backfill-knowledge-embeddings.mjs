#!/usr/bin/env node
// ============================================================
// 一木 YiMu — KnowledgeDoc embedding backfill 脚本（C 组）
//
// 用途：给数据库里所有 isActive=true 但 embedding 还是空数组的 KnowledgeDoc 计算并写回向量
//
// 跑：
//   node scripts/backfill-knowledge-embeddings.mjs
//   node scripts/backfill-knowledge-embeddings.mjs --force   # 强制重算（即使已有向量）
//   node scripts/backfill-knowledge-embeddings.mjs --dry     # 干跑，不写库
//
// 幂等：embeddingTextHash 没变就跳过，可重复跑不浪费 API 调用
// ============================================================

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── 加载 .env ──
function loadEnv(file) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  const txt = readFileSync(path, 'utf-8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
loadEnv('.env.local');
loadEnv('.env');

const KEY = process.env.DASHSCOPE_API_KEY;
if (!KEY) {
  console.error('❌ DASHSCOPE_API_KEY 未配置');
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry');

const EMBEDDING_MODEL_ID = 'dashscope:text-embedding-v3';
const EMBEDDING_DIM = 1024;
const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';
const BATCH_SIZE = 25;

function textHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function embedBatch(texts) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-v3',
      input: texts.map(t => t.slice(0, 2048)),
      dimensions: EMBEDDING_DIM,
      encoding_format: 'float',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`DashScope ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  // DashScope 返回 data: [{ index, embedding }]，按 index 还原顺序
  const out = new Array(texts.length);
  for (const item of data.data || []) {
    out[item.index] = item.embedding;
  }
  return out;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const docs = await prisma.knowledgeDoc.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        title: true,
        content: true,
        tags: true,
        embedding: true,
        embeddingTextHash: true,
      },
    });

    console.log(`📚 找到 ${docs.length} 篇活跃文档`);

    // 准备待算列表
    const todo = [];
    for (const doc of docs) {
      // embedding 的输入：标题 + tags + 正文，让向量同时承担"主题"和"内容"信号
      const text = `${doc.title}\n${(doc.tags || []).join(' ')}\n${doc.content}`;
      const hash = textHash(text);

      const hasVec = Array.isArray(doc.embedding) && doc.embedding.length === EMBEDDING_DIM;
      const hashUnchanged = doc.embeddingTextHash === hash;

      if (!FORCE && hasVec && hashUnchanged) {
        continue; // 跳过：已经有最新向量
      }

      todo.push({ id: doc.id, slug: doc.slug, title: doc.title, text, hash });
    }

    console.log(`🎯 待计算 ${todo.length} 篇（跳过 ${docs.length - todo.length} 篇已是最新）`);
    if (todo.length === 0) {
      console.log('✅ 全部 embedding 已是最新，无需更新');
      return;
    }

    if (DRY) {
      console.log('🔍 dry-run 模式，仅打印列表：');
      for (const t of todo) console.log(`  - [${t.slug}] ${t.title}`);
      return;
    }

    // 分批跑
    let done = 0;
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const texts = batch.map(t => t.text);

      console.log(`📡 调用 DashScope（batch ${Math.floor(i / BATCH_SIZE) + 1}，${batch.length} 条）...`);
      const vectors = await embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const vec = vectors[j];
        if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
          console.warn(`  ⚠️  [${item.slug}] embedding 形状异常，跳过`);
          continue;
        }
        await prisma.knowledgeDoc.update({
          where: { id: item.id },
          data: {
            embedding: vec,
            embeddingModel: EMBEDDING_MODEL_ID,
            embeddingTextHash: item.hash,
          },
        });
        done++;
        console.log(`  ✓ [${item.slug}] ${item.title}`);
      }
    }

    console.log(`\n✅ 完成 ${done}/${todo.length} 篇 embedding 更新`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ backfill 失败:', err);
  process.exit(1);
});
