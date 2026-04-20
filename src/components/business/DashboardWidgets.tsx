'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/Badge';
import { formatAmount, formatDate } from '@/lib/utils';
import { toast } from '@/stores/toastStore';

// ── Summary Cards ──
interface SummaryCardProps {
  label: string;
  value: number;
  icon: string;
  color: string;
  bgColor: string;
  isCount?: boolean;
  extra?: string;
}

export function SummaryCard({ label, value, icon, color, bgColor, isCount, extra }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-5 hover:translate-y-[-3px] hover:shadow-[0_12px_32px_rgba(44,36,32,0.06)] hover:border-caramel/25 transition-all duration-250">
      <div className="flex items-center justify-between mb-3">
        <span className="text-brown-300 text-sm">{label}</span>
        <span className={`w-9 h-9 rounded-[12px] ${bgColor} flex items-center justify-center text-lg`}>
          {icon}
        </span>
      </div>
      <p className={`font-serif text-2xl font-bold ${color}`}>
        {isCount ? value : formatAmount(value)}
      </p>
      {extra && (
        <p className="text-danger text-xs mt-1 font-medium">{extra}</p>
      )}
    </div>
  );
}

// ── Recent Projects Widget ──
interface RecentProject {
  id: string;
  name: string;
  status: string;
  amount: number;
  paidAmount: number;
  client?: { id: string; name: string } | null;
}

export function RecentProjectsWidget({ projects }: { projects: RecentProject[] }) {
  return (
    <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-bold text-brown-800">最近项目</h2>
        <Link href="/projects" className="text-caramel text-sm hover:underline">
          查看全部
        </Link>
      </div>
      {projects.length === 0 ? (
        <div className="text-center py-8 text-brown-300 text-sm">
          暂无项目，去创建你的第一个项目吧
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="flex items-center justify-between p-3 rounded-[14px] hover:bg-cream-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-brown-800 group-hover:text-caramel transition-colors truncate">
                    {project.name}
                  </span>
                  <StatusBadge status={project.status} />
                </div>
                {project.client && (
                  <p className="text-xs text-brown-300 mt-0.5">{project.client.name}</p>
                )}
              </div>
              <div className="text-right ml-3">
                <p className="font-serif text-sm font-bold text-brown-800">
                  {formatAmount(project.amount)}
                </p>
                {project.amount > 0 && (
                  <p className="text-xs text-brown-300">
                    已收 {Math.round((project.paidAmount / project.amount) * 100)}%
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Upcoming Payments Widget ──
interface UpcomingPayment {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
}

export function UpcomingPaymentsWidget({ payments }: { payments: UpcomingPayment[] }) {
  return (
    <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-bold text-brown-800">即将到期收款</h2>
        <Link href="/payments" className="text-caramel text-sm hover:underline">
          查看全部
        </Link>
      </div>
      {payments.length === 0 ? (
        <div className="text-center py-8 text-brown-300 text-sm">
          近期无到期收款
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((node) => {
            const daysLeft = Math.ceil(
              (new Date(node.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            return (
              <div
                key={node.id}
                className={[
                  'flex items-center justify-between p-3 rounded-[14px]',
                  daysLeft <= 3 ? 'bg-[#FDF0EF]/50' : 'hover:bg-cream-50',
                  'transition-colors',
                ].join(' ')}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brown-800 truncate">
                      {node.name}
                    </span>
                    <StatusBadge status={node.status} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-brown-300 mt-0.5">
                    {node.project && <span>{node.project.name}</span>}
                    <span>· {formatDate(node.dueDate)}</span>
                  </div>
                </div>
                <div className="text-right ml-3">
                  <p className="font-serif text-sm font-bold text-brown-800">
                    {formatAmount(node.amount)}
                  </p>
                  <p className={`text-xs font-medium ${
                    daysLeft <= 3 ? 'text-danger' : daysLeft <= 7 ? 'text-amber' : 'text-brown-300'
                  }`}>
                    {daysLeft <= 0 ? '已到期' : `${daysLeft} 天后到期`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 小木经营洞察 Widget ──

interface InsightItem {
  priority: 'urgent' | 'warning' | 'tip' | 'achievement';
  dimension: string;
  icon: string;
  title: string;
  content: string;
  action: string;
}

interface ScoreDimensions {
  income: number;
  cost: number;
  cashflow: number;
  clientDiversity: number;
  pipeline: number;
  taxEfficiency: number;
}

interface DataSnapshot {
  monthIncome: number;
  monthExpense: number;
  lastMonthIncome: number;
  lastMonthExpense: number;
  profitRate: number;
  overdueCount: number;
  activeProjects: number;
  activeClients: number;
}

interface InsightData {
  healthScore: number;
  rulesHealthScore?: number;
  scoreDimensions: ScoreDimensions;
  insights: InsightItem[];
  taxAlerts?: string[];
  dataSnapshot?: DataSnapshot;
  mode?: 'rules' | 'full';
}

const DIMENSION_LABELS: Record<string, string> = {
  income: '收入',
  cost: '成本',
  cashflow: '现金流',
  clientDiversity: '客户多元',
  pipeline: '项目管线',
  taxEfficiency: '税务效率',
};

const PRIORITY_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  urgent:      { bg: 'bg-[#FDF0EF]', border: 'border-danger/20', text: 'text-danger' },
  warning:     { bg: 'bg-amber-bg',  border: 'border-amber/20',  text: 'text-amber' },
  tip:         { bg: 'bg-cream-50',   border: 'border-caramel/20', text: 'text-caramel' },
  achievement: { bg: 'bg-olive-light', border: 'border-olive/20', text: 'text-olive' },
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '紧急',
  warning: '注意',
  tip: '建议',
  achievement: '成就',
};

function ScoreRing({ score }: { score: number }) {
  const radius = 44;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 80 ? '#5B8C5A' : score >= 60 ? '#C47D3F' : '#E05A47';

  return (
    <div className="relative w-[108px] h-[108px] flex-shrink-0">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r={radius} fill="none" stroke="#E8E0D4" strokeWidth={stroke} />
        <circle
          cx="54" cy="54" r={radius} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform="rotate(-90 54 54)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-2xl font-bold text-brown-800">{score}</span>
        <span className="text-[10px] text-brown-300">健康指数</span>
      </div>
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-olive' : score >= 60 ? 'bg-caramel' : 'bg-danger';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-brown-500 w-14 text-right flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-cream-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-brown-300 w-7 text-right">{score}</span>
    </div>
  );
}

export function AIInsightWidget() {
  const [aiLoading, setAiLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [data, setData] = useState<InsightData | null>(null);

  // 页面加载时自动获取规则洞察（即时，无云端调用）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/ai-insight');
        const result = await res.json();
        if (!cancelled && result.success) {
          setData(result.data);
        }
      } catch {
        // 静默失败，用户仍可点击AI分析
      } finally {
        if (!cancelled) setRulesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // AI深度分析
  const generateAIInsight = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/dashboard/ai-insight', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      } else {
        toast.error(result.error || '小木洞察生成失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setAiLoading(false);
    }
  }, []);

  const isLoading = rulesLoading || aiLoading;
  const isRulesOnly = data?.mode === 'rules';

  return (
    <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-lg font-bold text-brown-800">经营洞察</h2>
          {data && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              isRulesOnly
                ? 'bg-cream-100 text-brown-500'
                : 'bg-caramel-bg text-caramel'
            }`}>
              {isRulesOnly ? '规则' : '小木'}
            </span>
          )}
        </div>
        <button
          onClick={generateAIInsight}
          disabled={isLoading}
          className="text-sm px-3 py-1.5 rounded-[10px] bg-caramel text-white hover:bg-caramel/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          {aiLoading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
              </svg>
              小木分析中...
            </>
          ) : data?.mode === 'full' ? '重新分析' : '小木深度分析'}
        </button>
      </div>

      {/* 初始加载 */}
      {rulesLoading && !data && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brown-300 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brown-300 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brown-300 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <p className="text-brown-300 text-sm">加载经营数据...</p>
        </div>
      )}

      {/* AI加载覆盖层 */}
      {aiLoading && data && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-[10px] bg-caramel-bg/50 text-sm text-caramel">
          <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
          </svg>
          AI 正在深度分析，预计 10-20 秒...
        </div>
      )}

      {/* 结果展示 */}
      {!rulesLoading && data && (() => {
        const snap = data.dataSnapshot;
        const hasData = snap && (
          snap.monthIncome > 0 || snap.monthExpense > 0 ||
          snap.lastMonthIncome > 0 || snap.lastMonthExpense > 0 ||
          snap.activeProjects > 0 || snap.overdueCount > 0
        );

        if (!hasData) {
          return (
            <div className="text-center py-10">
              <p className="text-3xl mb-3">📊</p>
              <p className="text-brown-300 text-sm">暂无足够数据生成洞察</p>
              <p className="text-brown-300/60 text-xs mt-1">开始记录项目和收支后，这里会自动显示经营分析</p>
            </div>
          );
        }

        return (
        <div className="space-y-5">
          {/* 健康指数 + 六维得分 */}
          <div className="flex items-start gap-6">
            <ScoreRing score={data.healthScore} />
            <div className="flex-1 space-y-2 pt-1">
              {Object.entries(data.scoreDimensions).map(([key, score]) => (
                <DimensionBar key={key} label={DIMENSION_LABELS[key] || key} score={score} />
              ))}
            </div>
          </div>

          {/* 数据快照 */}
          {data.dataSnapshot && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SnapshotItem
                label="本月收入"
                value={formatAmount(data.dataSnapshot.monthIncome)}
                change={data.dataSnapshot.lastMonthIncome > 0
                  ? Math.round(((data.dataSnapshot.monthIncome - data.dataSnapshot.lastMonthIncome) / data.dataSnapshot.lastMonthIncome) * 100)
                  : undefined}
              />
              <SnapshotItem
                label="本月支出"
                value={formatAmount(data.dataSnapshot.monthExpense)}
                change={data.dataSnapshot.lastMonthExpense > 0
                  ? Math.round(((data.dataSnapshot.monthExpense - data.dataSnapshot.lastMonthExpense) / data.dataSnapshot.lastMonthExpense) * 100)
                  : undefined}
              />
              <SnapshotItem label="利润率" value={`${data.dataSnapshot.profitRate}%`} />
              <SnapshotItem
                label="进行中"
                value={`${data.dataSnapshot.activeProjects} 项目`}
                alert={data.dataSnapshot.overdueCount > 0 ? `${data.dataSnapshot.overdueCount} 笔逾期` : undefined}
              />
            </div>
          )}

          {/* 税务预警 */}
          {data.taxAlerts && data.taxAlerts.length > 0 && (
            <div className="bg-[#FDF0EF] border border-danger/20 rounded-[12px] px-4 py-3">
              <p className="text-xs font-bold text-danger mb-1">税务预警</p>
              {data.taxAlerts.map((alert, i) => (
                <p key={i} className="text-xs text-danger/80">{alert}</p>
              ))}
            </div>
          )}

          {/* 洞察卡片 */}
          <div className="space-y-2.5">
            {data.insights.map((insight, i) => {
              const style = PRIORITY_STYLES[insight.priority] || PRIORITY_STYLES.tip;
              return (
                <div
                  key={i}
                  className={`${style.bg} border ${style.border} rounded-[14px] p-4`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg flex-shrink-0 mt-0.5">{insight.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-brown-800">{insight.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${style.bg} ${style.text} font-medium border ${style.border}`}>
                          {PRIORITY_LABELS[insight.priority] || insight.priority}
                        </span>
                      </div>
                      <p className="text-sm text-brown-500 leading-relaxed">{insight.content}</p>
                      {insight.action && (
                        <p className="text-xs text-caramel mt-1.5 font-medium flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          {insight.action}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 规则模式提示 */}
          {isRulesOnly && !aiLoading && (
            <p className="text-center text-xs text-brown-300">
              以上为规则引擎即时分析，点击「AI 深度分析」获取更详细的经营建议
            </p>
          )}
        </div>
        );
      })()}

      {/* 规则加载失败的空状态 */}
      {!rulesLoading && !data && (
        <div className="text-center py-10">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-brown-300 text-sm">暂无足够数据生成洞察</p>
          <p className="text-brown-300/60 text-xs mt-1">开始记录项目和收支后，这里会自动显示经营分析</p>
        </div>
      )}
    </div>
  );
}

// ── 数据快照小卡片 ──
function SnapshotItem({ label, value, change, alert }: {
  label: string;
  value: string;
  change?: number;
  alert?: string;
}) {
  return (
    <div className="bg-cream-50 rounded-[10px] p-2.5 text-center">
      <p className="text-[10px] text-brown-300 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-brown-800 font-serif">{value}</p>
      {change !== undefined && (
        <p className={`text-[10px] font-medium ${change >= 0 ? 'text-olive' : 'text-danger'}`}>
          {change >= 0 ? '+' : ''}{change}%
        </p>
      )}
      {alert && (
        <p className="text-[10px] font-medium text-danger">{alert}</p>
      )}
    </div>
  );
}
