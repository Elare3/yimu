'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import ClientForm from '@/components/business/ClientForm';
import { useClients } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';
import { toast } from '@/stores/toastStore';

const CATEGORY_OPTIONS = [
  { value: '', label: '请选择服务类型' },
  { value: '品牌设计', label: '品牌设计' },
  { value: 'UI/UX设计', label: 'UI/UX设计' },
  { value: '网站开发', label: '网站开发' },
  { value: '小程序开发', label: '小程序开发' },
  { value: 'APP开发', label: 'APP开发' },
  { value: '咨询服务', label: '咨询服务' },
  { value: '内容创作', label: '内容创作' },
  { value: '摄影摄像', label: '摄影摄像' },
  { value: '营销推广', label: '营销推广' },
  { value: '其他', label: '其他' },
];

export default function AIQuotePage() {
  const router = useRouter();
  const { clients, mutate: mutateClients } = useClients();
  const [clientId, setClientId] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const { projects } = useProjects(undefined, clientId || undefined);
  const [form, setForm] = useState({
    requirement: '',
    category: '',
    budgetHint: '',
    projectId: '',
  });
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.requirement) {
      toast.error('请描述客户需求');
      return;
    }
    if (!clientId) {
      toast.error('请选择客户');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          clientId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('小木报价已生成！');
        router.push(`/quotes/${result.data.quote.id}`);
      } else {
        toast.error(result.error || '小木生成失败，请重试');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/quotes')}
          className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-brown-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brown-800">小木智能报价</h2>
      </div>

      {/* AI 提示卡片 */}
      <div className="bg-caramel-bg border border-dashed border-caramel/30 rounded-card p-5">
        <p className="text-caramel font-semibold text-sm mb-2">小木报价助手</p>
        <p className="text-brown-500 text-sm leading-relaxed">
          描述客户的需求，小木将根据服务类型和市场行情，自动拆分报价明细，生成专业的报价方案。你可以在生成后自由编辑和调整。
        </p>
      </div>

      <form onSubmit={handleGenerate} className="bg-white rounded-card border-[1.5px] border-cream-300 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-brown-800">客户 *</label>
              <button
                type="button"
                onClick={() => setShowNewClient(true)}
                className="text-xs text-caramel hover:text-caramel-dark font-medium transition-colors"
              >
                + 新建客户
              </button>
            </div>
            <Select
              options={clientOptions}
              placeholder="请选择客户"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            />
          </div>
          <Select
            label="关联项目"
            options={projectOptions}
            value={form.projectId}
            onChange={(e) => setForm(f => ({ ...f, projectId: e.target.value }))}
          />
          <Select
            label="服务类型"
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
          />
          <Input
            label="预算参考"
            placeholder="如：1-2万、5000左右"
            value={form.budgetHint}
            onChange={(e) => setForm(f => ({ ...f, budgetHint: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-brown-800 mb-1.5">客户需求描述 *</label>
          <textarea
            className="w-full px-4 py-3 rounded-[14px] border-[1.5px] border-cream-300 bg-white focus:border-caramel focus:ring-2 focus:ring-caramel/15 placeholder:text-brown-300 font-sans text-sm outline-none transition-all duration-200 min-h-[120px] resize-y"
            placeholder="详细描述客户的需求，小木会根据描述自动拆分报价明细。&#10;&#10;例如：客户想做一个企业官网，包括首页、关于我们、产品展示、新闻中心、联系我们5个页面，需要响应式设计，支持后台管理更新内容。"
            value={form.requirement}
            onChange={(e) => setForm(f => ({ ...f, requirement: e.target.value }))}
            required
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={() => router.push('/quotes')}>
            取消
          </Button>
          <Button type="submit" loading={loading}>
            {loading ? '正在生成...' : '小木生成报价'}
          </Button>
        </div>
      </form>

      <Modal isOpen={showNewClient} onClose={() => setShowNewClient(false)} title="新建客户" size="lg">
        <ClientForm
          onSubmit={async (data) => {
            const res = await fetch('/api/clients', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });
            const result = await res.json();
            if (result.success) {
              toast.success('客户创建成功');
              await mutateClients();
              setClientId(result.data.id);
              setShowNewClient(false);
            } else {
              toast.error(result.error || '创建失败');
            }
          }}
          onCancel={() => setShowNewClient(false)}
        />
      </Modal>
    </div>
  );
}
