'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from '@/stores/toastStore';
import useSWR from 'swr';

const STEPS = [
  {
    number: 1,
    title: '添加你的第一个客户',
    description: '一木帮你管理所有客户信息，方便后续报价和收款',
    action: '/clients',
    actionLabel: '添加客户',
    icon: '👤',
    doneKey: 'hasClients' as const,
  },
  {
    number: 2,
    title: '创建你的第一个项目',
    description: '把客户的需求变成项目，追踪进度和交付物',
    action: '/projects/new',
    actionLabel: '创建项目',
    icon: '📋',
    doneKey: 'hasProjects' as const,
  },
  {
    number: 3,
    title: '试试小木智能报价',
    description: '输入客户需求，小木自动生成专业报价单，报价速度快10倍',
    action: '/quotes/ai',
    actionLabel: '试试小木报价',
    icon: '🤖',
    doneKey: 'hasQuotes' as const,
  },
];

export default function OnboardingWizard() {
  const router = useRouter();
  const { data, mutate } = useSWR('/api/onboarding');
  const [demoLoading, setDemoLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!data?.data || !data.data.isNewUser || dismissed) return null;

  const progress = data.data.progress;

  const handleImportDemo = async () => {
    setDemoLoading(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import_demo' }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('演示数据已导入，来看看一木满数据的样子吧');
        mutate();
        // 刷新整个页面以加载新数据
        window.location.reload();
      } else {
        toast.error(result.error || '导入失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleClearDemo = async () => {
    setClearLoading(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_demo' }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('演示数据已清除，开始你自己的一木之旅');
        mutate();
        window.location.reload();
      } else {
        toast.error(result.error || '清除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setClearLoading(false);
    }
  };

  const completedSteps = STEPS.filter((s) => progress[s.doneKey]).length;

  return (
    <div className="bg-white rounded-card border-[1.5px] border-caramel/30 p-6 space-y-5"
      style={{ background: 'linear-gradient(135deg, #FFFBF5 0%, #FFF8EE 100%)' }}
    >
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold text-brown-800">
            欢迎来到一木 👋
          </h2>
          <p className="text-sm text-brown-500 mt-1">
            3步快速上手，让一木成为你的经营助手
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-brown-300 hover:text-brown-500 transition-colors p-1"
          title="暂时关闭"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 进度 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-cream-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-caramel rounded-full transition-all duration-500"
            style={{ width: `${(completedSteps / STEPS.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-brown-300 shrink-0">{completedSteps}/{STEPS.length}</span>
      </div>

      {/* 步骤列表 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map((step) => {
          const done = progress[step.doneKey];
          return (
            <div
              key={step.number}
              className={`relative rounded-[14px] border-[1.5px] p-4 transition-all duration-200 ${
                done
                  ? 'border-olive/30 bg-olive-light/30'
                  : 'border-cream-300 bg-white hover:border-caramel/30 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  done ? 'bg-olive text-white' : 'bg-cream-200 text-brown-300'
                }`}>
                  {done ? '✓' : step.number}
                </span>
                <span className="text-base">{step.icon}</span>
              </div>
              <h3 className={`text-sm font-semibold mb-1 ${done ? 'text-olive line-through' : 'text-brown-800'}`}>
                {step.title}
              </h3>
              <p className="text-xs text-brown-300 mb-3">{step.description}</p>
              {!done && (
                <Button
                  size="sm"
                  onClick={() => router.push(step.action)}
                >
                  {step.actionLabel}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* 演示数据快捷入口 */}
      <div className="flex items-center gap-3 pt-2 border-t border-cream-200">
        <p className="text-xs text-brown-300 flex-1">
          不想一步步添加？一键加载演示数据，先看看一木满数据时的样子
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleImportDemo}
          loading={demoLoading}
        >
          加载演示数据
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearDemo}
          loading={clearLoading}
        >
          清除演示数据
        </Button>
      </div>
    </div>
  );
}
