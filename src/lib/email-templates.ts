// ============================================================
// 一木 YiMu — 邮件模板
//
// 设计原则：
// 1. 纯函数：传入数据 → 返回 { subject, html, text }，无副作用
// 2. 不引外部 CSS：邮件客户端 CSS 支持差，全部 inline style
// 3. 中文文案：贴近独立设计师/小工作室口吻，不端架子不啰嗦
// 4. 数据脱敏：金额按 ¥ 格式，客户名截断保护隐私
// ============================================================

import { formatBeijingDate } from './utils';

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

function fmtAmount(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// 邮件里所有日期按北京时间显示，避免服务器在 UTC 时区时显示成前一天
function fmtDate(d: Date): string {
  return formatBeijingDate(d);
}

function safeName(s: string, max = 20): string {
  if (!s) return '（未命名）';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="padding:24px 32px 0;">
          <div style="font-size:13px;color:#888;letter-spacing:0.5px;">一木 YiMu</div>
        </td></tr>
        ${body}
        <tr><td style="padding:20px 32px 28px;border-top:1px solid #eee;color:#999;font-size:12px;line-height:1.6;">
          这是一木 YiMu 的自动通知邮件。<br>
          可在<a href="${APP_URL}/settings" style="color:#666;text-decoration:underline;">设置页</a>调整通知偏好或退订。
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ═══ 1. 收款逾期 ═══
export interface OverdueEmailData {
  userName: string;
  clientName: string;
  projectName: string;
  nodeName: string;
  amount: number;
  dueDate: Date;
  overdueDays: number;
}

export function renderOverdueEmail(d: OverdueEmailData) {
  const subject = `【催款提醒】${safeName(d.clientName)} 已逾期 ${d.overdueDays} 天 · ${fmtAmount(d.amount)}`;
  const heat = d.overdueDays >= 30 ? '#d4351c' : d.overdueDays >= 7 ? '#e67e22' : '#f4a261';
  const advice =
    d.overdueDays >= 30
      ? '建议立即电话沟通，必要时启用律师函流程。'
      : d.overdueDays >= 7
        ? '建议升级催款方式，电话 + 微信双通道。'
        : '建议先发一条友好提醒，确认对方收到了通知。';

  const body = `
    <tr><td style="padding:8px 32px 0;">
      <h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.4;">${d.userName ? d.userName + '，' : ''}有一笔款项已逾期</h1>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7f5;border-left:3px solid ${heat};border-radius:6px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:13px;color:#666;">客户 / 项目</div>
          <div style="font-size:15px;margin-top:4px;">${safeName(d.clientName)} · ${safeName(d.projectName)}</div>
          <div style="font-size:13px;color:#666;margin-top:12px;">收款节点</div>
          <div style="font-size:15px;margin-top:4px;">${safeName(d.nodeName, 30)}</div>
          <div style="font-size:13px;color:#666;margin-top:12px;">应收金额 / 应收日</div>
          <div style="font-size:18px;margin-top:4px;font-weight:600;color:${heat};">
            ${fmtAmount(d.amount)} <span style="font-size:13px;font-weight:400;color:#666;">· ${fmtDate(d.dueDate)}</span>
          </div>
          <div style="font-size:13px;color:#666;margin-top:12px;">已逾期</div>
          <div style="font-size:18px;margin-top:4px;font-weight:600;color:${heat};">${d.overdueDays} 天</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px 0;color:#444;font-size:14px;line-height:1.7;">${advice}</td></tr>
    <tr><td style="padding:20px 32px 0;">
      <a href="${APP_URL}/payments" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">前往催款</a>
    </td></tr>
    <tr><td style="height:24px;"></td></tr>
  `;

  return { subject, html: shell(subject, body) };
}

// ═══ 2. 收款即将到期 ═══
export interface DueSoonEmailData {
  userName: string;
  clientName: string;
  projectName: string;
  nodeName: string;
  amount: number;
  dueDate: Date;
  daysUntilDue: number;
}

export function renderDueSoonEmail(d: DueSoonEmailData) {
  const dayWord = d.daysUntilDue === 0 ? '今天' : d.daysUntilDue === 1 ? '明天' : `${d.daysUntilDue} 天后`;
  const subject = `【到期提醒】${safeName(d.clientName)} ${dayWord}应收 ${fmtAmount(d.amount)}`;

  const body = `
    <tr><td style="padding:8px 32px 0;">
      <h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.4;">${d.userName ? d.userName + '，' : ''}${dayWord}有一笔款项到期</h1>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5faff;border-left:3px solid #2a7de1;border-radius:6px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:13px;color:#666;">客户 / 项目</div>
          <div style="font-size:15px;margin-top:4px;">${safeName(d.clientName)} · ${safeName(d.projectName)}</div>
          <div style="font-size:13px;color:#666;margin-top:12px;">收款节点</div>
          <div style="font-size:15px;margin-top:4px;">${safeName(d.nodeName, 30)}</div>
          <div style="font-size:13px;color:#666;margin-top:12px;">应收金额 / 应收日</div>
          <div style="font-size:18px;margin-top:4px;font-weight:600;color:#2a7de1;">
            ${fmtAmount(d.amount)} <span style="font-size:13px;font-weight:400;color:#666;">· ${fmtDate(d.dueDate)}（${dayWord}）</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px 0;color:#444;font-size:14px;line-height:1.7;">
      ${d.daysUntilDue === 0
        ? '今天就是应收日，记得跟客户确认到账情况。'
        : '建议提前一两天发个温和的提醒，避免忘付造成尴尬。'}
    </td></tr>
    <tr><td style="padding:20px 32px 0;">
      <a href="${APP_URL}/payments" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">前往查看</a>
    </td></tr>
    <tr><td style="height:24px;"></td></tr>
  `;

  return { subject, html: shell(subject, body) };
}

// ═══ 3. 报价单即将过期 ═══
export interface QuoteExpiringEmailData {
  userName: string;
  clientName: string;
  quoteTitle: string;
  total: number;
  validUntil: Date;
  daysUntilExpire: number;
}

export function renderQuoteExpiringEmail(d: QuoteExpiringEmailData) {
  const dayWord = d.daysUntilExpire === 0 ? '今天' : d.daysUntilExpire === 1 ? '明天' : `${d.daysUntilExpire} 天后`;
  const subject = `【报价提醒】发给 ${safeName(d.clientName)} 的报价 ${dayWord}过期`;

  const body = `
    <tr><td style="padding:8px 32px 0;">
      <h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.4;">${d.userName ? d.userName + '，' : ''}有一份报价${dayWord}过期</h1>
    </td></tr>
    <tr><td style="padding:16px 32px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8e6;border-left:3px solid #d4a017;border-radius:6px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:13px;color:#666;">客户 / 报价</div>
          <div style="font-size:15px;margin-top:4px;">${safeName(d.clientName)} · ${safeName(d.quoteTitle, 30)}</div>
          <div style="font-size:13px;color:#666;margin-top:12px;">报价金额 / 有效期至</div>
          <div style="font-size:18px;margin-top:4px;font-weight:600;color:#d4a017;">
            ${fmtAmount(d.total)} <span style="font-size:13px;font-weight:400;color:#666;">· ${fmtDate(d.validUntil)}（${dayWord}）</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 32px 0;color:#444;font-size:14px;line-height:1.7;">
      过期前再跟进一次：客户犹豫的报价，过期后基本就凉了。可以借"有效期到期"作为软性催促理由。
    </td></tr>
    <tr><td style="padding:20px 32px 0;">
      <a href="${APP_URL}/quotes" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">前往跟进</a>
    </td></tr>
    <tr><td style="height:24px;"></td></tr>
  `;

  return { subject, html: shell(subject, body) };
}

// ═══ 4. 邮箱验证（注册补填邮箱时使用） ═══
export function renderEmailVerifyEmail(d: { userName: string; verifyUrl: string }) {
  const subject = '【一木 YiMu】请验证你的邮箱';
  const body = `
    <tr><td style="padding:8px 32px 0;">
      <h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.4;">${d.userName ? d.userName + '，' : ''}验证一下你的邮箱</h1>
    </td></tr>
    <tr><td style="padding:16px 32px 0;color:#444;font-size:14px;line-height:1.7;">
      点击下方按钮即可完成验证。链接 24 小时内有效。
    </td></tr>
    <tr><td style="padding:20px 32px 0;">
      <a href="${d.verifyUrl}" style="display:inline-block;padding:10px 20px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">验证邮箱</a>
    </td></tr>
    <tr><td style="padding:16px 32px 0;color:#999;font-size:12px;line-height:1.7;word-break:break-all;">
      若按钮无法点击，请复制此链接到浏览器：<br>${d.verifyUrl}
    </td></tr>
    <tr><td style="height:24px;"></td></tr>
  `;
  return { subject, html: shell(subject, body) };
}
