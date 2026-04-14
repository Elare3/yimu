'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import useSWR from 'swr';
import { useState, useTransition, useCallback, memo } from 'react';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  design: '设计师',
  development: '开发者',
  content: '内容创作者',
  consulting: '顾问',
  operations: '运营',
  other: '其他',
};

function SidebarAvatar({ src, name }: { src?: string; name?: string | null }) {
  const [imgError, setImgError] = useState(false);
  const initial = name?.charAt(0) || '我';

  if (src && !imgError) {
    return (
      <img // eslint-disable-line @next/next/no-img-element
        src={src}
        alt="头像"
        width={28}
        height={28}
        className="w-7 h-7 rounded-full object-cover shrink-0"
        style={{ border: '1.5px solid rgba(255,255,255,0.15)' }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-caramel to-amber flex items-center justify-center text-white text-[11px] font-bold shrink-0">
      {initial}
    </div>
  );
}

const NAV_ITEMS = [
  {
    label: '概览',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: '客户',
    href: '/clients',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: '项目',
    href: '/projects',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: '报价',
    href: '/quotes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: '记账',
    href: '/finance',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: '收款',
    href: '/payments',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
];

function SidebarInner() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: profileData } = useSWR('/api/users/profile');
  const profile = profileData?.data;
  const [isPending, startTransition] = useTransition();

  // 使用 startTransition 包裹路由跳转，让 React 立即更新 UI（侧边栏高亮）
  // 而不必等待目标页面的数据加载完成
  const handleNav = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
    });
  }, [router]);

  return (
    <aside className={`hidden md:flex flex-col w-[220px] bg-brown-800 rounded-r-sidebar h-screen sticky top-0 p-4 ${isPending ? 'opacity-95' : ''}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-2 mb-8 mt-2">
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #C47D3F, #D4940E)' }}
        >
          <span className="text-white font-serif text-base font-extrabold">木</span>
        </div>
        <div>
          <div className="text-white font-serif text-[17px] font-bold leading-tight">一木</div>
          <div className="text-[#6A5E52] text-[9px] tracking-[0.2em]">YIMU</div>
        </div>
      </div>

      {/* 导航 — 使用 Link 保持预取 + onClick 使用 transition */}
      <nav className="flex-1 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onClick={(e) => {
                // 阻止默认导航，改为 transition 导航
                // 这样侧边栏高亮会立即切换，页面内容在后台加载
                if (!isActive) {
                  e.preventDefault();
                  handleNav(item.href);
                }
              }}
              className={`flex items-center gap-3 px-4 py-3 rounded-[14px] text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-caramel to-caramel-light text-white font-semibold shadow-[0_4px_16px_rgba(196,125,63,0.25)]'
                  : 'text-[#9A8E82] hover:bg-brown-700 hover:text-[#E8DDD0]'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 导航加载指示 */}
      {isPending && (
        <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden rounded-r-sidebar">
          <div className="h-full bg-gradient-to-r from-caramel to-amber animate-pulse" />
        </div>
      )}

      {/* 底部用户卡片 */}
      <div className="mt-auto pt-4 border-t border-white/10">
        <Link
          href="/settings"
          prefetch={true}
          className="flex items-center gap-3 px-3 py-3 rounded-[14px] hover:bg-brown-700 transition-colors"
        >
          <SidebarAvatar src={profile?.avatarUrl} name={session?.user?.name} />
          <div className="min-w-0 flex-1">
            <div className="text-white text-sm font-medium truncate">
              {profile?.name || session?.user?.name || '用户'}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {profile?.businessType && profile.businessType !== 'other' && (
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium"
                  style={{ background: 'rgba(196,125,63,0.15)', color: '#D4956A' }}
                >
                  {BUSINESS_TYPE_LABELS[profile.businessType] || '其他'}
                </span>
              )}
              <span className="text-[#6A5E52] text-[11px] truncate">
                {profile?.plan === 'pro' ? 'Pro版' : profile?.plan === 'premium' ? '高级版' : '免费版'}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}

// memo 包裹避免父组件 re-render 导致侧边栏重绘
const Sidebar = memo(SidebarInner);
export default Sidebar;
