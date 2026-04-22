'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTransactions, useSummary } from '@/hooks/useTransactions';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import TransactionForm from '@/components/business/TransactionForm';
import { formatAmount, formatDate } from '@/lib/utils';
import { toast } from '@/stores/toastStore';
import useSWR from 'swr';

const TYPE_TABS = [
  { value: '', label: '全部' },
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
];

const VIEW_TABS = [
  { value: 'list', label: '明细' },
  { value: 'project', label: '按项目' },
  { value: 'week', label: '按周' },
];

export default function FinancePage() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'project' | 'week'>('list');
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const { transactions, isLoading, mutate: listMutate } = useTransactions(typeFilter || undefined, month || undefined);
  const { summary, isLoading: summaryLoading, mutate: summaryMutate } = useSummary(month || undefined);

  // 按项目视图数据
  const { data: projectData, isLoading: projectLoading } = useSWR(
    viewMode === 'project' ? `/api/transactions/by-project?month=${month}` : null
  );
  const projectGroups = projectData?.data?.projects || [];

  // 按周视图数据
  const { data: weekData, isLoading: weekLoading } = useSWR(
    viewMode === 'week' ? `/api/transactions/by-week?month=${month}` : null
  );
  const weekGroups = weekData?.data?.weeks || [];

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  const handleManualCreate = async (data: {
    type: 'income' | 'expense';
    amount: string;
    category: string;
    description: string;
    date: string;
    paymentMethod: string;
    projectId?: string;
  }) => {
    if (!data.amount || !data.category) {
      toast.error('请填写金额和分类');
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('记账成功');
        setShowForm(false);
        listMutate();
        summaryMutate();
      } else {
        toast.error(result.error || '记账失败');
      }
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 月度汇总卡片 */}
      {!summaryLoading && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-4">
            <p className="text-brown-300 text-xs mb-1">总收入</p>
            <p className="font-serif text-xl font-bold text-caramel">{formatAmount(summary.allTimeIncome || 0)}</p>
          </div>
          <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-4">
            <p className="text-brown-300 text-xs mb-1">本月收入</p>
            <p className="font-serif text-xl font-bold text-olive">{formatAmount(summary.totalIncome || 0)}</p>
          </div>
          <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-4">
            <p className="text-brown-300 text-xs mb-1">本月支出</p>
            <p className="font-serif text-xl font-bold text-danger">{formatAmount(summary.totalExpense || 0)}</p>
          </div>
          <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-4">
            <p className="text-brown-300 text-xs mb-1">本月利润</p>
            <p className={`font-serif text-xl font-bold ${(summary.profit || 0) >= 0 ? 'text-olive' : 'text-danger'}`}>
              {formatAmount(summary.profit || 0)}
            </p>
          </div>
          <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-4">
            <p className="text-brown-300 text-xs mb-1">记录笔数</p>
            <p className="font-serif text-xl font-bold text-brown-800">{summary.transactionCount || 0}</p>
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 视图切换 */}
          <div className="flex gap-1 bg-cream-100 rounded-button p-1 overflow-x-auto no-scrollbar">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setViewMode(tab.value as 'list' | 'project' | 'week')}
                className={[
                  'px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0',
                  viewMode === tab.value
                    ? 'bg-white text-brown-800 shadow-sm'
                    : 'text-brown-300 hover:text-brown-500',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* 类型标签（仅明细视图） */}
          {viewMode === 'list' && (
            <div className="flex gap-1 bg-cream-100 rounded-button p-1 overflow-x-auto no-scrollbar">
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setTypeFilter(tab.value)}
                  className={[
                    'px-4 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0',
                    typeFilter === tab.value
                      ? 'bg-white text-brown-800 shadow-sm'
                      : 'text-brown-300 hover:text-brown-500',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          {/* 月份选择 */}
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push('/finance/ai')}>
            小木记账
          </Button>
          <Button onClick={() => setShowForm(true)}>
            + 手动记账
          </Button>
        </div>
      </div>

      {/* ===== 明细视图 ===== */}
      {viewMode === 'list' && (
        <>
          {isLoading && transactions.length === 0 && <Loading />}

          {!isLoading && transactions.length === 0 && (
            <div className="text-center py-16 text-brown-300">
              <p className="text-4xl mb-4">💰</p>
              <p className="text-lg mb-2">本月暂无记录</p>
              <p className="text-sm mb-6">用小木语音记账，或手动添加收支</p>
              <div className="flex gap-3 justify-center">
                <Button variant="secondary" onClick={() => router.push('/finance/ai')}>
                  小木智能记账
                </Button>
                <Button onClick={() => setShowForm(true)}>
                  手动记账
                </Button>
              </div>
            </div>
          )}

          {!isLoading && transactions.length > 0 && (
            <div className="space-y-2">
              {transactions.map((t: {
                id: string;
                type: string;
                amount: number;
                category: string;
                description: string;
                date: string;
                paymentMethod: string;
                project?: { name: string } | null;
                client?: { name: string } | null;
                aiClassified?: boolean;
              }) => (
                <div key={t.id} className="bg-white rounded-card border-[1.5px] border-cream-300 p-4 hover:border-caramel/25 transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                        t.type === 'income' ? 'bg-olive-light text-olive' : 'bg-danger-light text-danger'
                      }`}>
                        {t.type === 'income' ? '↓' : '↑'}
                      </span>
                      <div>
                        <p className="text-brown-800 text-sm font-medium">{t.description || t.category}</p>
                        <div className="flex items-center gap-2 text-xs text-brown-300 mt-0.5">
                          <span>{t.category}</span>
                          <span>·</span>
                          <span>{formatDate(t.date)}</span>
                          {t.project && <><span>·</span><span>{t.project.name}</span></>}
                          {t.aiClassified && <span className="text-caramel">小木</span>}
                        </div>
                      </div>
                    </div>
                    <span className={`font-serif text-lg font-bold ${
                      t.type === 'income' ? 'text-olive' : 'text-danger'
                    }`}>
                      {t.type === 'income' ? '+' : '-'}{formatAmount(t.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== 按项目视图 ===== */}
      {viewMode === 'project' && (
        <>
          {projectLoading && projectGroups.length === 0 && <Loading />}

          {!projectLoading && projectGroups.length === 0 && (
            <div className="text-center py-16 text-brown-300">
              <p className="text-4xl mb-4">📂</p>
              <p className="text-lg mb-2">本月暂无项目关联的收支</p>
              <p className="text-sm">记账时关联项目，即可查看每个项目的投入产出比</p>
            </div>
          )}

          {!projectLoading && projectGroups.length > 0 && (
            <div className="space-y-3">
              {projectGroups.map((pg: {
                projectId: string | null;
                projectName: string;
                projectStatus: string;
                projectBudget: number;
                income: number;
                expense: number;
                profit: number;
                transactionCount: number;
                transactions: { type: string; amount: number; category: string; description: string; date: string }[];
              }) => {
                const roi = pg.expense > 0 ? ((pg.income - pg.expense) / pg.expense * 100).toFixed(0) : '-';
                const pgKey = pg.projectId || 'unlinked';
                const isExpanded = expandedProject === pgKey;
                return (
                  <div
                    key={pgKey}
                    className="bg-white rounded-card border-[1.5px] border-cream-300 p-5 hover:border-caramel/25 transition-all duration-200 cursor-pointer"
                    onClick={() => setExpandedProject(isExpanded ? null : pgKey)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-4 h-4 text-brown-300 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <h3 className="font-semibold text-brown-800">{pg.projectName}</h3>
                        {pg.projectStatus && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cream-100 text-brown-300">
                            {pg.projectStatus}
                          </span>
                        )}
                        <span className="text-xs text-brown-300">{pg.transactionCount} 笔</span>
                      </div>
                      {pg.projectBudget > 0 && (
                        <span className="text-xs text-brown-300">预算 {formatAmount(pg.projectBudget)}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div>
                        <p className="text-xs text-brown-300 mb-0.5">收入</p>
                        <p className="font-serif font-bold text-olive">{formatAmount(pg.income)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-brown-300 mb-0.5">支出</p>
                        <p className="font-serif font-bold text-danger">{formatAmount(pg.expense)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-brown-300 mb-0.5">利润</p>
                        <p className={`font-serif font-bold ${pg.profit >= 0 ? 'text-olive' : 'text-danger'}`}>
                          {formatAmount(pg.profit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-brown-300 mb-0.5">投产比</p>
                        <p className="font-serif font-bold text-brown-800">{roi === '-' ? '-' : `${roi}%`}</p>
                      </div>
                    </div>
                    {/* 利润率进度条 */}
                    {pg.income > 0 && (
                      <div className="mt-3">
                        <div className="h-2 bg-cream-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pg.profit >= 0 ? 'bg-olive' : 'bg-danger'}`}
                            style={{ width: `${Math.min(Math.max((pg.profit / pg.income) * 100, 0), 100)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-brown-300 mt-1">
                          利润率 {pg.income > 0 ? ((pg.profit / pg.income) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    )}
                    {/* 展开的交易明细 */}
                    {isExpanded && pg.transactions.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-cream-200 space-y-2">
                        {pg.transactions.map((t, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                t.type === 'income' ? 'bg-olive-light text-olive' : 'bg-danger-light text-danger'
                              }`}>
                                {t.type === 'income' ? '↓' : '↑'}
                              </span>
                              <div>
                                <p className="text-brown-800 text-sm">{t.description || t.category}</p>
                                <p className="text-xs text-brown-300">{t.category} · {formatDate(t.date)}</p>
                              </div>
                            </div>
                            <span className={`font-serif text-sm font-bold ${
                              t.type === 'income' ? 'text-olive' : 'text-danger'
                            }`}>
                              {t.type === 'income' ? '+' : '-'}{formatAmount(t.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ===== 按周视图 ===== */}
      {viewMode === 'week' && (
        <>
          {weekLoading && weekGroups.length === 0 && <Loading />}

          {!weekLoading && weekGroups.length === 0 && (
            <div className="text-center py-16 text-brown-300">
              <p className="text-4xl mb-4">📅</p>
              <p className="text-lg mb-2">暂无周数据</p>
              <p className="text-sm">有记账记录后，这里会展示每周的现金流波动</p>
            </div>
          )}

          {!weekLoading && weekGroups.length > 0 && (
            <div className="space-y-3">
              {weekGroups.map((wg: {
                weekLabel: string;
                weekStart: string;
                income: number;
                expense: number;
                profit: number;
                transactionCount: number;
                transactions: { type: string; amount: number; category: string; description: string; date: string }[];
              }) => {
                const maxAmount = Math.max(
                  ...weekGroups.map((w: { income: number; expense: number }) => Math.max(w.income, w.expense)),
                  1
                );
                const isExpanded = expandedWeek === wg.weekStart;
                return (
                  <div
                    key={wg.weekStart}
                    className="bg-white rounded-card border-[1.5px] border-cream-300 p-4 hover:border-caramel/25 transition-all duration-200 cursor-pointer"
                    onClick={() => setExpandedWeek(isExpanded ? null : wg.weekStart)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-4 h-4 text-brown-300 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="text-sm font-medium text-brown-800">{wg.weekLabel}</span>
                        <span className="text-xs text-brown-300">{wg.transactionCount} 笔</span>
                      </div>
                      <span className={`font-serif text-lg font-bold ${wg.profit >= 0 ? 'text-olive' : 'text-danger'}`}>
                        {wg.profit >= 0 ? '+' : ''}{formatAmount(wg.profit)}
                      </span>
                    </div>
                    {/* 收入/支出对比条 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-brown-300 w-8">收入</span>
                        <div className="flex-1 h-3 bg-cream-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-olive rounded-full transition-all"
                            style={{ width: `${(wg.income / maxAmount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-serif text-olive w-20 text-right">{formatAmount(wg.income)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-brown-300 w-8">支出</span>
                        <div className="flex-1 h-3 bg-cream-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#C47D3F] rounded-full transition-all"
                            style={{ width: `${(wg.expense / maxAmount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-serif text-danger w-20 text-right">{formatAmount(wg.expense)}</span>
                      </div>
                    </div>
                    {/* 展开的交易明细 */}
                    {isExpanded && wg.transactions.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-cream-200 space-y-2">
                        {wg.transactions.map((t, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                t.type === 'income' ? 'bg-olive-light text-olive' : 'bg-danger-light text-danger'
                              }`}>
                                {t.type === 'income' ? '↓' : '↑'}
                              </span>
                              <div>
                                <p className="text-brown-800 text-sm">{t.description || t.category}</p>
                                <p className="text-xs text-brown-300">{t.category} · {formatDate(t.date)}</p>
                              </div>
                            </div>
                            <span className={`font-serif text-sm font-bold ${
                              t.type === 'income' ? 'text-olive' : 'text-danger'
                            }`}>
                              {t.type === 'income' ? '+' : '-'}{formatAmount(t.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 手动记账 Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="手动记账">
        <TransactionForm
          onSubmit={handleManualCreate}
          onCancel={() => setShowForm(false)}
          loading={formLoading}
        />
      </Modal>
    </div>
  );
}
