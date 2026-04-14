'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useProject } from '@/hooks/useProjects';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import ProjectForm from '@/components/business/ProjectForm';
import { formatAmount, formatDate, STATUS_TRANSITIONS, STATUS_LABELS } from '@/lib/utils';
import { toast } from '@/stores/toastStore';

const PRIORITY_LABELS: Record<string, string> = {
  low: '普通',
  medium: '中等',
  high: '紧急',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-olive',
  medium: 'text-amber',
  high: 'text-danger',
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { project, isLoading, mutate } = useProject(projectId);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteQuotes, setDeleteQuotes] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setStatusLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success(`状态已更新为「${STATUS_LABELS[newStatus]}」`);
        mutate();
      } else {
        toast.error(result.error || '状态变更失败');
      }
    } finally {
      setStatusLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}?deleteQuotes=${deleteQuotes}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success('项目已删除');
        router.push('/projects');
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      toast.success('项目更新成功');
      mutate();
      setShowEdit(false);
    } else {
      toast.error(result.error || '更新失败');
    }
  };

  if (isLoading) return <Loading />;
  if (!project) {
    return (
      <div className="text-center py-16 text-brown-300">
        <p className="text-4xl mb-4">🔍</p>
        <p className="text-lg mb-2">项目不存在</p>
        <Button variant="secondary" onClick={() => router.push('/projects')}>
          返回项目列表
        </Button>
      </div>
    );
  }

  const allowedTransitions = STATUS_TRANSITIONS[project.status] || [];
  const paymentPercent = project.totalAmount > 0
    ? Math.round((project.paidAmount / project.totalAmount) * 100)
    : 0;

  return (
    <div className="space-y-6">
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
        <h2 className="font-serif text-xl font-bold text-brown-800 flex-1 truncate">{project.name}</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
            编辑
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
            删除
          </Button>
        </div>
      </div>

      {/* 主信息卡片 */}
      <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <StatusBadge status={project.status} />
              <span className={`text-sm font-medium ${PRIORITY_COLORS[project.priority] || ''}`}>
                {PRIORITY_LABELS[project.priority] || project.priority}
              </span>
            </div>
            {project.client && (
              <p className="text-brown-500 text-sm">
                客户：{project.client.name}
                {project.client.contactPerson && ` · ${project.client.contactPerson}`}
              </p>
            )}
          </div>

          {project.totalAmount > 0 && (
            <div className="text-right">
              <p className="font-serif text-2xl font-bold text-brown-800">
                {formatAmount(project.totalAmount)}
              </p>
              <p className="text-brown-300 text-sm mt-1">
                已收 {formatAmount(project.paidAmount)} ({paymentPercent}%)
              </p>
            </div>
          )}
        </div>

        {/* 收款进度条 */}
        {project.totalAmount > 0 && (
          <div className="mb-6">
            <div className="h-2 bg-cream-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-caramel to-caramel-light transition-[width] duration-800"
                style={{
                  width: `${paymentPercent}%`,
                  transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
                }}
              />
            </div>
          </div>
        )}

        {/* 信息网格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {project.category && (
            <div>
              <p className="text-brown-300 text-xs mb-1">类型</p>
              <p className="text-brown-800 text-sm font-medium">{project.category}</p>
            </div>
          )}
          {project.startDate && (
            <div>
              <p className="text-brown-300 text-xs mb-1">开始日期</p>
              <p className="text-brown-800 text-sm font-medium">{formatDate(project.startDate)}</p>
            </div>
          )}
          {project.deadline && (
            <div>
              <p className="text-brown-300 text-xs mb-1">截止日期</p>
              <p className="text-brown-800 text-sm font-medium">{formatDate(project.deadline)}</p>
            </div>
          )}
          {project.completedAt && (
            <div>
              <p className="text-brown-300 text-xs mb-1">完成日期</p>
              <p className="text-brown-800 text-sm font-medium">{formatDate(project.completedAt)}</p>
            </div>
          )}
          {project.revisionLimit !== null && project.revisionLimit !== undefined && (
            <div>
              <p className="text-brown-300 text-xs mb-1">修改次数</p>
              <p className="text-brown-800 text-sm font-medium">
                {project.revisionCount} / {project.revisionLimit}
              </p>
            </div>
          )}
        </div>

        {/* 描述 */}
        {project.description && (
          <div className="mb-6">
            <p className="text-brown-300 text-xs mb-2">项目描述</p>
            <p className="text-brown-500 text-sm leading-relaxed whitespace-pre-wrap">{project.description}</p>
          </div>
        )}

        {/* 标签 */}
        {project.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {project.tags.map((tag: string) => (
              <span key={tag} className="bg-caramel-bg text-caramel text-xs px-2.5 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 备注 */}
        {project.notes && (
          <div className="mb-6 p-4 bg-cream-50 rounded-[14px]">
            <p className="text-brown-300 text-xs mb-1">备注</p>
            <p className="text-brown-500 text-sm italic">{project.notes}</p>
          </div>
        )}

        {/* 状态变更按钮 */}
        {allowedTransitions.length > 0 && (
          <div className="border-t border-cream-200 pt-4">
            <p className="text-brown-300 text-xs mb-3">变更状态</p>
            <div className="flex flex-wrap gap-2">
              {allowedTransitions.map((nextStatus: string) => (
                <Button
                  key={nextStatus}
                  variant={nextStatus === 'cancelled' ? 'danger' : 'secondary'}
                  size="sm"
                  loading={statusLoading}
                  onClick={() => handleStatusChange(nextStatus)}
                >
                  → {STATUS_LABELS[nextStatus] || nextStatus}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 交付物 */}
      {project.deliverables?.length > 0 && (
        <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
          <h3 className="font-serif text-lg font-bold text-brown-800 mb-4">交付物</h3>
          <div className="space-y-2">
            {project.deliverables.map((d: { name: string; status: string; completedAt?: string }, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-cream-200 last:border-0">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  d.status === 'done' ? 'bg-olive-light text-olive' : 'bg-cream-100 text-brown-300'
                }`}>
                  {d.status === 'done' ? '✓' : '○'}
                </span>
                <span className={`text-sm flex-1 ${d.status === 'done' ? 'text-brown-300 line-through' : 'text-brown-800'}`}>
                  {d.name}
                </span>
                {d.completedAt && (
                  <span className="text-xs text-brown-300">{formatDate(d.completedAt)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 收款节点 */}
      {project.paymentNodes?.length > 0 && (
        <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
          <h3 className="font-serif text-lg font-bold text-brown-800 mb-4">收款节点</h3>
          <div className="space-y-3">
            {project.paymentNodes.map((node: {
              id: string;
              name: string;
              amount: number;
              dueDate: string;
              status: string;
              paidAt?: string;
            }) => (
              <div key={node.id} className="flex items-center justify-between py-2 border-b border-cream-200 last:border-0">
                <div>
                  <p className="text-sm font-medium text-brown-800">{node.name}</p>
                  <p className="text-xs text-brown-300">
                    {formatDate(node.dueDate)}
                    {node.paidAt && ` · 已于 ${formatDate(node.paidAt)} 收款`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-serif font-bold text-brown-800">{formatAmount(node.amount)}</span>
                  <StatusBadge status={node.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 联系信息 */}
      {project.client && (
        <div className="bg-white rounded-card border-[1.5px] border-cream-300 p-6">
          <h3 className="font-serif text-lg font-bold text-brown-800 mb-4">客户信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-brown-300">公司/姓名：</span>
              <span className="text-brown-800">{project.client.name}</span>
            </div>
            {project.client.contactPerson && (
              <div>
                <span className="text-brown-300">联系人：</span>
                <span className="text-brown-800">{project.client.contactPerson}</span>
              </div>
            )}
            {project.client.phone && (
              <div>
                <span className="text-brown-300">电话：</span>
                <span className="text-brown-800">{project.client.phone}</span>
              </div>
            )}
            {project.client.email && (
              <div>
                <span className="text-brown-300">邮箱：</span>
                <span className="text-brown-800">{project.client.email}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 编辑项目 Modal */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="编辑项目" size="lg">
        <ProjectForm
          projectId={projectId}
          onSubmit={handleUpdate}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      {/* 删除确认 Modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteQuotes(false); }} title="确认删除">
        <div className="space-y-4">
          <p className="text-brown-500 text-sm">
            确定要删除项目「{project.name}」吗？关联的收款节点将一并删除，交易记录将保留但解除关联。此操作不可撤销。
          </p>
          <label className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] bg-cream-50 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteQuotes}
              onChange={(e) => setDeleteQuotes(e.target.checked)}
              className="w-4 h-4 rounded accent-caramel"
            />
            <span className="text-sm text-brown-600">同时删除关联的报价单</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteQuotes(false); }}>
              取消
            </Button>
            <Button variant="danger" size="sm" loading={deleteLoading} onClick={handleDelete}>
              确认删除
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
