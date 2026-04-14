'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatAmount } from '@/lib/utils';
import { toast } from '@/stores/toastStore';

const PAYMENT_METHODS = [
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'bank_transfer', label: '银行转账' },
  { value: 'cash', label: '现金' },
  { value: 'other', label: '其他' },
];

interface ParsedResult {
  type: string;
  amount: number;
  category: string;
  subcategory: string;
  description: string;
  date: string;
  paymentMethod: string;
  isBusiness: boolean;
  confidence: number;
}

export default function AIFinancePage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [saving, setSaving] = useState(false);

  // 编辑解析结果
  const [editForm, setEditForm] = useState<ParsedResult | null>(null);

  const handleParse = async () => {
    if (!input.trim()) {
      toast.error('请输入记账内容');
      return;
    }

    setLoading(true);
    setParsed(null);
    setEditForm(null);

    try {
      const res = await fetch('/api/transactions/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      });
      const result = await res.json();
      if (result.success) {
        const p = result.data.parsed;
        setParsed(p);
        setEditForm({ ...p });
        toast.success('小木解析完成');
      } else {
        toast.error(result.error || '解析失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editForm) return;
    setSaving(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          aiClassified: true,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('记账成功');
        setInput('');
        setParsed(null);
        setEditForm(null);
      } else {
        toast.error(result.error || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/finance')}
          className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-brown-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brown-800">小木智能记账</h2>
      </div>

      {/* AI 提示 */}
      <div className="bg-caramel-bg border border-dashed border-caramel/30 rounded-card p-5">
        <p className="text-caramel font-semibold text-sm mb-2">小木记账助手</p>
        <p className="text-brown-500 text-sm leading-relaxed">
          用自然语言描述你的收支，小木会自动解析金额、分类、日期等信息。确认后一键保存。
        </p>
      </div>

      {/* 输入区域 */}
      <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-brown-800 mb-1.5">描述你的收支</label>
          <textarea
            className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[100px] resize-y"
            placeholder="例如：&#10;· 今天打车去客户那边花了35块&#10;· 收到张总设计尾款8000元&#10;· 买了一个显示器2499，京东白条"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={handleParse} loading={loading}>
            {loading ? '小木解析中...' : '小木解析'}
          </Button>
        </div>
      </div>

      {/* 解析结果 */}
      {parsed && editForm && (
        <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-brown-800 text-sm">解析结果</h4>
            <span className="text-xs text-brown-300">
              置信度 {Math.round(parsed.confidence * 100)}%
            </span>
          </div>

          {/* 收支类型 */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditForm(f => f ? { ...f, type: 'expense' } : f)}
              className={[
                'flex-1 py-2 rounded-button text-sm font-medium transition-all',
                editForm.type === 'expense'
                  ? 'bg-danger/10 text-danger border-[1.5px] border-danger/30'
                  : 'bg-cream-50 text-brown-300 border-[1.5px] border-cream-300',
              ].join(' ')}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => setEditForm(f => f ? { ...f, type: 'income' } : f)}
              className={[
                'flex-1 py-2 rounded-button text-sm font-medium transition-all',
                editForm.type === 'income'
                  ? 'bg-olive-light text-olive border-[1.5px] border-olive/30'
                  : 'bg-cream-50 text-brown-300 border-[1.5px] border-cream-300',
              ].join(' ')}
            >
              收入
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="金额"
              type="number"
              value={editForm.amount}
              onChange={(e) => setEditForm(f => f ? { ...f, amount: parseFloat(e.target.value) || 0 } : f)}
            />
            <Input
              label="分类"
              value={editForm.category}
              onChange={(e) => setEditForm(f => f ? { ...f, category: e.target.value } : f)}
            />
            <Input
              label="日期"
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm(f => f ? { ...f, date: e.target.value } : f)}
            />
            <Select
              label="支付方式"
              options={PAYMENT_METHODS}
              value={editForm.paymentMethod}
              onChange={(e) => setEditForm(f => f ? { ...f, paymentMethod: e.target.value } : f)}
            />
          </div>

          <Input
            label="描述"
            value={editForm.description}
            onChange={(e) => setEditForm(f => f ? { ...f, description: e.target.value } : f)}
          />

          {/* 预览 */}
          <div className="bg-cream-50 rounded-[14px] p-4 flex items-center justify-between">
            <div>
              <p className="text-brown-800 text-sm font-medium">{editForm.description || editForm.category}</p>
              <p className="text-brown-300 text-xs mt-0.5">{editForm.category} · {editForm.date}</p>
            </div>
            <span className={`font-serif text-xl font-bold ${
              editForm.type === 'income' ? 'text-olive' : 'text-danger'
            }`}>
              {editForm.type === 'income' ? '+' : '-'}{formatAmount(editForm.amount)}
            </span>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setParsed(null); setEditForm(null); }}>
              取消
            </Button>
            <Button onClick={handleSave} loading={saving}>
              确认保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
