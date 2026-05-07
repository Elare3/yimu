// ============================================================
// 一木 YiMu — SMTP 邮件抽象层
//
// 设计原则：
// 1. 单一发送入口：所有邮件经过 sendMail()，便于统一加日志/限流/失败重试
// 2. 静默失败：邮件发送失败不应影响主业务流（事件总线已 Promise.allSettled）
// 3. 模板与发送解耦：本文件只管"怎么发"，src/lib/email-templates.ts 管"发什么"
// 4. 配置缺失即降级：未配 SMTP_USER/PASS 时打印日志而不抛错
// ============================================================
import nodemailer, { Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = (process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // QQ/网易等国内 SMTP 在国内服务器上有时握手慢，给宽松超时
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return cachedTransporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** 关联用户 ID，仅用于日志追踪 */
  userId?: string;
  /** 业务事件类型，仅用于日志追踪 */
  eventType?: string;
}

export interface SendMailResult {
  ok: boolean;
  /** 'no_smtp' | 'no_recipient' | 'send_failed' */
  reason?: string;
  messageId?: string;
}

/**
 * 发送邮件。配置缺失或失败时返回 { ok: false }，永不抛错。
 */
export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  if (!opts.to || !/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(opts.to)) {
    return { ok: false, reason: 'no_recipient' };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[MAILER] SMTP 未配置（缺 SMTP_HOST/USER/PASS），跳过发送：subject="${opts.subject}" to=${opts.to}`,
    );
    return { ok: false, reason: 'no_smtp' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;

  try {
    const info = await transporter.sendMail({
      from: `"一木 YiMu" <${from}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text || stripHtml(opts.html),
      html: opts.html,
    });
    console.log(
      `[MAILER] 已发送 event=${opts.eventType ?? '-'} userId=${opts.userId ?? '-'} to=${opts.to} messageId=${info.messageId}`,
    );
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(
      `[MAILER] 发送失败 event=${opts.eventType ?? '-'} userId=${opts.userId ?? '-'} to=${opts.to}:`,
      err,
    );
    return { ok: false, reason: 'send_failed' };
  }
}

/** 简易 HTML→text 兜底（仅在调用方未提供 text 时使用） */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 用于设置页"测试发送"按钮 */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const transporter = getTransporter();
  if (!transporter) return { ok: false, error: 'SMTP 未配置（缺 SMTP_HOST/USER/PASS）' };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'SMTP 连接失败' };
  }
}
