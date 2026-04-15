// ============================================================
// 为存量 User 回填 phoneHash
// 用法：node scripts/backfill-phone-hash.mjs
// ============================================================
// 触发场景：
//   旧版 Prisma 中间件用随机 IV 加密 User.phone，登录查询失配，
//   新版改为用 HMAC-SHA256(phone) 做索引字段 phoneHash。
//   此脚本读出所有用户 → 解密得到明文手机号 → 写回 phoneHash。
// ------------------------------------------------------------

import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const PREFIX = 'enc:';

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
  }
  return Buffer.from(key, 'hex');
}

function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith(PREFIX)) return ciphertext; // 明文直接返回
  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return ciphertext;
  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let out = decipher.update(encryptedHex, 'hex', 'utf8');
  out += decipher.final('utf8');
  return out;
}

function hmacPhone(phone) {
  return crypto.createHmac('sha256', getKey()).update(phone).digest('hex');
}

const prisma = new PrismaClient();

async function main() {
  // 绕过中间件的 findMany（Prisma 中间件读路径会自动解密，但这里保险起见手动处理）
  const users = await prisma.$runCommandRaw({
    find: 'User',
    filter: {},
    projection: { _id: 1, phone: 1, phoneHash: 1 },
  });

  const batch = users?.cursor?.firstBatch ?? [];
  console.log(`Found ${batch.length} users`);

  let updated = 0;
  let skipped = 0;
  const collisions = [];

  for (const u of batch) {
    const id = u._id?.$oid ?? u._id;
    const rawPhone = u.phone ?? '';
    if (!rawPhone) { skipped++; continue; }

    let plain;
    try {
      plain = decrypt(rawPhone);
    } catch (e) {
      console.error(`[SKIP] user ${id}: decrypt failed —`, e.message);
      skipped++;
      continue;
    }

    const hash = hmacPhone(plain);
    if (u.phoneHash === hash) { skipped++; continue; }

    // 碰撞检测：是否已有另一个用户的 phoneHash 等于此 hash
    const dup = batch.find((x) => x !== u && x.phoneHash === hash);
    if (dup) {
      collisions.push({ id, otherId: dup._id?.$oid ?? dup._id, plain });
      continue;
    }

    await prisma.$runCommandRaw({
      update: 'User',
      updates: [
        { q: { _id: u._id }, u: { $set: { phoneHash: hash } } },
      ],
    });
    updated++;
  }

  console.log(`\nDone. updated=${updated} skipped=${skipped} collisions=${collisions.length}`);
  if (collisions.length) {
    console.log('\nCOLLISIONS (need manual merge):');
    for (const c of collisions) console.log('  -', c);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
