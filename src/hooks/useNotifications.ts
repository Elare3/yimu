import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';

export interface Notification {
  id: string;
  type: 'overdue' | 'upcoming' | 'quote_expiring' | 'deadline' | 'review' | 'completed';
  title: string;
  description: string;
  time: string;
  link: string;
  priority: 'high' | 'medium' | 'low';
}

const STORAGE_KEY = 'yimu_notifications_read';

/** 从 localStorage 读取已读通知ID集合 */
function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    // 只保留最近存的（防止无限膨胀），最多200条
    if (Array.isArray(parsed)) return new Set(parsed.slice(-200));
    return new Set();
  } catch {
    return new Set();
  }
}

/** 将已读ID集合写入 localStorage，并通知其他 hook 实例同步 */
function saveReadIds(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    // 通知同一页面内其他 useNotifications 实例刷新 readIds
    window.dispatchEvent(new Event('yimu_read_ids_changed'));
  } catch { /* localStorage full or unavailable */ }
}

export function useNotifications() {
  // 不覆盖全局 SWRConfig 的 revalidateOnFocus（关闭）；refreshInterval 已经够用，
  // 切 tab 都重拉会浪费流量、还把 owner 白名单接口打高。
  const { data, error, isLoading, mutate } = useSWR('/api/notifications', {
    refreshInterval: 60_000,
    dedupingInterval: 10_000,
  });

  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // 初始化时从 localStorage 恢复，并监听其他实例的同步事件
  useEffect(() => {
    setReadIds(getReadIds());
    const syncFromStorage = () => setReadIds(getReadIds());
    window.addEventListener('yimu_read_ids_changed', syncFromStorage);
    return () => window.removeEventListener('yimu_read_ids_changed', syncFromStorage);
  }, []);

  const notifications = (data?.data?.items ?? []) as Notification[];
  const total = (data?.data?.total ?? 0) as number;

  // 未读数 = 服务端返回的通知中，不在已读集合里、且不是低优先级(completed)的数量
  const unreadCount = notifications.filter(
    (n) => !readIds.has(n.id) && n.priority !== 'low'
  ).length;

  /** 将指定通知标记为已读 */
  const markAsRead = useCallback((ids: string[]) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  /** 将当前所有通知标记为已读 */
  const markAllAsRead = useCallback(() => {
    const items = (data?.data?.items ?? []) as Notification[];
    const allIds = items.map((n) => n.id);
    markAsRead(allIds);
  }, [data, markAsRead]);

  /** 检查某条通知是否已读 */
  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);

  return {
    notifications,
    total,
    unreadCount,
    isLoading,
    isError: error,
    mutate,
    markAsRead,
    markAllAsRead,
    isRead,
  };
}
