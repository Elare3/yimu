/**
 * 客户端密码预哈希
 *
 * 目的：让浏览器 DevTools / 网络代理日志里看不到明文密码。
 * 浏览器先对 (phone + password) 做 SHA-256，再把 64 位十六进制送给服务器。
 * 服务器继续用 scrypt + 随机 salt 再哈希一层存库。
 *
 * ⚠️ 这**不能替代 HTTPS**：预哈希后的串在网络上被抓到照样可以重放登录。
 * 真正的传输安全必须依赖 TLS。预哈希的意义在于：
 *   1) DevTools / 代理日志不再能一眼看到可读明文
 *   2) 用户在其他站点复用同样密码时，即使本站服务器被拖库也不会泄露可复用的明文
 *
 * 与 phone 绑定：同一密码在不同账号上得到不同的哈希，防止通用彩虹表。
 *
 * 只在浏览器中调用；服务端收到的都是 64 位 hex，直接喂给 password.ts 的
 * hashPassword / verifyPassword（它们把整个 hex 当"密码"再做 scrypt）。
 *
 * 兼容性：Web Crypto (`crypto.subtle`) 仅在安全上下文（HTTPS / localhost）可用。
 * 在 http://IP 这种非安全上下文里它是 undefined，所以这里准备了纯 JS 兜底。
 */
const CLIENT_SALT = 'yimu-client-password-v1';

export async function preHashPassword(phone: string, password: string): Promise<string> {
  const input = `${phone}:${password}:${CLIENT_SALT}`;
  const bytes = new TextEncoder().encode(input);

  // 优先走 Web Crypto（HTTPS / localhost）
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
      return bufToHex(new Uint8Array(hashBuf));
    } catch {
      // 部分浏览器在非安全上下文里 crypto.subtle 存在但 digest 会抛错，落到兜底
    }
  }

  // 兜底：纯 JS SHA-256（HTTP+IP 这种非安全上下文）
  return sha256Hex(bytes);
}

/** 服务端用：校验收到的字符串是合法的 64 位小写 hex（防止有人绕过客户端发明文） */
export function isPreHashed(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

// ─────────────────────────── 纯 JS SHA-256 ───────────────────────────

function bufToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function rotr(n: number, b: number): number {
  return ((n >>> b) | (n << (32 - b))) >>> 0;
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Hex(bytes: Uint8Array): string {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  const bitLen = bytes.length * 8;
  // 末尾追加 0x80，再补零到 (mod 64) === 56，最后 8 字节是大端 64 位长度
  const padLen = ((bytes.length + 9 + 63) >>> 6) << 6;
  const msg = new Uint8Array(padLen);
  msg.set(bytes);
  msg[bytes.length] = 0x80;

  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  msg[padLen - 8] = (hi >>> 24) & 0xff;
  msg[padLen - 7] = (hi >>> 16) & 0xff;
  msg[padLen - 6] = (hi >>> 8) & 0xff;
  msg[padLen - 5] = hi & 0xff;
  msg[padLen - 4] = (lo >>> 24) & 0xff;
  msg[padLen - 3] = (lo >>> 16) & 0xff;
  msg[padLen - 2] = (lo >>> 8) & 0xff;
  msg[padLen - 1] = lo & 0xff;

  const W = new Uint32Array(64);

  for (let chunk = 0; chunk < padLen; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const j = chunk + i * 4;
      W[i] = ((msg[j] << 24) | (msg[j + 1] << 16) | (msg[j + 2] << 8) | msg[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0');
  return hex;
}
