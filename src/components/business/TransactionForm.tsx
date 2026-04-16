'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

const INCOME_CATEGORIES = [
  { value: '项目收入', label: '项目收入' },
  { value: '咨询服务', label: '咨询服务' },
  { value: '被动收入', label: '被动收入' },
  { value: '其他收入', label: '其他收入' },
];

const EXPENSE_CATEGORIES = [
  { value: '云服务', label: '云服务' },
  { value: 'AI服务', label: 'AI服务' },
  { value: '软件订阅', label: '软件订阅' },
  { value: '营销推广', label: '营销推广' },
  { value: '办公费用', label: '办公费用' },
  { value: '外包费用', label: '外包费用' },
  { value: '税费', label: '税费' },
  { value: '生活开支', label: '生活开支' },
  { value: '其他支出', label: '其他支出' },
];

const PAYMENT_METHODS = [
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'bank_transfer', label: '银行转账' },
  { value: 'cash', label: '现金' },
  { value: 'other', label: '其他' },
];

interface TransactionFormProps {
  onSubmit: (data: {
    type: 'income' | 'expense';
    amount: string;
    category: string;
    description: string;
    date: string;
    paymentMethod: string;
    projectId?: string;
  }) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export default function TransactionForm({ onSubmit, onCancel, loading }: TransactionFormProps) {
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [form, setForm] = useState({
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'wechat',
    projectId: '',
  });

  const { data: projectsData } = useSWR('/api/projects?pageSize=100');
  const projectOptions = (projectsData?.data?.items || []).map((p: { id: string; name: string }) => ({
    value: p.id,
    label: p.name,
  }));

  const categories = formType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { projectId, ...rest } = form;
    onSubmit({ ...rest, type: formType, ...(projectId ? { projectId } : {}) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Income/Expense toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFormType('expense')}
          className={[
            'flex-1 py-2.5 rounded-button text-sm font-medium transition-all duration-200',
            formType === 'expense'
              ? 'bg-danger/10 text-danger border-[1.5px] border-danger/30'
              : 'bg-cream-50 text-brown-300 border-[1.5px] border-cream-300',
          ].join(' ')}
        >
          支出
        </button>
        <button
          type="button"
          onClick={() => setFormType('income')}
          className={[
            'flex-1 py-2.5 rounded-button text-sm font-medium transition-all duration-200',
            formType === 'income'
              ? 'bg-olive-light text-olive border-[1.5px] border-olive/30'
              : 'bg-cream-50 text-brown-300 border-[1.5px] border-cream-300',
          ].join(' ')}
        >
          收入
        </button>
      </div>

      <Input
        label="金额 *"
        type="number"
        placeholder="0.00"
        value={form.amount}
        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        required
      />
      <Select
        label="分类 *"
        options={categories}
        placeholder="请选择分类"
        value={form.category}
        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        required
      />
      <Input
        label="描述"
        placeholder="简要说明"
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="日期"
          type="date"
          value={form.date}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
        />
        <Select
          label="支付方式"
          options={PAYMENT_METHODS}
          value={form.paymentMethod}
          onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
        />
      </div>
      <Select
        label="关联项目"
        options={[{ value: '', label: '不关联项目' }, ...projectOptions]}
        value={form.projectId}
        onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" loading={loading}>
          保存
        </Button>
      </div>
    </form>
  );
}
