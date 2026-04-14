'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const onboardingSchema = z.object({
  businessType: z.enum(['design', 'development', 'content', 'consulting', 'operations', 'other']),
  entityType: z.enum(['individual', 'sole_proprietor', 'micro_company', 'freelance']),
  companyName: z.string().optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确').optional().or(z.literal('')),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const BUSINESS_TYPES = [
  { value: 'design', label: '设计' },
  { value: 'development', label: '开发' },
  { value: 'content', label: '内容创作' },
  { value: 'consulting', label: '咨询' },
  { value: 'operations', label: '运营' },
  { value: 'other', label: '其他' },
] as const;

const ENTITY_TYPES = [
  { value: 'individual', label: '个体工商户' },
  { value: 'sole_proprietor', label: '个人独资企业' },
  { value: 'micro_company', label: '有限公司' },
  { value: 'freelance', label: '自由职业（未注册）' },
] as const;

export default function OnboardingPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      businessType: 'design',
      entityType: 'freelance',
      companyName: '',
      phone: '',
    },
  });

  const selectedBusiness = watch('businessType');
  const selectedEntity = watch('entityType');

  const onSubmit = async (data: OnboardingForm) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/users/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType: data.businessType,
          entityType: data.entityType,
          companyName: data.companyName || '',
          phone: data.phone || '',
        }),
      });
      if (res.ok) {
        await update(); // 刷新 session
        router.push('/dashboard');
      }
    } catch {
      setSubmitError('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      await fetch('/api/users/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await update();
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  const userName = session?.user?.name || '新朋友';

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#FAF6F0' }}>
      <div className="w-full max-w-[520px] bg-white rounded-[20px] p-8 sm:p-10" style={{ border: '1px solid #E8E0D4' }}>
        {/* 头部：头像 + 欢迎语 */}
        <div className="flex flex-col items-center mb-8">
          {session?.user?.avatarUrl ? (
            <img // eslint-disable-line @next/next/no-img-element
              src={session.user.avatarUrl}
              alt={userName}
              className="w-16 h-16 rounded-full object-cover mb-4"
              style={{ border: '3px solid #E8E0D4' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-white text-2xl font-bold font-serif"
              style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
            >
              {userName.charAt(0)}
            </div>
          )}
          <h1 className="font-serif text-[24px] font-extrabold text-brown-800 mb-1">
            欢迎，{userName}！
          </h1>
          <p className="text-brown-500 text-[14px]">帮一木更了解你，让小木建议更精准</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-7">
          {/* 字段1：你主要做什么 */}
          <div>
            <label className="block text-brown-800 text-sm font-semibold mb-3">你主要做什么？</label>
            <div className="grid grid-cols-3 gap-2">
              {BUSINESS_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setValue('businessType', item.value)}
                  className="py-2.5 px-3 rounded-[10px] text-sm font-medium transition-all duration-150"
                  style={{
                    background: selectedBusiness === item.value ? '#C47D3F' : '#fff',
                    color: selectedBusiness === item.value ? '#fff' : '#7A6E62',
                    border: `1.5px solid ${selectedBusiness === item.value ? '#C47D3F' : '#E8E0D4'}`,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 字段2：你的身份是 */}
          <div>
            <label className="block text-brown-800 text-sm font-semibold mb-3">你的身份是？</label>
            <div className="grid grid-cols-2 gap-2">
              {ENTITY_TYPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setValue('entityType', item.value)}
                  className="py-2.5 px-3 rounded-[10px] text-sm font-medium transition-all duration-150"
                  style={{
                    background: selectedEntity === item.value ? '#C47D3F' : '#fff',
                    color: selectedEntity === item.value ? '#fff' : '#7A6E62',
                    border: `1.5px solid ${selectedEntity === item.value ? '#C47D3F' : '#E8E0D4'}`,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 字段3：公司名称 */}
          <div>
            <label className="block text-brown-800 text-sm font-semibold mb-2">
              公司/工作室名称 <span className="text-brown-300 font-normal">（选填）</span>
            </label>
            <input
              {...register('companyName')}
              type="text"
              placeholder="如：木子设计工作室"
              className="w-full px-4 py-3 rounded-[10px] border text-[15px] text-brown-800 placeholder:text-brown-300 outline-none transition-colors focus:border-[#C47D3F]"
              style={{ borderColor: '#E8E0D4' }}
            />
          </div>

          {/* 字段4：手机号 */}
          <div>
            <label className="block text-brown-800 text-sm font-semibold mb-2">
              手机号 <span className="text-brown-300 font-normal">（选填，用于催款函署名）</span>
            </label>
            <input
              {...register('phone')}
              type="tel"
              maxLength={11}
              placeholder="手机号"
              className="w-full px-4 py-3 rounded-[10px] border text-[15px] text-brown-800 placeholder:text-brown-300 outline-none transition-colors focus:border-[#C47D3F]"
              style={{ borderColor: '#E8E0D4' }}
            />
            {errors.phone && (
              <p className="text-danger text-xs mt-1">{errors.phone.message}</p>
            )}
          </div>

          {/* 按钮 */}
          {submitError && (
            <p className="text-danger text-sm mb-2">{submitError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3.5 rounded-[12px] text-white font-semibold text-[15px] transition-all duration-200 disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #C47D3F, #D4956A)',
                boxShadow: '0 4px 16px rgba(196,125,63,0.3)',
              }}
            >
              {submitting ? '保存中...' : '开始使用'}
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="px-6 py-3.5 rounded-[12px] text-brown-500 text-[14px] font-medium hover:bg-cream-100 transition-colors disabled:opacity-60"
              style={{ border: '1.5px solid #E8E0D4' }}
            >
              跳过，稍后设置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
