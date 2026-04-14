'use client';

import { useRouter } from 'next/navigation';
import QuoteForm from '@/components/business/QuoteForm';
import { toast } from '@/stores/toastStore';

export default function NewQuotePage() {
  const router = useRouter();

  const handleSubmit = async (data: Record<string, unknown>) => {
    const res = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      toast.success('报价单创建成功');
      router.push(`/quotes/${result.data.id}`);
    } else {
      toast.error(result.error || '创建失败');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/quotes')}
          className="p-2 rounded-lg hover:bg-cream-100 text-brown-300 hover:text-brown-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="font-serif text-xl font-bold text-brown-800">手动创建报价单</h2>
      </div>

      <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
        <QuoteForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/quotes')}
        />
      </div>
    </div>
  );
}
