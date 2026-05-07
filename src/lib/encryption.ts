// ============================================================
// 一木 YiMu — 敏感字段加密 (AES-256-GCM)
//
// 当前只加密一个字段：User.phone（登录凭证、唯一身份）。
//   - 存储：encrypt(phone) → "enc:<iv>:<tag>:<ciphertext>"
//   - 查询：phoneHash 字段（hmacPhone）做唯一索引
// 客户（Client）的 phone / email / wechat / address 是用户主动录入的业务数据，
// 故意不加密 —— 便于搜索、导出 CSV、AI 分析。如需改为加密，要同步：
//   1) 写迁移脚本批量 encrypt 存量数据
//   2) 所有读路径加 decrypt
//   3) 为可搜索字段加 HMAC hash 列做索引（否则模糊搜索失效）
// ============================================================

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // GCM recommended
const ENCODING = 'hex';
const PREFIX = 'enc:';  // encrypted value marker

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string → "enc:<iv>:<authTag>:<ciphertext>" (all hex)
 * Returns the original value if empty/null/undefined.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  // Already encrypted — don't double-encrypt
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);
  const authTag = cipher.getAuthTag().toString(ENCODING);

  return `${PREFIX}${iv.toString(ENCODING)}:${authTag}:${encrypted}`;
}

/**
 * Decrypt an "enc:..." string back to plaintext.
 * Returns the original value if it's not encrypted (backwards-compatible).
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  if (!ciphertext.startsWith(PREFIX)) return ciphertext; // plaintext passthrough

  const key = getKey();
  const parts = ciphertext.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return ciphertext; // malformed, return as-is

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, ENCODING);
  const authTag = Buffer.from(authTagHex, ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Check if a value is already encrypted.
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Deterministic HMAC-SHA256 hash of a phone number, used as a lookup index
 * alongside the encrypted (random-IV) ciphertext. Keyed with ENCRYPTION_KEY
 * so the hash is not a rainbow-table lookup for an attacker who only gets
 * the DB dump.
 */
export function hmacPhone(phone: string): string {
  if (!phone) return '';
  const key = getKey();
  return crypto.createHmac('sha256', key).update(phone).digest('hex');
}
