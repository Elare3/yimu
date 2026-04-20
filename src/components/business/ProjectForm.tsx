'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { useClients } from '@/hooks/useClients';

interface ProjectFormProps {
  projectId?: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: '普通' },
  { value: 'medium', label: '中等' },
  { value: 'high', label: '紧急' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: '请选择' },
  { value: 'design', label: '设计' },
  { value: 'development', label: '开发' },
  { value: 'consulting', label: '咨询' },
  { value: 'content', label: '内容创作' },
  { value: 'marketing', label: '营销推广' },
  { value: 'photography', label: '摄影摄像' },
  { value: 'translation', label: '翻译' },
  { value: 'other', label: '其他' },
];

export default function ProjectForm({ projectId, onSubmit, onCancel }: ProjectFormProps) {
  const [loading, setLoading] = useState(false);
  const { clients } = useClients();
  const [form, setForm] = useState({
    clientId: '',
    name: '',
    description: '',
    priority: 'medium',
    category: '',
    manager: '',
    totalAmount: '',
    startDate: '',
    deadline: '',
    revisionLimit: '',
    tags: '',
    notes: '',
  });

  // 编辑模式：获取项目数据
  useEffect(() => {
    if (projectId) {
      fetch(`/api/projects/${projectId}`)
        .then((res) => res.json())
        .then((result) => {
          if (result.success && result.data) {
            const p = result.data;
            setForm({
              clientId: p.clientId || '',
              name: p.name || '',
              description: p.description || '',
              priority: p.priority || 'medium',
              category: p.category || '',
              manager: p.manager || '',
              totalAmount: p.totalAmount ? String(p.totalAmount) : '',
              startDate: p.startDate ? p.startDate.split('T')[0] : '',
              deadline: p.deadline ? p.deadline.split('T')[0] : '',
              revisionLimit: p.revisionLimit ? String(p.revisionLimit) : '',
              tags: (p.tags || []).join(', '),
              notes: p.notes || '',
            });
          }
        });
    }
  }, [projectId]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        ...form,
        tags: form.tags
          ? form.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean)
          : [],
      });
    } finally {
      setLoading(false);
    }
  };

  const clientOptions = clients.map((c: { id: string; name: string }) => ({
    value: c.id,
    label: c.name,
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="项目名称 *"
          placeholder="例如：品牌VI升级"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          required
        />
        <Select
          label="关联客户 *"
          options={clientOptions}
          placeholder="请选择客户"
          value={form.clientId}
          onChange={(e) => handleChange('clientId', e.target.value)}
          required
        />
        <Select
          label="优先级"
          options={PRIORITY_OPTIONS}
          value={form.priority}
          onChange={(e) => handleChange('priority', e.target.value)}
        />
        <Select
          label="项目类型"
          options={CATEGORY_OPTIONS}
          value={form.category}
          onChange={(e) => handleChange('category', e.target.value)}
        />
        <Input
          label="主要负责人"
          placeholder="项目负责人姓名"
          value={form.manager}
          onChange={(e) => handleChange('manager', e.target.value)}
        />
        <Input
          label="项目金额 (¥)"
          type="number"
          placeholder="0"
          value={form.totalAmount}
          onChange={(e) => handleChange('totalAmount', e.target.value)}
        />
        <Input
          label="修改次数限制"
          type="number"
          placeholder="不限"
          value={form.revisionLimit}
          onChange={(e) => handleChange('revisionLimit', e.target.value)}
        />
        <Input
          label="开始日期"
          type="date"
          value={form.startDate}
          onChange={(e) => handleChange('startDate', e.target.value)}
        />
        <Input
          label="截止日期"
          type="date"
          value={form.deadline}
          onChange={(e) => handleChange('deadline', e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-brown-800 mb-1.5">项目描述</label>
        <textarea
          className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[80px] resize-y"
          placeholder="描述项目需求和范围..."
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
        />
      </div>

      <Input
        label="标签"
        placeholder="多个标签用逗号分隔，如：官网, UI设计"
        value={form.tags}
        onChange={(e) => handleChange('tags', e.target.value)}
      />

      <div>
        <label className="block text-sm font-medium text-brown-800 mb-1.5">备注</label>
        <textarea
          className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[60px] resize-y"
          placeholder="备注..."
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" loading={loading}>
          {projectId ? '保存修改' : '创建项目'}
        </Button>
      </div>
    </form>
  );
}
