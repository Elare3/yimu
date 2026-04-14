'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface ClientFormProps {
  clientId?: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export default function ClientForm({ clientId, onSubmit, onCancel }: ClientFormProps) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    wechat: '',
    address: '',
    tags: '',
    notes: '',
    source: '',
  });

  // 编辑模式：获取客户数据
  useEffect(() => {
    if (clientId) {
      fetch(`/api/clients/${clientId}`)
        .then((res) => res.json())
        .then((result) => {
          if (result.success && result.data) {
            const c = result.data;
            setForm({
              name: c.name || '',
              contactPerson: c.contactPerson || '',
              phone: c.phone || '',
              email: c.email || '',
              wechat: c.wechat || '',
              address: c.address || '',
              tags: (c.tags || []).join(', '),
              notes: c.notes || '',
              source: c.source || '',
            });
          }
        });
    }
  }, [clientId]);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="客户名称 *"
          placeholder="公司或个人名称"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          required
        />
        <Input
          label="联系人"
          placeholder="主要联系人姓名"
          value={form.contactPerson}
          onChange={(e) => handleChange('contactPerson', e.target.value)}
        />
        <Input
          label="电话"
          placeholder="联系电话"
          value={form.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
        />
        <Input
          label="邮箱"
          type="email"
          placeholder="email@example.com"
          value={form.email}
          onChange={(e) => handleChange('email', e.target.value)}
        />
        <Input
          label="微信"
          placeholder="微信号"
          value={form.wechat}
          onChange={(e) => handleChange('wechat', e.target.value)}
        />
        <Input
          label="来源"
          placeholder="客户来源（如：朋友介绍、小红书）"
          value={form.source}
          onChange={(e) => handleChange('source', e.target.value)}
        />
      </div>

      <Input
        label="地址"
        placeholder="地址（可选）"
        value={form.address}
        onChange={(e) => handleChange('address', e.target.value)}
      />

      <Input
        label="标签"
        placeholder="多个标签用逗号分隔，如：VIP, 设计, 长期"
        value={form.tags}
        onChange={(e) => handleChange('tags', e.target.value)}
      />

      <div>
        <label className="block text-sm font-medium text-brown-800 mb-1.5">备注</label>
        <textarea
          className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[80px] resize-y"
          placeholder="备注信息..."
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" loading={loading}>
          {clientId ? '保存修改' : '创建客户'}
        </Button>
      </div>
    </form>
  );
}
