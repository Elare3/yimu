'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useClient } from '@/hooks/useClients';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import ClientForm from '@/components/business/ClientForm';
import { formatAmount, formatDate, STATUS_LABELS } from '@/lib/utils';
import { toast } from '@/stores/toastStore';

type Tab = 'overview' | 'projects' | 'quotes' | 'finance';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: '概览', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'projects', label: '项目', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { id: 'quotes', label: '报价', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
  { id: 'finance', label: '收支', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;
  const { client, isLoading, mutate } = useClient(clientId);
  const [showEdit, setShowEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const handleUpdate = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      toast.success('客户更新成功');
      mutate();
      setShowEdit(false);
    } else {
      toast.error(result.error || '更新失败');
    }
  };

  if (isLoading) return <Loading />;
  if (!client) {
    return (
      <div className="text-center py-16 text-brown-300">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-lg mb-2">客户不存在</p>
        <Button variant="secondary" onClick={() => router.push('/clients')}>
          返回客户列表
        </Button>
      </div>
    );
  }

  const stats = client.stats || {};
  const initial = client.name?.charAt(0) || '客';

  return (
    <div className="space-y-6">
      {/* ═══ 顶部返回栏 ═══ */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/clients')}
          className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-brown-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brown-800 flex-1 truncate">{client.name}</h2>
        <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
          编辑
        </Button>
      </div>

      {/* ═══ 个人名片 ═══ */}
      <div className="relative bg-white rounded-card border-[1.5px] border-cream-300 overflow-hidden">
        <div className="absolute inset-0 h-24" style={{ background: 'linear-gradient(135deg, #C47D3F10 0%, #D4940E08 50%, #5B8C5A06 100%)' }} />
        <div className="relative px-6 pt-6 pb-5">
          <div className="flex items-start gap-5">
            {/* 头像 */}
            <div
              className="w-16 h-16 rounded-[16px] ring-4 ring-white shadow-sm flex items-center justify-center text-white text-xl font-bold font-serif shrink-0"
              style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
            >
              {initial}
            </div>

            {/* 信息 */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2.5 mb-1">
                <h3 className="font-serif text-lg font-bold text-brown-800 truncate">{client.name}</h3>
                {client.tags?.length > 0 && client.tags.slice(0, 2).map((tag: string) => (
                  <span key={tag} className="bg-caramel-bg text-caramel text-[10px] px-2 py-0.5 rounded-full font-medium">{tag}</span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-brown-400">
                {client.contactPerson && <span>{client.contactPerson}</span>}
                {client.phone && <span>{client.phone}</span>}
                {client.email && <span>{client.email}</span>}
                {client.wechat && <span>微信: {client.wechat}</span>}
              </div>
            </div>
          </div>

          {/* 统计卡片行 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <StatMini label="累计收入" value={formatAmount(stats.totalIncome || 0)} color="text-olive" />
            <StatMini label="累计利润" value={formatAmount(stats.profit || 0)} color={stats.profit >= 0 ? 'text-olive' : 'text-danger'} />
            <StatMini label="回款率" value={`${stats.paymentRate || 0}%`} color="text-caramel" />
            <StatMini label="报价转化" value={`${stats.quoteConversionRate || 0}%`} color="text-amber" />
          </div>
        </div>
      </div>

      {/* ═══ Tab 导航 ═══ */}
      <div className="flex gap-1 bg-cream-100 rounded-button p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] text-sm font-medium transition-all duration-200',
              activeTab === tab.id
                ? 'bg-white text-brown-800 shadow-sm'
                : 'text-brown-300 hover:text-brown-500',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.id === 'projects' && client._count?.projects > 0 && (
              <span className="text-[10px] bg-cream-200 text-brown-500 px-1.5 py-0.5 rounded-full">{client._count.projects}</span>
            )}
            {tab.id === 'quotes' && client._count?.quotes > 0 && (
              <span className="text-[10px] bg-cream-200 text-brown-500 px-1.5 py-0.5 rounded-full">{client._count.quotes}</span>
            )}
            {tab.id === 'finance' && client._count?.transactions > 0 && (
              <span className="text-[10px] bg-cream-200 text-brown-500 px-1.5 py-0.5 rounded-full">{client._count.transactions}</span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ Tab 内容 ═══ */}
      <div className="page-enter">
        {activeTab === 'overview' && <OverviewTab client={client} router={router} />}
        {activeTab === 'projects' && <ProjectsTab projects={client.projects} router={router} />}
        {activeTab === 'quotes' && <QuotesTab quotes={client.quotes} router={router} />}
        {activeTab === 'finance' && <FinanceTab transactions={client.transactions} paymentNodes={client.paymentNodes} stats={stats} router={router} />}
      </div>

      {/* 编辑客户 Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="编辑客户" size="lg">
        <ClientForm
          clientId={clientId}
          onSubmit={handleUpdate}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  );
}

/* ── 小型统计块 ── */
function StatMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-cream-50/80 rounded-[12px] px-3 py-2.5">
      <p className="text-brown-300 text-[11px] mb-0.5">{label}</p>
      <p className={`font-serif text-base font-bold ${color}`}>{value}</p>
    </div>
  );
}

/* ── 概览 Tab ── */
function OverviewTab({ client, router }: { client: Record<string, unknown>; router: ReturnType<typeof useRouter> }) {
  const projects = (client.projects || []) as { id: string; name: string; status: string; totalAmount: number; updatedAt: string }[];
  const quotes = (client.quotes || []) as { id: string; title: string; total: number; status: string; createdAt: string }[];
  const paymentNodes = (client.paymentNodes || []) as { id: string; name: string; amount: number; dueDate: string; status: string; project?: { id: string; name: string } }[];
  const pendingPayments = paymentNodes.filter(p => p.status !== 'paid').slice(0, 3);

  return (
    <div className="space-y-5">
      {/* 备注 */}
      {!!client.notes && (
        <div className="bg-cream-50 rounded-card border border-cream-200 px-5 py-4">
          <p className="text-brown-500 text-sm whitespace-pre-wrap">{String(client.notes)}</p>
        </div>
      )}

      {/* 快速信息行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 最近项目 */}
        <SectionCard title="最近项目" count={projects.length} actionLabel="查看全部" onAction={() => router.push(`#projects`)}>
          {projects.length === 0 ? (
            <EmptyHint text="暂无项目" />
          ) : (
            <div className="space-y-1">
              {projects.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => router.push(`/projects/${p.id}`)}
                  className="flex items-center justify-between px-3 py-2.5 rounded-[10px] hover:bg-cream-50 transition-colors cursor-pointer group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brown-800 truncate group-hover:text-caramel transition-colors">{p.name}</p>
                    <p className="text-[11px] text-brown-300 mt-0.5">{STATUS_LABELS[p.status] || p.status}</p>
                  </div>
                  {p.totalAmount > 0 && (
                    <span className="font-serif text-sm font-bold text-brown-800 shrink-0 ml-3">{formatAmount(p.totalAmount)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* 待收款 */}
        <SectionCard title="待收款" count={pendingPayments.length}>
          {pendingPayments.length === 0 ? (
            <EmptyHint text="无待收款项" />
          ) : (
            <div className="space-y-1">
              {pendingPayments.map((p) => {
                const isOverdue = new Date(p.dueDate) < new Date();
                return (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-[10px] bg-cream-50/50">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-brown-800 truncate">{p.name}</p>
                      <p className="text-[11px] text-brown-300 mt-0.5">
                        {p.project?.name && `${p.project.name} · `}
                        {formatDate(p.dueDate)}
                        {isOverdue && <span className="text-danger ml-1 font-medium">已逾期</span>}
                      </p>
                    </div>
                    <span className={`font-serif text-sm font-bold shrink-0 ml-3 ${isOverdue ? 'text-danger' : 'text-brown-800'}`}>
                      {formatAmount(p.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 最近报价 */}
      {quotes.length > 0 && (
        <SectionCard title="最近报价" count={quotes.length}>
          <div className="space-y-1">
            {quotes.slice(0, 3).map((q) => (
              <div
                key={q.id}
                onClick={() => router.push(`/quotes/${q.id}`)}
                className="flex items-center justify-between px-3 py-2.5 rounded-[10px] hover:bg-cream-50 transition-colors cursor-pointer group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brown-800 truncate group-hover:text-caramel transition-colors">{q.title}</p>
                  <p className="text-[11px] text-brown-300 mt-0.5">{formatDate(q.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  <span className="font-serif text-sm font-bold text-brown-800">{formatAmount(q.total)}</span>
                  <StatusBadge status={q.status} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 详细联系方式 */}
      {!!(client.address || client.source) && (
        <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-5">
          <h4 className="font-serif text-sm font-bold text-brown-800 mb-3">其他信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {!!client.source && (
              <div>
                <span className="text-brown-300">来源：</span>
                <span className="text-brown-600">{String(client.source)}</span>
              </div>
            )}
            {!!client.address && (
              <div>
                <span className="text-brown-300">地址：</span>
                <span className="text-brown-600">{String(client.address)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 项目 Tab ── */
function ProjectsTab({ projects, router }: { projects: { id: string; name: string; status: string; priority: string; totalAmount: number; paidAmount: number; deadline?: string | null; updatedAt: string }[]; router: ReturnType<typeof useRouter> }) {
  if (!projects?.length) {
    return <EmptyState icon="📋" title="暂无项目" desc="为该客户创建第一个项目" />;
  }

  return (
    <div className="space-y-3">
      {projects.map((p) => {
        const payPercent = p.totalAmount > 0 ? Math.round((p.paidAmount / p.totalAmount) * 100) : 0;
        return (
          <div
            key={p.id}
            onClick={() => router.push(`/projects/${p.id}`)}
            className="bg-white rounded-card border-[1.5px] border-cream-300 p-5 cursor-pointer hover:translate-y-[-2px] hover:shadow-[0_12px_32px_rgba(44,36,32,0.06)] hover:border-caramel/25 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <h4 className="font-semibold text-brown-800 truncate">{p.name}</h4>
                <StatusBadge status={p.status} />
                {p.priority === 'high' && <span className="text-danger text-xs font-medium">紧急</span>}
              </div>
              {p.totalAmount > 0 && (
                <span className="font-serif text-lg font-bold text-brown-800 shrink-0 ml-4">{formatAmount(p.totalAmount)}</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-brown-300">
              {p.deadline && <span>截止 {formatDate(p.deadline)}</span>}
              {p.totalAmount > 0 && <span>已收 {payPercent}%</span>}
              <span>更新于 {formatDate(p.updatedAt)}</span>
            </div>
            {p.totalAmount > 0 && (
              <div className="mt-3 h-1.5 bg-cream-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-caramel to-caramel-light transition-[width] duration-500"
                  style={{ width: `${payPercent}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 报价 Tab ── */
function QuotesTab({ quotes, router }: { quotes: { id: string; title: string; total: number; status: string; createdAt: string }[]; router: ReturnType<typeof useRouter> }) {
  if (!quotes?.length) {
    return <EmptyState icon="📝" title="暂无报价" desc="为该客户创建第一份报价单" />;
  }

  return (
    <div className="space-y-3">
      {quotes.map((q) => (
        <div
          key={q.id}
          onClick={() => router.push(`/quotes/${q.id}`)}
          className="bg-white rounded-card border-[1.5px] border-cream-300 p-5 cursor-pointer hover:translate-y-[-2px] hover:shadow-[0_12px_32px_rgba(44,36,32,0.06)] hover:border-caramel/25 transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 mb-1">
                <h4 className="font-semibold text-brown-800 truncate">{q.title}</h4>
                <StatusBadge status={q.status} />
              </div>
              <p className="text-xs text-brown-300">{formatDate(q.createdAt)}</p>
            </div>
            <span className="font-serif text-lg font-bold text-brown-800 shrink-0 ml-4">{formatAmount(q.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 收支 Tab ── */
function FinanceTab({ transactions, paymentNodes, stats, router }: {
  transactions: { id: string; description: string; amount: number; type: string; date: string; category: string }[];
  paymentNodes: { id: string; name: string; amount: number; dueDate: string; status: string; paidAt?: string; project?: { id: string; name: string } }[];
  stats: Record<string, unknown>;
  router: ReturnType<typeof useRouter>;
}) {
  const hasData = (transactions?.length > 0) || (paymentNodes?.length > 0);
  if (!hasData) {
    return <EmptyState icon="💰" title="暂无收支记录" desc="该客户还没有相关的交易记录" />;
  }

  return (
    <div className="space-y-5">
      {/* 收支统计 */}
      <div className="grid grid-cols-3 gap-3">
        <StatMini label="累计收入" value={formatAmount((stats.totalIncome as number) || 0)} color="text-olive" />
        <StatMini label="累计支出" value={formatAmount((stats.totalExpense as number) || 0)} color="text-danger" />
        <StatMini label="净利润" value={formatAmount((stats.profit as number) || 0)} color={(stats.profit as number) >= 0 ? 'text-olive' : 'text-danger'} />
      </div>

      {/* 收款节点 */}
      {paymentNodes?.length > 0 && (
        <SectionCard title="收款节点" count={paymentNodes.length}>
          <div className="space-y-1">
            {paymentNodes.map((p) => {
              const isOverdue = p.status !== 'paid' && new Date(p.dueDate) < new Date();
              const isPaid = p.status === 'paid';
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] ${isPaid ? 'bg-olive-light/30' : isOverdue ? 'bg-red-50/50' : 'bg-cream-50/50'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-brown-800 truncate">{p.name}</p>
                    <p className="text-[11px] text-brown-300 mt-0.5">
                      {p.project?.name && (
                        <span
                          className="hover:text-caramel cursor-pointer transition-colors"
                          onClick={() => router.push(`/projects/${p.project!.id}`)}
                        >
                          {p.project.name}
                        </span>
                      )}
                      {p.project?.name && ' · '}
                      {formatDate(p.dueDate)}
                      {isOverdue && <span className="text-danger ml-1 font-medium">已逾期</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 ml-3">
                    <span className={`font-serif text-sm font-bold ${isPaid ? 'text-olive' : isOverdue ? 'text-danger' : 'text-brown-800'}`}>
                      {formatAmount(p.amount)}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* 交易流水 */}
      {transactions?.length > 0 && (
        <SectionCard title="交易记录" count={transactions.length}>
          <div className="space-y-1">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded-[10px] hover:bg-cream-50/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-brown-800 truncate">{t.description || t.category || '交易'}</p>
                  <p className="text-[11px] text-brown-300 mt-0.5">{formatDate(t.date)}</p>
                </div>
                <span className={`font-serif text-sm font-bold shrink-0 ml-3 ${t.type === 'income' ? 'text-olive' : 'text-danger'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatAmount(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ── 通用区块卡片 ── */
function SectionCard({ title, count, actionLabel, onAction, children }: {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-serif text-sm font-bold text-brown-800">{title}</h4>
          {count !== undefined && count > 0 && (
            <span className="text-[10px] bg-cream-100 text-brown-400 px-1.5 py-0.5 rounded-full">{count}</span>
          )}
        </div>
        {actionLabel && onAction && (
          <button onClick={onAction} className="text-xs text-caramel hover:text-caramel-dark transition-colors">
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── 空状态 ── */
function EmptyHint({ text }: { text: string }) {
  return <p className="text-center py-6 text-brown-300 text-sm">{text}</p>;
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="text-center py-16 text-brown-300">
      <p className="text-4xl mb-4">{icon}</p>
      <p className="text-lg mb-1">{title}</p>
      <p className="text-sm">{desc}</p>
    </div>
  );
}
