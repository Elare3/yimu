'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuotes } from '@/hooks/useQuotes';
import { useProjects } from '@/hooks/useProjects';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/Badge';
import { formatAmount, formatDate } from '@/lib/utils';
import { toast } from '@/stores/toastStore';

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'sent', label: '已发送' },
  { value: 'accepted', label: '已接受' },
  { value: 'rejected', label: '已拒绝' },
];

interface QuoteItem {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  total: number;
  createdAt: string;
  validUntil?: string | null;
  aiGenerated: boolean;
  client?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
}

export default function QuotesPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('');
  const { quotes, total, isLoading, mutate } = useQuotes(statusFilter || undefined);
  const { projects } = useProjects();

  // 关联项目 Modal
  const [linkingQuote, setLinkingQuote] = useState<QuoteItem | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);

  // 删除确认 Modal
  const [deletingQuote, setDeletingQuote] = useState<QuoteItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!deletingQuote) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/quotes/${deletingQuote.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success('报价单已删除');
        mutate();
        setDeletingQuote(null);
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLinkProject = async () => {
    if (!linkingQuote || !selectedProjectId) return;
    setLinkLoading(true);
    try {
      const res = await fetch(`/api/quotes/${linkingQuote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('已关联到项目');
        mutate();
        setLinkingQuote(null);
        setSelectedProjectId('');
      } else {
        toast.error(result.error || '关联失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setLinkLoading(false);
    }
  };

  const projectOptions = projects.map((p: { id: string; name: string }) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div className="space-y-6">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* 状态标签页 */}
        <div className="flex gap-1 bg-cream-100 rounded-button p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={[
                'px-4 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200',
                statusFilter === tab.value
                  ? 'bg-white text-brown-800 shadow-sm'
                  : 'text-brown-300 hover:text-brown-500',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push('/quotes/ai')}>
            小木报价
          </Button>
          <Button onClick={() => router.push('/quotes/new')}>
            手动创建
          </Button>
        </div>
      </div>

      {isLoading && quotes.length === 0 && <Loading />}

      {!isLoading && quotes.length === 0 && (
        <div className="text-center py-16 text-brown-300">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-lg mb-2">还没有报价单</p>
          <p className="text-sm mb-6">使用小木快速生成专业报价，或手动创建</p>
          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={() => router.push('/quotes/ai')}>
              小木智能报价
            </Button>
            <Button onClick={() => router.push('/quotes/new')}>
              手动创建
            </Button>
          </div>
        </div>
      )}

      {!isLoading && quotes.length > 0 && (
        <>
          <p className="text-brown-300 text-sm">共 {total} 份报价单</p>
          <div className="space-y-3">
            {quotes.map((quote: QuoteItem) => (
              <div
                key={quote.id}
                className="bg-white rounded-card border-[1.5px] border-cream-300 p-5 hover:border-caramel/25 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  {/* 左侧信息 — 可点击跳转详情 */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => router.push(`/quotes/${quote.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-brown-300 text-xs font-mono">{quote.quoteNumber}</span>
                      <StatusBadge status={quote.status} />
                      {quote.aiGenerated && (
                        <span className="text-[10px] bg-caramel-bg text-caramel px-1.5 py-0.5 rounded-full">小木</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-brown-800 truncate">{quote.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-brown-300 mt-1">
                      {quote.client && <span>{quote.client.name}</span>}
                      {quote.project && <span>· {quote.project.name}</span>}
                      <span>· {formatDate(quote.createdAt)}</span>
                    </div>
                  </div>

                  {/* 右侧金额 + 操作按钮 */}
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-right">
                      <p className="font-serif text-xl font-bold text-brown-800">
                        {formatAmount(quote.total)}
                      </p>
                      {quote.validUntil && (
                        <p className="text-xs text-brown-300 mt-1">
                          有效期至 {formatDate(quote.validUntil)}
                        </p>
                      )}
                    </div>

                    {/* 操作按钮组 */}
                    <div className="flex items-center gap-1">
                      {/* 关联项目按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLinkingQuote(quote);
                          setSelectedProjectId(quote.project?.id || '');
                        }}
                        className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-caramel transition-colors"
                        title={quote.project ? '更换关联项目' : '关联到项目'}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </button>

                      {/* 删除按钮 */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingQuote(quote);
                        }}
                        className="p-2 rounded-lg hover:bg-danger-light text-brown-300 hover:text-danger transition-colors"
                        title="删除报价单"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 关联项目 Modal */}
      <Modal
        isOpen={!!linkingQuote}
        onClose={() => { setLinkingQuote(null); setSelectedProjectId(''); }}
        title={linkingQuote?.project ? '更换关联项目' : '关联到项目'}
      >
        {linkingQuote && (
          <div className="space-y-4">
            <p className="text-sm text-brown-500">
              将报价单 <span className="font-semibold text-brown-800">{linkingQuote.title}</span> 关联到项目
            </p>

            {linkingQuote.project && (
              <div className="flex items-center gap-2 px-3 py-2 bg-cream-50 rounded-[10px]">
                <span className="text-xs text-brown-300">当前项目：</span>
                <span className="text-sm text-brown-800 font-medium">{linkingQuote.project.name}</span>
              </div>
            )}

            <Select
              label="选择项目"
              options={projectOptions}
              placeholder="请选择要关联的项目"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-2">
              {linkingQuote.project && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    setLinkLoading(true);
                    try {
                      const res = await fetch(`/api/quotes/${linkingQuote.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projectId: null }),
                      });
                      const result = await res.json();
                      if (result.success) {
                        toast.success('已取消关联');
                        mutate();
                        setLinkingQuote(null);
                        setSelectedProjectId('');
                      } else {
                        toast.error(result.error || '操作失败');
                      }
                    } catch {
                      toast.error('网络错误，请稍后重试');
                    } finally {
                      setLinkLoading(false);
                    }
                  }}
                  loading={linkLoading}
                >
                  取消关联
                </Button>
              )}
              <Button variant="secondary" onClick={() => { setLinkingQuote(null); setSelectedProjectId(''); }}>
                取消
              </Button>
              <Button
                onClick={handleLinkProject}
                loading={linkLoading}
                disabled={!selectedProjectId}
              >
                确认关联
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 删除确认 Modal */}
      <Modal
        isOpen={!!deletingQuote}
        onClose={() => setDeletingQuote(null)}
        title="删除报价单"
        size="sm"
      >
        {deletingQuote && (
          <div className="space-y-4">
            <p className="text-sm text-brown-500">
              确定要删除报价单 <span className="font-semibold text-brown-800">{deletingQuote.title}</span>（{deletingQuote.quoteNumber}）吗？
            </p>
            <p className="text-xs text-danger">此操作不可撤销</p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setDeletingQuote(null)}>
                取消
              </Button>
              <Button variant="danger" onClick={handleDelete} loading={deleteLoading}>
                确认删除
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
