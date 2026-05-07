'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useKanban } from '@/hooks/useProjects';
import { Button } from '@/components/ui/Button';
import { SkeletonKanbanColumn } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import KanbanBoard from '@/components/business/KanbanBoard';
import ProjectForm from '@/components/business/ProjectForm';
import { toast } from '@/stores/toastStore';
import { formatAmount, formatDate } from '@/lib/utils';
import { ACTIVE_PROJECT_STATUSES } from '@/lib/constants';

export default function ProjectsPage() {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [completedSearch, setCompletedSearch] = useState('');
  const [searchText, setSearchText] = useState('');

  const { columns, completedTotal, isLoading, mutate } = useKanban();

  // 客户端过滤活跃列（已报价/进行中/待审核）—— 搜索 项目名 / 客户名 / 标签 / 备注
  const filteredColumns = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return columns;
    const filtered: Record<string, typeof columns[string]> = {};
    for (const [status, list] of Object.entries(columns)) {
      filtered[status] = (list as Array<Record<string, unknown>>).filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const clientName = String((p.client as { name?: string } | null)?.name || '').toLowerCase();
        const notes = String(p.notes || '').toLowerCase();
        const tags = Array.isArray(p.tags) ? (p.tags as string[]).join(' ').toLowerCase() : '';
        return name.includes(q) || clientName.includes(q) || notes.includes(q) || tags.includes(q);
      }) as typeof columns[string];
    }
    return filtered;
  }, [columns, searchText]);

  // 搜索结果总数（用于空态提示）
  const searchHitCount = useMemo(() => {
    if (!searchText.trim()) return 0;
    return ACTIVE_PROJECT_STATUSES.reduce(
      (sum, status) => sum + ((filteredColumns[status] as unknown[] | undefined)?.length || 0),
      0
    );
  }, [filteredColumns, searchText]);

  // 搜索已完成项目（有搜索词时单独请求）
  const { data: searchData } = useSWR(
    completedSearch.trim() ? `/api/projects/kanban?completedSearch=${encodeURIComponent(completedSearch.trim())}` : null
  );
  const searchResults = searchData?.data?.columns?.completed || [];

  const completedProjects = completedSearch.trim() ? searchResults : (columns.completed || []);

  const handleCreate = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('项目创建成功');
        mutate();
        setShowForm(false);
      } else {
        toast.error(result.error || '创建失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/projects/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('项目更新成功');
        mutate();
        setEditingId(null);
      } else {
        toast.error(result.error || '更新失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('状态已更新');
        mutate();
      } else {
        toast.error(result.error || '状态变更失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleReactivate = async (projectId: string) => {
    await handleStatusChange(projectId, 'quoted');
    setShowCompleted(false);
  };

  const handleDelete = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success('项目已删除');
        mutate();
        setDeletingId(null);
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  const handleProjectClick = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  return (
    <div className="space-y-6">
      {/* 工具栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {/* 搜索框 */}
        <div className="relative flex-1 sm:max-w-md">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-300 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索项目名、客户、标签..."
            className="w-full pl-10 pr-10 py-2.5 text-sm text-brown-800 bg-white rounded-[12px] border-[1.5px] border-cream-300 outline-none focus:border-caramel focus:ring-2 focus:ring-caramel/15 transition-all duration-200 placeholder:text-brown-300"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              aria-label="清除搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brown-300 hover:text-brown-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          {searchText.trim() && (
            <span className="text-xs text-brown-400 whitespace-nowrap">
              找到 <span className="font-semibold text-brown-800">{searchHitCount}</span> 个
            </span>
          )}
          <Button onClick={() => setShowForm(true)}>
            + 新建项目
          </Button>
        </div>
      </div>

      {/* 搜索提示：未命中活跃列 */}
      {searchText.trim() && searchHitCount === 0 && (
        <div className="bg-cream-50 border border-cream-200 rounded-[12px] p-4 text-center text-sm text-brown-400">
          活跃项目中没有匹配 <span className="font-semibold text-brown-700">「{searchText}」</span> 的结果。
          {completedTotal > 0 && (
            <>
              <span className="mx-1">·</span>
              <button
                type="button"
                onClick={() => {
                  setCompletedSearch(searchText);
                  setShowCompleted(true);
                }}
                className="text-caramel hover:text-caramel-dark underline transition-colors"
              >
                在已完成项目中搜索
              </button>
            </>
          )}
        </div>
      )}

      {/* 加载状态 — 仅首次无缓存时显示骨架屏 */}
      {isLoading && Object.keys(columns).length === 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonKanbanColumn key={i} />
          ))}
        </div>
      )}

      {/* 看板 */}
      {(!isLoading || Object.keys(columns).length > 0) && (
        <KanbanBoard
          columns={filteredColumns}
          onStatusChange={handleStatusChange}
          onProjectClick={handleProjectClick}
          completedTotal={completedTotal}
          onShowCompleted={() => setShowCompleted(true)}
        />
      )}

      {/* 已完成项目弹窗 */}
      <Modal isOpen={showCompleted} onClose={() => { setShowCompleted(false); setCompletedSearch(''); }} title="已完成项目" size="lg">
        <div className="space-y-3">
          {/* 搜索框 */}
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brown-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={completedSearch}
              onChange={(e) => setCompletedSearch(e.target.value)}
              placeholder="搜索已完成的项目..."
              className="w-full pl-10 pr-4 py-2.5 text-sm text-brown-800 bg-cream-50 rounded-[12px] border-[1.5px] border-cream-300 outline-none focus:border-caramel focus:ring-2 focus:ring-caramel/15 transition-all duration-200"
            />
            {completedSearch && (
              <button
                onClick={() => setCompletedSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brown-300 hover:text-brown-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {completedProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-brown-300">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">{completedSearch.trim() ? '没有找到匹配的项目' : '暂无已完成的项目'}</p>
            </div>
          ) : (
            <>
              {completedProjects.map((project: Record<string, unknown>) => (
                <div
                  key={project.id as string}
                  className="bg-cream-50 rounded-[12px] border border-cream-200 p-4 hover:border-caramel/20 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-olive flex-shrink-0" />
                        <h4
                          className="font-semibold text-sm text-brown-800 truncate cursor-pointer hover:text-caramel transition-colors"
                          onClick={() => {
                            setShowCompleted(false);
                            handleProjectClick(project.id as string);
                          }}
                        >
                          {project.name as string}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-brown-300 ml-4">
                        {(project.client as { name: string } | null)?.name && (
                          <span>{(project.client as { name: string }).name}</span>
                        )}
                        {(project.totalAmount as number) > 0 && (
                          <span className="font-medium text-brown-500">{formatAmount(project.totalAmount as number)}</span>
                        )}
                        {!!project.completedAt && (
                          <span>完成于 {formatDate(project.completedAt as string)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          setShowCompleted(false);
                          handleProjectClick(project.id as string);
                        }}
                        className="px-2.5 py-1.5 text-xs rounded-lg text-brown-500 hover:bg-cream-100 hover:text-brown-800 transition-colors"
                        title="查看详情"
                      >
                        详情
                      </button>
                      <button
                        onClick={() => handleReactivate(project.id as string)}
                        className="px-2.5 py-1.5 text-xs rounded-lg text-caramel hover:bg-caramel/10 transition-colors"
                        title="重新激活为已报价"
                      >
                        重新激活
                      </button>
                      <button
                        onClick={() => setDeletingId(project.id as string)}
                        className="px-2.5 py-1.5 text-xs rounded-lg text-danger hover:bg-danger/10 transition-colors"
                        title="删除项目"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="text-center pt-2">
                <p className="text-xs text-brown-300">
                  {completedSearch.trim()
                    ? `找到 ${completedProjects.length} 个匹配项目`
                    : `共 ${completedTotal} 个已完成项目`
                  }
                </p>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="确认删除" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-brown-500">
            确定要删除此项目吗？此操作不可撤销。
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeletingId(null)}
              className="px-4 py-2 text-sm rounded-lg text-brown-500 hover:bg-cream-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => deletingId && handleDelete(deletingId)}
              className="px-4 py-2 text-sm rounded-lg bg-danger text-white hover:bg-danger/90 transition-colors"
            >
              确认删除
            </button>
          </div>
        </div>
      </Modal>

      {/* 新建项目 Modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="新建项目" size="lg">
        <ProjectForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
      </Modal>

      {/* 编辑项目 Modal */}
      <Modal isOpen={!!editingId} onClose={() => setEditingId(null)} title="编辑项目" size="lg">
        <ProjectForm
          projectId={editingId || undefined}
          onSubmit={handleUpdate}
          onCancel={() => setEditingId(null)}
        />
      </Modal>
    </div>
  );
}
