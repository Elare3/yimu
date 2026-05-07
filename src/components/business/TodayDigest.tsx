'use client';

// ============================================================
// 今日要事 hero 卡片
//
// 这是 Dashboard 顶部第一眼能看到的"今天要做什么"汇总。
// 设计理念：
//   1. 一眼总览：顶部一行 "今天有 N 件事要处理"，0 件时给积极的空状态
//   2. 分级展示：urgent（逾期/今日/明日）大方块，secondary（项目/报价/税务）小 chip
//   3. 可点击：每个方块点进去都是对应业务页面（带过滤参数）
//   4. 节奏轻：低频提醒（报价过期/税务）不抢主舞台
//
// 数据来源：/api/dashboard/alerts 返回的 digest 字段
// 风格匹配：复用现有 dashboard 的 token（rounded-card / cream / brown / olive / amber / danger）
// ============================================================

import Link from 'next/link';
import useSWR from 'swr';
import { formatAmount } from '@/lib/utils';

type Digest = {
  overdue: { count: number; amount: number; worstClient: string | null; worstDays: number };
  today: { count: number; amount: number };
  tomorrow: { count: number; amount: number };
  upcoming: { count: number; amount: number };
  projectDeadline: { count: number };
  quoteExpiring: { count: number };
  tax: { count: number };
  totalUrgent: number;
  totalAll: number;
};

// 北京时间下的"今天"显示串，避开服务器/浏览器 TZ 不一致
function todayLabelBJ(): string {
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
  const bj = new Date(Date.now() + BJ_OFFSET_MS);
  const m = bj.getUTCMonth() + 1;
  const d = bj.getUTCDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${m}月${d}日 周${weekdays[bj.getUTCDay()]}`;
}

interface TileProps {
  icon: string;
  label: string;
  count: number;
  amount?: number;
  link: string;
  severity: 'urgent' | 'warning' | 'neutral';
  hint?: string;
}

function Tile({ icon, label, count, amount, link, severity, hint }: TileProps) {
  const styles = {
    urgent: {
      wrap: 'bg-[#FDF0EF] border-danger/25 hover:border-danger/45 hover:bg-[#FBE4E2]',
      count: 'text-danger',
      label: 'text-brown-700',
      hint: 'text-danger/80',
    },
    warning: {
      wrap: 'bg-amber-50 border-amber-200 hover:border-amber-300 hover:bg-amber-100/70',
      count: 'text-amber-700',
      label: 'text-brown-700',
      hint: 'text-amber-700/80',
    },
    neutral: {
      wrap: 'bg-cream-50 border-cream-300 hover:border-cream-400 hover:bg-cream-100',
      count: 'text-brown-700',
      label: 'text-brown-700',
      hint: 'text-brown-300',
    },
  }[severity];

  // count = 0 时不点亮
  const isEmpty = count === 0;

  if (isEmpty) {
    return (
      <div className="rounded-[14px] border-[1.5px] border-cream-300 bg-cream-50/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-brown-300">{label}</span>
          <span className="text-base opacity-40">{icon}</span>
        </div>
        <p className="font-serif text-2xl font-bold text-brown-300">0</p>
        <p className="text-xs text-brown-300 mt-1 invisible">.</p>
      </div>
    );
  }

  return (
    <Link
      href={link}
      className={`block rounded-[14px] border-[1.5px] p-4 transition-all duration-200 hover:translate-y-[-2px] hover:shadow-[0_8px_24px_rgba(44,36,32,0.06)] ${styles.wrap}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${styles.label}`}>{label}</span>
        <span className="text-base">{icon}</span>
      </div>
      <p className={`font-serif text-2xl font-bold ${styles.count}`}>{count}</p>
      <p className={`text-xs mt-1 ${styles.hint} truncate`}>
        {hint ? hint : amount !== undefined ? formatAmount(amount) : '\u00A0'}
      </p>
    </Link>
  );
}

export default function TodayDigest() {
  const { data } = useSWR('/api/dashboard/alerts', { refreshInterval: 120_000 });
  const digest: Digest | undefined = data?.data?.digest;

  if (!digest) return null;

  // ── 空状态：今天没什么火烧眉毛的 ──
  if (digest.totalAll === 0) {
    return (
      <div className="bg-olive-light/60 border-[1.5px] border-olive/20 rounded-card px-6 py-7 flex items-center gap-4">
        <span className="text-3xl shrink-0">🌿</span>
        <div className="min-w-0">
          <p className="font-serif text-base font-bold text-olive">今天没什么火烧眉毛的事</p>
          <p className="text-xs text-brown-300 mt-1">
            没有逾期、没有今天到期的款项、没有快截止的项目。可以专心做一份好东西。
          </p>
        </div>
      </div>
    );
  }

  // 主信息：用最严重的事情作 headline
  let headlineIcon = '☀️';
  let headlineText = '今天有几件事可以处理一下';
  let headlineColor = 'text-brown-700';
  if (digest.overdue.count > 0) {
    headlineIcon = '🔴';
    headlineColor = 'text-danger';
    if (digest.overdue.worstClient) {
      headlineText = `${digest.overdue.worstClient} 的款项已逾期 ${digest.overdue.worstDays} 天，建议优先处理`;
    } else {
      headlineText = `有 ${digest.overdue.count} 笔款项已逾期，合计 ${formatAmount(digest.overdue.amount)}`;
    }
  } else if (digest.today.count > 0) {
    headlineIcon = '⏰';
    headlineColor = 'text-danger';
    headlineText = `今天有 ${digest.today.count} 笔款项到期，合计 ${formatAmount(digest.today.amount)}`;
  } else if (digest.tomorrow.count > 0) {
    headlineIcon = '⏰';
    headlineColor = 'text-amber-700';
    headlineText = `明天有 ${digest.tomorrow.count} 笔款项到期，记得提前提醒一下`;
  } else if (digest.upcoming.count > 0) {
    headlineIcon = '💰';
    headlineColor = 'text-amber-700';
    headlineText = `近 3 天有 ${digest.upcoming.count} 笔款项到期`;
  } else if (digest.projectDeadline.count > 0) {
    headlineIcon = '📋';
    headlineColor = 'text-amber-700';
    headlineText = `有 ${digest.projectDeadline.count} 个项目本周内截止`;
  }

  return (
    <div className="bg-white border-[1.5px] border-cream-300 rounded-card p-5 sm:p-6">
      {/* Headline */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-xl shrink-0 mt-0.5">{headlineIcon}</span>
          <div className="min-w-0">
            <h2 className={`font-serif text-base sm:text-lg font-bold leading-snug ${headlineColor} truncate`}>
              {headlineText}
            </h2>
            <p className="text-xs text-brown-300 mt-1">
              共 {digest.totalAll} 件待处理 · {todayLabelBJ()}
            </p>
          </div>
        </div>
      </div>

      {/* 4-tile grid: 逾期 / 今日 / 明日 / 3 天内 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile
          icon="🔴"
          label="已逾期"
          count={digest.overdue.count}
          amount={digest.overdue.amount}
          link="/payments"
          severity="urgent"
          hint={
            digest.overdue.worstClient
              ? `${digest.overdue.worstClient} · ${digest.overdue.worstDays}天`
              : undefined
          }
        />
        <Tile
          icon="⏰"
          label="今日到期"
          count={digest.today.count}
          amount={digest.today.amount}
          link="/payments"
          severity="urgent"
        />
        <Tile
          icon="📅"
          label="明日到期"
          count={digest.tomorrow.count}
          amount={digest.tomorrow.amount}
          link="/payments"
          severity="warning"
        />
        <Tile
          icon="💰"
          label="3 天内到期"
          count={digest.upcoming.count}
          amount={digest.upcoming.amount}
          link="/payments"
          severity="warning"
        />
      </div>

      {/* 二级 chips：低频提醒 */}
      {(digest.projectDeadline.count > 0 ||
        digest.quoteExpiring.count > 0 ||
        digest.tax.count > 0) && (
        <div className="mt-4 pt-4 border-t border-cream-300 flex flex-wrap gap-2">
          {digest.projectDeadline.count > 0 && (
            <Link
              href="/projects"
              className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 text-xs font-medium transition-colors"
            >
              📋 {digest.projectDeadline.count} 个项目 5 天内截止
            </Link>
          )}
          {digest.quoteExpiring.count > 0 && (
            <Link
              href="/quotes"
              className="px-3 py-1.5 rounded-full bg-cream-50 border border-cream-300 text-brown-700 hover:bg-cream-100 text-xs font-medium transition-colors"
            >
              📜 {digest.quoteExpiring.count} 份报价快过期
            </Link>
          )}
          {digest.tax.count > 0 && (
            <Link
              href="/finance"
              className="px-3 py-1.5 rounded-full bg-olive-light border border-olive/20 text-olive hover:bg-olive-light/80 text-xs font-medium transition-colors"
            >
              📊 {digest.tax.count} 条税务提醒
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
