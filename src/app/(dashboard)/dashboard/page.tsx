'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { SummaryCard, RecentProjectsWidget, UpcomingPaymentsWidget, AIInsightWidget } from '@/components/business/DashboardWidgets';
import OnboardingWizard from '@/components/business/OnboardingWizard';
import TodayDigest from '@/components/business/TodayDigest';
import { formatAmount } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { SkeletonDashboard } from '@/components/ui/Skeleton';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import useSWR from 'swr';

// 懒加载 Recharts — 仅在图表可见时才加载 (~200KB gzipped)
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const Legend = dynamic(() => import('recharts').then(m => m.Legend), { ssr: false });

// 注：原 ProactiveAlerts 列表已被 TodayDigest hero 卡片替代
// （详细列表仍可通过头部铃铛 → 通知抽屉查看）

export default function DashboardPage() {
  const { data, isLoading, isValidating } = useSWR('/api/dashboard');

  // 仅首次加载（无缓存）时显示骨架屏，有缓存时直接渲染
  if (isLoading && !data) return <SkeletonDashboard />;

  const dashboard = data?.data;
  if (!dashboard) {
    return (
      <div className="text-center py-16 text-brown-300">
        <p className="text-4xl mb-4">📊</p>
        <p>加载仪表盘数据失败</p>
      </div>
    );
  }

  const { summary, recentProjects, upcomingPayments, monthlyTrend } = dashboard;

  const summaryCards = [
    {
      label: '本月收入',
      value: summary.totalIncome,
      icon: '💰',
      color: 'text-olive',
      bgColor: 'bg-olive-light',
    },
    {
      label: '本月支出',
      value: summary.totalExpense,
      icon: '💸',
      color: 'text-danger',
      bgColor: 'bg-[#FDF0EF]',
    },
    {
      label: '本月利润',
      value: summary.profit,
      icon: '📈',
      color: summary.profit >= 0 ? 'text-olive' : 'text-danger',
      bgColor: summary.profit >= 0 ? 'bg-olive-light' : 'bg-[#FDF0EF]',
    },
    {
      label: '进行中项目',
      value: summary.activeProjects,
      icon: '🚀',
      isCount: true,
      color: 'text-caramel',
      bgColor: 'bg-caramel-bg',
    },
    {
      label: '待收款',
      value: summary.pendingPaymentAmount,
      icon: '⏳',
      color: 'text-amber',
      bgColor: 'bg-amber-bg',
      extra: summary.overduePayments > 0
        ? `${summary.overduePayments} 笔逾期`
        : undefined,
    },
  ];

  return (
    <div className={`space-y-6 ${isValidating ? 'opacity-[0.97] transition-opacity duration-300' : ''}`}>
      {/* 新用户引导向导 */}
      <OnboardingWizard />

      {/* 今日要事 hero 卡片（原 ProactiveAlerts 列表升级版：分类汇总 + 总数 + 空状态） */}
      <ErrorBoundary fallback="今日要事暂时加载不出来">
        <TodayDigest />
      </ErrorBoundary>

      {/* 数据卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {summaryCards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>

      {/* 项目与收款 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentProjectsWidget projects={recentProjects} />
        <UpcomingPaymentsWidget payments={upcomingPayments} />
      </div>

      {/* 小木经营洞察 — AI 接口可能 timeout/失败，单独包错误边界 */}
      <ErrorBoundary fallback="经营洞察暂时无法加载">
        <AIInsightWidget />
      </ErrorBoundary>

      {/* 收支趋势图 — 懒加载 + 错误边界（recharts 偶发渲染异常不应拖垮整页） */}
      <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
        <h2 className="font-serif text-lg font-bold text-brown-800 mb-4">收支趋势</h2>
        {monthlyTrend && monthlyTrend.length > 0 ? (
          <ErrorBoundary fallback={<div className="text-center py-12 text-brown-300 text-sm">趋势图加载失败</div>}>
          <Suspense fallback={<Skeleton className="h-[300px] w-full rounded-[14px]" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8E0D4" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#B5AA9E', fontSize: 12 }}
                  axisLine={{ stroke: '#E8E0D4' }}
                />
                <YAxis
                  tick={{ fill: '#B5AA9E', fontSize: 12 }}
                  axisLine={{ stroke: '#E8E0D4' }}
                  tickFormatter={(v: number) => v >= 10000 ? `${(v / 10000).toFixed(0)}万` : v.toLocaleString()}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1.5px solid #E8E0D4',
                    boxShadow: '0 4px 16px rgba(44,36,32,0.08)',
                  }}
                  formatter={(value) => [formatAmount(Number(value || 0))]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', color: '#7A6E62' }}
                />
                <Bar
                  dataKey="income"
                  name="收入"
                  fill="#5B8C5A"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="expense"
                  name="支出"
                  fill="#C47D3F"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="text-center py-12 text-brown-300 text-sm">暂无趋势数据</div>
        )}
      </div>
    </div>
  );
}
