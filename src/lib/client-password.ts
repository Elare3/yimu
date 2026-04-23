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
 */
const CLIENT_SALT = 'yimu-client-password-v1';

export async function preHashPassword(phone: string, password: string): Promise<string> {
  const input = `${phone}:${password}:${CLIENT_SALT}`;
  const buf = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 服务端用：校验收到的字符串是合法的 64 位小写 hex（防止有人绕过客户端发明文） */
export function isPreHashed(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
