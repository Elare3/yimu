'use client';

import { useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications, type Notification } from '@/hooks/useNotifications';

// 通知类型→图标 & 颜色
const TYPE_CONFIG: Record<
  Notification['type'],
  { icon: string; dotColor: string; bgColor: string }
> = {
  overdue: {
    icon: '🔴',
    dotColor: 'bg-danger',
    bgColor: 'bg-[#FDF0EF]',
  },
  upcoming: {
    icon: '⏰',
    dotColor: 'bg-amber',
    bgColor: 'bg-amber-bg',
  },
  quote_expiring: {
    icon: '📄',
    dotColor: 'bg-amber',
    bgColor: 'bg-amber-bg',
  },
  deadline: {
    icon: '🗓️',
    dotColor: 'bg-danger',
    bgColor: 'bg-[#FDF0EF]',
  },
  review: {
    icon: '📋',
    dotColor: 'bg-caramel',
    bgColor: 'bg-caramel-bg',
  },
  completed: {
    icon: '✅',
    dotColor: 'bg-olive',
    bgColor: 'bg-olive-light',
  },
};

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}个月前`;
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, isRead } = useNotifications();

  // 点击外部关闭 + ESC 关闭
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);
    document.addEventListener('keydown', handleEsc);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open, onClose]);

  const handleClick = (notification: Notification) => {
    markAsRead([notification.id]);
    onClose();
    router.push(notification.link);
  };

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[380px] max-h-[480px] bg-white rounded-card border-[1.5px] border-cream-300 shadow-[0_12px_40px_rgba(44,36,32,0.12)] overflow-hidden z-50 animate-in"
      style={{ animation: 'fadeUp 0.15s ease-out' }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-cream-200">
        <div className="flex items-center gap-2">
          <h3 className="font-serif text-base font-bold text-brown-800">通知</h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-caramel hover:text-caramel-light transition-colors px-2 py-1 rounded-md hover:bg-cream-50"
            >
              全部已读
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-cream-100 text-brown-300 hover:text-brown-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="overflow-y-auto max-h-[400px] divide-y divide-cream-200">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-brown-300 text-sm">
            <div className="h-5 w-5 rounded-full animate-spin border-2 border-caramel/25 border-t-caramel mr-2" />
            加载中...
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="text-center py-12 text-brown-300">
            <p className="text-3xl mb-2">🔔</p>
            <p className="text-sm">暂无通知，一切顺利！</p>
          </div>
        )}

        {!isLoading &&
          notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.upcoming;
            const read = isRead(n.id);
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors ${
                  read ? 'bg-white hover:bg-cream-50/60 opacity-70' : 'hover:bg-cream-50'
                }`}
              >
                {/* 图标 */}
                <div
                  className={`shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center text-base ${cfg.bgColor}`}
                >
                  {cfg.icon}
                </div>
                {/* 文字 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {!read && n.priority !== 'low' && (
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} shrink-0`} />
                    )}
                    <p className={`text-sm truncate ${read ? 'font-medium text-brown-500' : 'font-semibold text-brown-800'}`}>
                      {n.title}
                    </p>
                  </div>
                  <p className="text-xs text-brown-500 mt-0.5 line-clamp-2 leading-relaxed">
                    {n.description}
                  </p>
                  <p className="text-[11px] text-brown-300 mt-1">{timeAgo(n.time)}</p>
                </div>
                {/* 箭头 */}
                <svg
                  className="shrink-0 w-4 h-4 text-brown-300 mt-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            );
          })}
      </div>

      {/* 底部 — 查看全部 */}
      {notifications.length > 0 && (
        <div className="border-t border-cream-200 px-5 py-2.5">
          <button
            onClick={() => {
              onClose();
              router.push('/payments');
            }}
            className="w-full text-center text-sm text-caramel font-medium hover:text-caramel-light transition-colors py-1"
          >
            查看收款管理 →
          </button>
        </div>
      )}
    </div>
  );
}
