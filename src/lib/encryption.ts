// ============================================================
// 一木 YiMu — 敏感字段加密 (AES-256-GCM)
// 自动对客户的电话/邮箱/微信/地址、用户的电话做加解密
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
