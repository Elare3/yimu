'use client';

import { useRouter } from 'next/navigation';
import ProjectForm from '@/components/business/ProjectForm';
import { toast } from '@/stores/toastStore';

export default function NewProjectPage() {
  const router = useRouter();

  const handleCreate = async (data: Record<string, unknown>) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      toast.success('项目创建成功');
      router.push('/projects');
    } else {
      toast.error(result.error || '创建失败');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/projects')}
          className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-brown-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brown-800">新建项目</h2>
      </div>

      {/* 表单卡片 */}
      <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
        <ProjectForm
          onSubmit={handleCreate}
          onCancel={() => router.push('/projects')}
        />
      </div>
    </div>
  );
}
