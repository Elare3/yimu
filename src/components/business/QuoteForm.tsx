'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useClients } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';

interface QuoteItem {
  name: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

interface QuoteFormProps {
  initialData?: {
    clientId?: string;
    projectId?: string;
    title?: string;
    items?: QuoteItem[];
    paymentTerms?: string;
    validUntil?: string;
    notes?: string;
    taxRate?: number;
    discount?: number;
  };
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const UNIT_OPTIONS = [
  { value: '项', label: '项' },
  { value: '天', label: '天' },
  { value: '小时', label: '小时' },
  { value: '页', label: '页' },
  { value: '套', label: '套' },
  { value: '次', label: '次' },
];

const emptyItem: QuoteItem = { name: '', description: '', quantity: 1, unit: '项', unitPrice: 0, amount: 0 };

export default function QuoteForm({ initialData, onSubmit, onCancel, submitLabel = '创建报价' }: QuoteFormProps) {
  const [loading, setLoading] = useState(false);
  const { clients } = useClients();
  const [clientId, setClientId] = useState(initialData?.clientId || '');
  const { projects } = useProjects(undefined, clientId || undefined);
  const [form, setForm] = useState({
    projectId: initialData?.projectId || '',
    title: initialData?.title || '',
    paymentTerms: initialData?.paymentTerms || '',
    validUntil: initialData?.validUntil || '',
    notes: initialData?.notes || '',
    taxRate: initialData?.taxRate?.toString() || '0',
    discount: initialData?.discount?.toString() || '0',
  });
  const [items, setItems] = useState<QuoteItem[]>(
    initialData?.items?.length ? initialData.items : [{ ...emptyItem }]
  );

  const updateItem = (index: number, field: string, value: string | number) => {
    setItems(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: value };
      item.amount = (item.quantity || 1) * (item.unitPrice || 0);
      next[index] = item;
      return next;
    });
  };

  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = subtotal * (parseFloat(form.taxRate) || 0) / 100;
  const discountAmount = parseFloat(form.discount) || 0;
  const total = subtotal + taxAmount - discountAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        clientId,
        projectId: form.projectId || null,
        title: form.title,
        items,
        paymentTerms: form.paymentTerms,
        validUntil: form.validUntil || null,
        notes: form.notes,
        taxRate: parseFloat(form.taxRate) || 0,
        discount: discountAmount,
      });
    } finally {
      setLoading(false);
    }
  };

  const clientOptions = clients.map((c: { id: string; name: string }) => ({
    value: c.id,
    label: c.name,
  }));

  const projectOptions = [
    { value: '', label: '不关联项目' },
    ...projects.map((p: { id: string; name: string }) => ({
      value: p.id,
      label: p.name,
    })),
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 基本信息 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="客户 *"
          options={clientOptions}
          placeholder="请选择客户"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        />
        <Select
          label="关联项目"
          options={projectOptions}
          value={form.projectId}
          onChange={(e) => setForm(f => ({ ...f, projectId: e.target.value }))}
        />
        <Input
          label="报价标题 *"
          placeholder="例如：品牌VI设计报价"
          value={form.title}
          onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
          required
        />
        <Input
          label="有效期至"
          type="date"
          value={form.validUntil}
          onChange={(e) => setForm(f => ({ ...f, validUntil: e.target.value }))}
        />
      </div>

      {/* 报价明细 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-brown-800 text-sm">报价明细</h4>
          <Button type="button" variant="ghost" size="sm" onClick={addItem}>
            + 添加项
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="bg-cream-50 rounded-[14px] p-4">
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-12 md:col-span-4">
                  <Input
                    label={idx === 0 ? '服务项' : undefined}
                    placeholder="服务项名称"
                    value={item.name}
                    onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    required
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    label={idx === 0 ? '数量' : undefined}
                    type="number"
                    placeholder="1"
                    value={item.quantity || ''}
                    onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Select
                    label={idx === 0 ? '单位' : undefined}
                    options={UNIT_OPTIONS}
                    value={item.unit}
                    onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                  />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <Input
                    label={idx === 0 ? '单价' : undefined}
                    type="number"
                    placeholder="0"
                    value={item.unitPrice || ''}
                    onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="col-span-10 md:col-span-1 flex items-center">
                  <span className="font-serif font-bold text-brown-800 text-sm">
                    ¥{item.amount.toLocaleString()}
                  </span>
                </div>
                <div className="col-span-2 md:col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="p-1.5 rounded-lg text-brown-300 hover:text-danger hover:bg-danger/5 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {/* 描述 */}
              <Input
                placeholder="服务项描述（可选）"
                value={item.description}
                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                className="mt-2"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 金额汇总 */}
      <div className="bg-cream-50 rounded-[14px] p-4">
        <div className="grid grid-cols-2 gap-4 mb-3">
          <Input
            label="税率 (%)"
            type="number"
            value={form.taxRate}
            onChange={(e) => setForm(f => ({ ...f, taxRate: e.target.value }))}
          />
          <Input
            label="折扣 (¥)"
            type="number"
            value={form.discount}
            onChange={(e) => setForm(f => ({ ...f, discount: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-brown-500">
            <span>小计</span>
            <span className="font-serif">¥{subtotal.toLocaleString()}</span>
          </div>
          {taxAmount > 0 && (
            <div className="flex justify-between text-brown-500">
              <span>税额 ({form.taxRate}%)</span>
              <span className="font-serif">¥{taxAmount.toLocaleString()}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex justify-between text-olive">
              <span>折扣</span>
              <span className="font-serif">-¥{discountAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-cream-300 text-brown-800 font-bold">
            <span>合计</span>
            <span className="font-serif text-lg">¥{total.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 付款条款 & 备注 */}
      <div>
        <label className="block text-sm font-medium text-brown-800 mb-1.5">付款条款</label>
        <textarea
          className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[60px] resize-y"
          placeholder="如：预付50%，验收后支付剩余50%"
          value={form.paymentTerms}
          onChange={(e) => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-brown-800 mb-1.5">备注</label>
        <textarea
          className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[60px] resize-y"
          placeholder="其他说明..."
          value={form.notes}
          onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
