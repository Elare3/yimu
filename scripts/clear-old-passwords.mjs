// ============================================================
// 一木 YiMu — 清空旧密码哈希（仅一次性使用）
// 用法：
//   node scripts/clear-old-passwords.mjs            # 预演（不写库）
//   CONFIRM=yes node scripts/clear-old-passwords.mjs  # 真执行
//
// 什么时候要跑：
//   客户端密码预哈希上线后（sha256(phone:password:salt) 绑定手机号），
//   在此之前存量用户的 User.passwordHash 是按"明文密码 → scrypt"生成的，
//   无法被新版登录流（客户端送 hex，服务端再 scrypt）验过。
//
//   直接批量清空这些用户的 passwordHash，让他们走验证码登录后在设置页
//   重设密码，比留着一个永远验不过的 hash 更诚实。
//
// 怎么保证只清"旧"的、不误伤"新"的：
//   本脚本用 User.updatedAt < CUTOFF 作为卡点 —— 环境变量 CUTOFF 或默认
//   今天零点。switch 之前的用户 updatedAt 不会超过切换时间，故只影响旧号。
//   如果生产库是全新的 PostgreSQL（MongoDB 没迁数据），输出会是 cleared=0。
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cutoffRaw = process.env.CUTOFF;
const cutoff = cutoffRaw
  ? new Date(cutoffRaw)
  : new Date(new Date().setHours(0, 0, 0, 0));

if (Number.isNaN(cutoff.getTime())) {
  console.error(`✗ CUTOFF 解析失败：${cutoffRaw}。用 ISO 格式，如 CUTOFF=2026-04-23T00:00:00Z`);
  process.exit(1);
}

const confirm = process.env.CONFIRM === 'yes';

async function main() {
  // 先查一下会命中多少条
  const candidates = await prisma.user.findMany({
    where: {
      passwordHash: { not: null },
      updatedAt: { lt: cutoff },
    },
    select: { id: true, updatedAt: true },
  });

  console.log('──────────────────────────────────────────');
  console.log(` 清空点（cutoff）: ${cutoff.toISOString()}`);
  console.log(` 命中用户数     : ${candidates.length}`);
  console.log(` 模式           : ${confirm ? '真执行' : '预演（dry-run）'}`);
  console.log('──────────────────────────────────────────');

  if (candidates.length === 0) {
    console.log('✓ 没有旧用户需要处理。');
    return;
  }

  if (!confirm) {
    console.log('这 N 个用户的 passwordHash 会被置为 null，他们需要走验证码登录后重设密码。');
    console.log('确认无误后加 CONFIRM=yes 重新跑。');
    return;
  }

  const result = await prisma.user.updateMany({
    where: {
      passwordHash: { not: null },
      updatedAt: { lt: cutoff },
    },
    data: { passwordHash: null },
  });

  console.log(`✓ 已清空 ${result.count} 个用户的旧 passwordHash。`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
