// Verify that prompts reach the model and that the env-driven
// PRIMARY_MODEL / LIGHT_MODEL routing works end-to-end.
//
// Reads .env (+ optional .env.local override), imports the compiled
// routing table from src/lib/ai.ts style logic, and probes DashScope
// for each task with a short system+user prompt.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv(file) {
  const path = join(ROOT, file);
  if (!existsSync(path)) return;
  const txt = readFileSync(path, 'utf-8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
// .env.local has priority over .env in Next.js, so load it first
loadEnv('.env.local');
loadEnv('.env');

const KEY = process.env.DASHSCOPE_API_KEY;
if (!KEY) {
  console.error('DASHSCOPE_API_KEY missing');
  process.exit(1);
}

const PRIMARY = process.env.PRIMARY_MODEL || 'qwen3.5-plus';
const LIGHT = process.env.LIGHT_MODEL || 'qwen3.5-plus';

console.log(`PRIMARY_MODEL = ${PRIMARY}`);
console.log(`LIGHT_MODEL   = ${LIGHT}\n`);

// Mirror TASK_MODEL_MAP in src/lib/ai.ts
const TASK_MODEL_MAP = {
  'quote.generate':       PRIMARY,
  'quote.adjust':         LIGHT,
  'transaction.parse':    LIGHT,
  'transaction.classify': LIGHT,
  'reminder.generate':    PRIMARY,
  'insight.generate':     PRIMARY,
  'contract.generate':    PRIMARY,
};

const PROBES = {
  'quote.generate':       { system: '你是报价助手，返回 JSON', user: '回复 {"ok":true,"task":"quote.generate"}' },
  'quote.adjust':         { system: '你是报价调整助手，返回 JSON', user: '回复 {"ok":true,"task":"quote.adjust"}' },
  'transaction.parse':    { system: '你是记账解析助手，返回 JSON', user: '回复 {"ok":true,"task":"transaction.parse"}' },
  'transaction.classify': { system: '你是分类引擎，返回 JSON', user: '回复 {"ok":true,"task":"transaction.classify"}' },
  'reminder.generate':    { system: '你是催款助手，返回 JSON', user: '回复 {"ok":true,"task":"reminder.generate"}' },
  'insight.generate':     { system: '你是洞察助手，返回 JSON', user: '回复 {"ok":true,"task":"insight.generate"}' },
  'contract.generate':    { system: '你是合同助手，返回 JSON', user: '回复 {"ok":true,"task":"contract.generate"}' },
};

const URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

async function probe(task) {
  const model = TASK_MODEL_MAP[task];
  const { system, user } = PROBES[task];
  const t0 = Date.now();
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });
    const body = await res.text();
    const ms = Date.now() - t0;
    if (!res.ok) {
      return { task, model, ok: false, status: res.status, ms, error: body.slice(0, 300) };
    }
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    const content = parsed?.choices?.[0]?.message?.content;
    return { task, model, ok: !!content, status: res.status, ms, sample: (content || '').slice(0, 100) };
  } catch (e) {
    return { task, model, ok: false, ms: Date.now() - t0, error: String(e.message || e) };
  }
}

console.log('Probing DashScope with env-routed models...\n');
// Run in parallel to finish within reasonable time
const results = await Promise.all(Object.keys(TASK_MODEL_MAP).map(probe));
for (const r of results) {
  const tag = r.ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${r.task.padEnd(22)} -> ${r.model}  (${r.ms}ms, http ${r.status ?? '-'})`);
  if (!r.ok) console.log(`       error: ${r.error}`);
}

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
