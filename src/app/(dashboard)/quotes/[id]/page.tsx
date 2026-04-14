'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuote } from '@/hooks/useQuotes';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import QuoteForm from '@/components/business/QuoteForm';
import { formatAmount, formatDate } from '@/lib/utils';
import { toast } from '@/stores/toastStore';
import type { QuotePDFData } from '@/components/business/QuotePDF';

// @react-pdf/renderer 仅客户端可用，禁用 SSR
const QuotePDFDownload = dynamic(
  () => import('@/components/business/QuotePDFDownload'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-4 text-brown-300 text-sm">
        <div className="h-5 w-5 rounded-full animate-spin border-2 border-caramel/25 border-t-caramel mr-2" />
        正在加载 PDF 组件...
      </div>
    ),
  }
);

const QUOTE_STATUS_ACTIONS: Record<string, { label: string; next: string; variant: 'primary' | 'secondary' | 'danger' }[]> = {
  draft: [
    { label: '标记为已发送', next: 'sent', variant: 'primary' },
  ],
  sent: [
    { label: '客户已接受', next: 'accepted', variant: 'primary' },
    { label: '客户已拒绝', next: 'rejected', variant: 'danger' },
  ],
  accepted: [],
  rejected: [],
  expired: [],
};

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id as string;
  const { quote, isLoading, mutate } = useQuote(quoteId);
  const [showEdit, setShowEdit] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfData, setPdfData] = useState<QuotePDFData | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // 获取 PDF 数据
  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pdf`);
      const result = await res.json();
      if (result.success) {
        setPdfData(result.data);
      } else {
        toast.error(result.error || '获取报价数据失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setPdfLoading(false);
    }
  };

  // 标记为已发送（快捷操作）
  const handleSendToClient = async () => {
    // 先导出 PDF 让用户下载，再自动切换状态为 sent
    if (!pdfData) {
      await handleExportPDF();
    }
    if (quote.status === 'draft') {
      await handleStatusChange('sent');
    }
    toast.success('报价单已标记为发送，请将下载的 PDF 发送给客户');
  };

  // AI调整相关状态
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustInstruction, setAdjustInstruction] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adjustResult, setAdjustResult] = useState<{
    data: { adjustmentSummary: string; items: { name: string; quantity: number; unit: string; unitPrice: number; amount: number }[]; finalTotal: number };
    previousTotal: number;
    newTotal: number;
    savings: number;
  } | null>(null);

  const handleAIAdjust = async () => {
    if (!adjustInstruction.trim()) {
      toast.error('请输入调整指令');
      return;
    }
    setAdjustLoading(true);
    setAdjustResult(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/ai-adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: adjustInstruction }),
      });
      const result = await res.json();
      if (result.success) {
        setAdjustResult(result.data);
      } else {
        toast.error(result.error || '小木调整失败，请重试');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleApplyAdjust = async () => {
    if (!adjustResult) return;
    const data = adjustResult.data;
    setAdjustLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.adjustmentSummary ? quote.title : data.items?.[0]?.name,
          items: data.items.map((i: { name: string; description?: string; quantity: number; unit: string; unitPrice: number; amount: number }) => ({
            name: i.name,
            description: i.description || '',
            quantity: i.quantity,
            unit: i.unit,
            unitPrice: i.unitPrice,
            amount: i.amount,
          })),
          subtotal: data.finalTotal,
          total: data.finalTotal,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('报价已更新');
        mutate();
        setShowAdjust(false);
        setAdjustResult(null);
        setAdjustInstruction('');
      } else {
        toast.error(result.error || '更新失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('状态已更新');
        mutate();
      } else {
        toast.error(result.error || '操作失败');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/quotes/${quoteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      toast.success('报价单已更新');
      mutate();
      setShowEdit(false);
    } else {
      toast.error(result.error || '更新失败');
    }
  };

  if (isLoading) return <Loading />;
  if (!quote) {
    return (
      <div className="text-center py-16 text-brown-300">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-lg mb-2">报价单不存在</p>
        <Button variant="secondary" onClick={() => router.push('/quotes')}>
          返回列表
        </Button>
      </div>
    );
  }

  const statusActions = QUOTE_STATUS_ACTIONS[quote.status] || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/quotes')}
            className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-brown-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-brown-300 text-xs font-mono">{quote.quoteNumber}</span>
              <StatusBadge status={quote.status} />
              {quote.aiGenerated && (
                <span className="text-[10px] bg-caramel-bg text-caramel px-1.5 py-0.5 rounded-full">小木生成</span>
              )}
            </div>
            <h2 className="font-serif text-xl font-bold text-brown-800">{quote.title}</h2>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowAdjust(true)}>
            小木调整
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportPDF} loading={pdfLoading}>
            导出 PDF
          </Button>
          {quote.status === 'draft' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
                编辑
              </Button>
              <Button size="sm" onClick={handleSendToClient}>
                发送给客户
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 报价信息 */}
      <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
          {quote.client && (
            <div>
              <p className="text-brown-300 text-xs mb-1">客户</p>
              <p className="text-brown-800 font-medium">{quote.client.name}</p>
            </div>
          )}
          {quote.project && (
            <div>
              <p className="text-brown-300 text-xs mb-1">关联项目</p>
              <p className="text-brown-800 font-medium">{quote.project.name}</p>
            </div>
          )}
          <div>
            <p className="text-brown-300 text-xs mb-1">创建日期</p>
            <p className="text-brown-800 font-medium">{formatDate(quote.createdAt)}</p>
          </div>
          {quote.validUntil && (
            <div>
              <p className="text-brown-300 text-xs mb-1">有效期至</p>
              <p className="text-brown-800 font-medium">{formatDate(quote.validUntil)}</p>
            </div>
          )}
        </div>

        {/* 报价明细表 */}
        <div className="mb-6">
          <h4 className="font-semibold text-brown-800 text-sm mb-3">报价明细</h4>
          <div className="border border-cream-300 rounded-[14px] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50">
                  <th className="text-left py-3 px-4 text-brown-500 font-medium">服务项</th>
                  <th className="text-center py-3 px-3 text-brown-500 font-medium w-16">数量</th>
                  <th className="text-center py-3 px-3 text-brown-500 font-medium w-16">单位</th>
                  <th className="text-right py-3 px-3 text-brown-500 font-medium w-24">单价</th>
                  <th className="text-right py-3 px-4 text-brown-500 font-medium w-24">金额</th>
                </tr>
              </thead>
              <tbody>
                {quote.items?.map((item: { name: string; description?: string; quantity: number; unit: string; unitPrice: number; amount: number }, idx: number) => (
                  <tr key={idx} className="border-t border-cream-200">
                    <td className="py-3 px-4">
                      <p className="text-brown-800 font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-brown-300 text-xs mt-0.5">{item.description}</p>
                      )}
                    </td>
                    <td className="text-center py-3 px-3 text-brown-800">{item.quantity}</td>
                    <td className="text-center py-3 px-3 text-brown-300">{item.unit}</td>
                    <td className="text-right py-3 px-3 font-serif text-brown-800">¥{item.unitPrice.toLocaleString()}</td>
                    <td className="text-right py-3 px-4 font-serif font-bold text-brown-800">¥{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 金额汇总 */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-brown-500">
              <span>小计</span>
              <span className="font-serif">¥{quote.subtotal?.toLocaleString()}</span>
            </div>
            {quote.taxAmount > 0 && (
              <div className="flex justify-between text-brown-500">
                <span>税额 ({quote.taxRate}%)</span>
                <span className="font-serif">¥{quote.taxAmount.toLocaleString()}</span>
              </div>
            )}
            {quote.discount > 0 && (
              <div className="flex justify-between text-olive">
                <span>折扣</span>
                <span className="font-serif">-¥{quote.discount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-cream-300 text-brown-800 font-bold">
              <span>合计</span>
              <span className="font-serif text-xl">{formatAmount(quote.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 付款条款 & 备注 */}
      {(quote.paymentTerms || quote.notes) && (
        <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6 space-y-4">
          {quote.paymentTerms && (
            <div>
              <p className="text-brown-300 text-xs mb-1">付款条款</p>
              <p className="text-brown-800 text-sm leading-relaxed whitespace-pre-wrap">{quote.paymentTerms}</p>
            </div>
          )}
          {quote.notes && (
            <div>
              <p className="text-brown-300 text-xs mb-1">备注</p>
              <p className="text-brown-500 text-sm leading-relaxed whitespace-pre-wrap">{quote.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      {statusActions.length > 0 && (
        <div className="flex gap-3">
          {statusActions.map((action) => (
            <Button
              key={action.next}
              variant={action.variant}
              loading={actionLoading}
              onClick={() => handleStatusChange(action.next)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {/* 编辑 Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="编辑报价单" size="lg">
        <QuoteForm
          initialData={{
            clientId: quote.clientId,
            projectId: quote.projectId,
            title: quote.title,
            items: quote.items,
            paymentTerms: quote.paymentTerms,
            validUntil: quote.validUntil ? quote.validUntil.split('T')[0] : '',
            notes: quote.notes,
            taxRate: quote.taxRate,
            discount: quote.discount,
          }}
          onSubmit={handleUpdate}
          onCancel={() => setShowEdit(false)}
          submitLabel="保存修改"
        />
      </Modal>

      {/* 小木调整 Modal */}
      <Modal isOpen={showAdjust} onClose={() => { setShowAdjust(false); setAdjustResult(null); }} title="小木智能调整报价" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-brown-500">
            告诉小木你的调整需求，小木会自动帮你重新分配项目和价格。
          </p>

          {/* 快捷指令 */}
          <div className="flex flex-wrap gap-2">
            {[
              '客户预算只有1.5万，帮我砍到1.5万以内',
              '客户砍价20%，帮我调整',
              '客户要追加一个小程序开发',
              '去掉非核心项，保留最小可交付范围',
            ].map((hint) => (
              <button
                key={hint}
                onClick={() => setAdjustInstruction(hint)}
                className="text-xs px-3 py-1.5 rounded-full bg-cream-100 text-brown-500 hover:bg-caramel-bg hover:text-caramel transition-colors"
              >
                {hint}
              </button>
            ))}
          </div>

          {/* 输入框 */}
          <div className="relative">
            <textarea
              value={adjustInstruction}
              onChange={(e) => setAdjustInstruction(e.target.value)}
              placeholder="例如：客户预算只有1.2万，帮我在保留核心设计的前提下砍到1.2万以内"
              rows={3}
              className="w-full px-4 py-3 border-[1.5px] border-cream-300 rounded-[14px] text-sm text-brown-800 placeholder:text-brown-200 focus:outline-none focus:border-caramel/50 resize-none"
            />
          </div>

          <Button onClick={handleAIAdjust} loading={adjustLoading} disabled={!adjustInstruction.trim()}>
            小木生成调整方案
          </Button>

          {/* 调整结果预览 */}
          {adjustResult && (
            <div className="space-y-3 pt-2 border-t border-cream-200">
              {/* 调整概要 */}
              {adjustResult.data.adjustmentSummary && (
                <div className="bg-olive-light rounded-[14px] p-4">
                  <p className="text-sm font-medium text-olive mb-1">调整概要</p>
                  <p className="text-sm text-brown-800">{adjustResult.data.adjustmentSummary}</p>
                </div>
              )}

              {/* 价格变化 */}
              <div className="flex items-center gap-4 text-sm">
                <span className="text-brown-300">原价：<span className="font-serif text-brown-500 line-through">{formatAmount(adjustResult.previousTotal)}</span></span>
                <span className="text-brown-800 font-bold">→</span>
                <span className="text-olive font-bold">新价：<span className="font-serif">{formatAmount(adjustResult.newTotal)}</span></span>
                {adjustResult.savings > 0 && (
                  <span className="text-xs bg-olive-light text-olive px-2 py-0.5 rounded-full">节省 {formatAmount(adjustResult.savings)}</span>
                )}
              </div>

              {/* 新报价明细 */}
              <div className="border border-cream-300 rounded-[14px] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-cream-50">
                      <th className="text-left py-2 px-3 text-brown-500 font-medium">服务项</th>
                      <th className="text-center py-2 px-2 text-brown-500 font-medium w-14">数量</th>
                      <th className="text-right py-2 px-2 text-brown-500 font-medium w-20">单价</th>
                      <th className="text-right py-2 px-3 text-brown-500 font-medium w-20">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustResult.data.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-cream-200">
                        <td className="py-2 px-3 text-brown-800">{item.name}</td>
                        <td className="text-center py-2 px-2 text-brown-800">{item.quantity}{item.unit}</td>
                        <td className="text-right py-2 px-2 font-serif text-brown-800">¥{item.unitPrice.toLocaleString()}</td>
                        <td className="text-right py-2 px-3 font-serif font-bold text-brown-800">¥{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setAdjustResult(null)}>
                  重新调整
                </Button>
                <Button onClick={handleApplyAdjust} loading={adjustLoading}>
                  应用此方案
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* PDF 下载 Modal */}
      <Modal isOpen={!!pdfData} onClose={() => setPdfData(null)} title="导出报价单 PDF" size="sm">
        <div className="space-y-4 text-center">
          <p className="text-sm text-brown-500">报价单已准备就绪，点击下方按钮下载 PDF 文件。</p>
          {pdfData && <QuotePDFDownload data={pdfData} />}
        </div>
      </Modal>
    </div>
  );
}
