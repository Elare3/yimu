'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition, useCallback, memo } from 'react';
import { preloadRoute } from '@/lib/route-preload';

const TABS = [
  {
    label: '概览',
    href: '/dashboard',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: '项目',
    href: '/projects',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    label: '',
    href: '/projects/new',
    icon: () => (
      <div
        className="w-12 h-12 -mt-4 rounded-full flex items-center justify-center text-white shadow-lg"
        style={{ background: 'linear-gradient(135deg, #C47D3F, #D4956A)', boxShadow: '0 4px 16px rgba(196,125,63,0.4)' }}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
    ),
    isCenter: true,
  },
  {
    label: '记账',
    href: '/finance',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: '我的',
    href: '/settings',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

function MobileNavInner() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleNav = useCallback((href: string) => {
    startTransition(() => {
      router.push(href);
    });
  }, [router]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-cream-200 safe-area-bottom">
      {/* 加载进度条 */}
      {isPending && (
        <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-caramel to-amber animate-pulse" />
        </div>
      )}
      <div className="flex items-center justify-around px-2 py-2">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + '/');
          const isCenter = 'isCenter' in tab && tab.isCenter;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              onTouchStart={() => preloadRoute(tab.href)}
              onMouseEnter={() => preloadRoute(tab.href)}
              onClick={(e) => {
                if (!isActive) {
                  e.preventDefault();
                  handleNav(tab.href);
                }
              }}
              className={`flex flex-col items-center gap-0.5 min-w-[48px] transition-colors ${
                isCenter ? '' : isActive ? 'text-caramel' : 'text-brown-300'
              }`}
            >
              {tab.icon(isActive)}
              {tab.label && (
                <span className={`text-[10px] ${isActive ? 'font-semibold' : ''}`}>
                  {tab.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const MobileNav = memo(MobileNavInner);
export default MobileNav;
