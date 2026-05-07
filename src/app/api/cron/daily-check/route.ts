// ============================================================
// 每日检查 cron 接口
//
// 用法：
//   curl -X POST http://localhost:3000/api/cron/daily-check \
//     -H "x-cron-secret: $CRON_SECRET"
//
// 部署（推荐：在 crontab 顶部声明北京时区，避免 UTC 服务器误触发）：
//   CRON_TZ=Asia/Shanghai
//   0 9 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" \
//     https://yimuai.com.cn/api/cron/daily-check >> /var/log/yimu-cron.log 2>&1
//
//   → 北京时间每天 09:00 触发
//   → 阿里云大陆服务器默认 Asia/Shanghai，加 CRON_TZ 是为防止重装/迁移到 UTC 时偏移 8h
//   → 业务侧（events.ts）已用 beijingMidnight() 与服务器时区解耦，cron 早跑/晚跑只影响触发时刻，不影响窗口
//
// 安全：
//   - 必须带 x-cron-secret header（与 env CRON_SECRET 比对，timing-safe）
//   - 没配 CRON_SECRET 直接 503，不允许裸跑
//   - dynamic = force-dynamic：永远走真实逻辑，不缓存
// ============================================================
import { NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { emit } from '@/lib/events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function runDailyCheck() {
  const startedAt = Date.now();
  const expected = process.env.CRON_SECRET;

  // 没配 CRON_SECRET，拒绝执行
  if (!expected || expected.length < 8) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET 未配置或太短（< 8 字符）' },
      { status: 503 },
    );
  }

  // 拉所有用户（小型 SaaS 直接全量；> 1万用户后改成分批 emit）
  const users = await prisma.user.findMany({ select: { id: true } });

  let processed = 0;
  let failed = 0;
  for (const u of users) {
    try {
      await emit('daily.check', { userId: u.id });
      processed++;
    } catch (err) {
      console.error(`[CRON] daily.check failed for user ${u.id}:`, err);
      failed++;
    }
  }

  const elapsed = Date.now() - startedAt;
  console.log(
    `[CRON] daily-check 完成：用户=${users.length} 成功=${processed} 失败=${failed} 耗时=${elapsed}ms`,
  );

  return NextResponse.json({
    ok: true,
    users: users.length,
    processed,
    failed,
    elapsedMs: elapsed,
  });
}

function checkAuth(req: Request): { ok: true } | { ok: false; res: Response } {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 8) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: 'CRON_SECRET 未配置或太短（< 8 字符）' },
        { status: 503 },
      ),
    };
  }

  const provided =
    req.headers.get('x-cron-secret') ||
    // 兼容 ?secret=... 给浏览器手动触发用（开发时方便）
    new URL(req.url).searchParams.get('secret') ||
    '';

  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.res;
  return runDailyCheck();
}

// 也支持 GET（部分老版本 crontab/curl 习惯）— 但仍要带 secret
export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.res;
  return runDailyCheck();
}
