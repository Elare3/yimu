'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import PaymentCard from '@/components/business/PaymentCard';
import { useProjects } from '@/hooks/useProjects';
import { toast } from '@/stores/toastStore';
import useSWR from 'swr';

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待收款' },
  { value: 'reminded', label: '已催款' },
  { value: 'overdue', label: '已逾期' },
  { value: 'paid', label: '已收款' },
];

export default function PaymentsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showReminder, setShowReminder] = useState<{
    id: string;
    content: string;
    levelName?: string;
    channel?: string;
    followUpStrategy?: string;
    userOnlyTips?: string;
    overdueDays?: number;
    tone?: string;
    clientName?: string;
    contactPerson?: string;
  } | null>(null);

  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);

  const { data, isLoading, mutate } = useSWR(`/api/payments?${params.toString()}`);
  const payments = data?.data?.items || [];
  const total = data?.data?.total || 0;

  const { projects } = useProjects();

  // 创建表单
  const [form, setForm] = useState({
    projectId: '',
    name: '',
    amount: '',
    dueDate: '',
    notes: '',
  });
  const [createLoading, setCreateLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('收款节点已创建');
        setShowCreate(false);
        setForm({ projectId: '', name: '', amount: '', dueDate: '', notes: '' });
        mutate();
      } else {
        toast.error(result.error || '创建失败');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      const res = await fetch(`/api/payments/${id}/paid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('已标记收款');
        mutate();
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    }
  };

  // 删除确认
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/payments/${deletingId}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        toast.success('收款节点已删除');
        mutate();
        setDeletingId(null);
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch {
      toast.error('网络错误，请稍后重试');
    } finally {
      setDeleteLoading(false);
    }
  };

  const [remindLoading, setRemindLoading] = useState<string | null>(null);
  const handleRemind = async (id: string) => {
    setRemindLoading(id);
    try {
      const res = await fetch(`/api/payments/${id}/remind`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        toast.success('催款文案已生成');
        // 从payments列表中找到对应节点获取客户信息
        const node = payments.find((p: { id: string }) => p.id === id);
        setShowReminder({
          id,
          content: result.data.content,
          levelName: result.data.levelName,
          channel: result.data.channel,
          followUpStrategy: result.data.followUpStrategy,
          userOnlyTips: result.data.userOnlyTips,
          overdueDays: result.data.overdueDays,
          tone: result.data.tone,
          clientName: node?.client?.name,
          contactPerson: node?.client?.contactPerson,
        });
        mutate();
      } else {
        toast.error(result.error || '生成失败');
      }
    } finally {
      setRemindLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('已复制到剪贴板');
    });
  };

  const projectOptions = projects.map((p: { id: string; name: string }) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div className="space-y-6">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-1 bg-cream-100 rounded-button p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={[
                'px-3 py-1.5 rounded-[10px] text-sm font-medium transition-all duration-200',
                statusFilter === tab.value
                  ? 'bg-white text-brown-800 shadow-sm'
                  : 'text-brown-300 hover:text-brown-500',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowCreate(true)}>
          + 新建收款节点
        </Button>
      </div>

      {isLoading && payments.length === 0 && <Loading />}

      {!isLoading && payments.length === 0 && (
        <div className="text-center py-16 text-brown-300">
          <p className="text-4xl mb-4">💳</p>
          <p className="text-lg mb-2">暂无收款节点</p>
          <p className="text-sm">为项目创建收款节点，追踪回款进度</p>
        </div>
      )}

      {!isLoading && payments.length > 0 && (
        <>
          <p className="text-brown-300 text-sm">共 {total} 个收款节点</p>
          <div className="space-y-3">
            {payments.map((node: {
              id: string;
              name: string;
              amount: number;
              dueDate: string;
              status: string;
              paidAt?: string | null;
              paidAmount: number;
              reminderCount: number;
              project?: { id: string; name: string } | null;
              client?: { id: string; name: string; contactPerson?: string } | null;
            }) => (
              <PaymentCard
                key={node.id}
                node={node}
                onMarkPaid={handleMarkPaid}
                onRemind={handleRemind}
                onDelete={(id) => setDeletingId(id)}
                remindLoading={remindLoading === node.id}
              />
            ))}
          </div>
        </>
      )}

      {/* 创建收款节点 Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新建收款节点">
        <form onSubmit={handleCreate} className="space-y-4">
          <Select
            label="关联项目 *"
            options={projectOptions}
            placeholder="请选择项目"
            value={form.projectId}
            onChange={(e) => setForm(f => ({ ...f, projectId: e.target.value }))}
            required
          />
          <Input
            label="节点名称 *"
            placeholder="如：预付款、中期款、尾款"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="金额 *"
              type="number"
              placeholder="0"
              value={form.amount}
              onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
              required
            />
            <Input
              label="到期日 *"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))}
              required
            />
          </div>
          <Input
            label="备注"
            placeholder="备注..."
            value={form.notes}
            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button type="submit" loading={createLoading}>
              创建
            </Button>
          </div>
        </form>
      </Modal>

      {/* 催款文案 Modal */}
      <Modal isOpen={!!showReminder} onClose={() => setShowReminder(null)} title="催款文案" size="lg">
        {showReminder && (
          <div className="space-y-4">
            {/* 催款级别标签 */}
            {showReminder.levelName && (
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  showReminder.overdueDays && showReminder.overdueDays > 7
                    ? 'bg-danger-light text-danger'
                    : showReminder.overdueDays && showReminder.overdueDays > 0
                    ? 'bg-amber-bg text-amber-600'
                    : 'bg-olive-light text-olive'
                }`}>
                  {showReminder.levelName}
                </span>
                {showReminder.overdueDays !== undefined && showReminder.overdueDays > 0 && (
                  <span className="text-xs text-danger">已逾期 {showReminder.overdueDays} 天</span>
                )}
                <span className="text-xs text-brown-300">建议渠道：{showReminder.channel === 'wechat' ? '微信' : showReminder.channel === 'email' ? '邮件' : showReminder.channel || '微信'}</span>
              </div>
            )}

            {/* 催款文案 */}
            <div className="bg-cream-50 rounded-[14px] p-4 relative group">
              <p className="text-brown-800 text-sm leading-relaxed whitespace-pre-wrap">{showReminder.content}</p>
              <button
                onClick={() => copyToClipboard(showReminder.content)}
                className="absolute top-3 right-3 p-2 rounded-lg bg-white/80 hover:bg-white text-brown-300 hover:text-caramel transition-all opacity-0 group-hover:opacity-100 shadow-sm"
                title="一键复制"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>

            {/* 微信发送SOP建议 */}
            <div className="bg-caramel-bg/50 rounded-[14px] p-4 space-y-3">
              <p className="text-sm font-semibold text-caramel flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                发送建议 SOP
              </p>
              <div className="space-y-2 text-sm text-brown-800">
                {/* 发送对象 */}
                <div className="flex items-start gap-2">
                  <span className="text-brown-300 shrink-0 w-16">发给谁：</span>
                  <span>
                    {showReminder.contactPerson
                      ? `${showReminder.clientName} - ${showReminder.contactPerson}`
                      : showReminder.clientName || '客户对接人'}
                    （微信对话窗口）
                  </span>
                </div>

                {/* 发送时间建议 */}
                <div className="flex items-start gap-2">
                  <span className="text-brown-300 shrink-0 w-16">几点发：</span>
                  <span>
                    {(!showReminder.overdueDays || showReminder.overdueDays <= 3)
                      ? '建议工作日 10:00-11:00 或 14:00-15:00 发送（对方精力充沛时更易回复）'
                      : showReminder.overdueDays <= 7
                      ? '建议工作日 9:30-10:30 发送（上午优先处理，体现重视度）'
                      : '建议立即发送（严重逾期不宜再等）'}
                  </span>
                </div>

                {/* 是否先打电话 */}
                <div className="flex items-start gap-2">
                  <span className="text-brown-300 shrink-0 w-16">行动前：</span>
                  <span>
                    {(!showReminder.overdueDays || showReminder.overdueDays <= 0)
                      ? '直接发微信即可，语气保持友好'
                      : showReminder.overdueDays <= 3
                      ? '可先发微信，如1天内未回复再打电话跟进'
                      : showReminder.overdueDays <= 7
                      ? '建议先打个电话试探："X总，之前那笔款项方便这两天安排吗？" 通话后再发文字确认'
                      : '强烈建议先电话沟通，了解对方是否有资金困难，再发正式催款函'}
                  </span>
                </div>

                {/* AI跟进策略 */}
                {showReminder.followUpStrategy && (
                  <div className="flex items-start gap-2">
                    <span className="text-brown-300 shrink-0 w-16">后续：</span>
                    <span>{showReminder.followUpStrategy}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 仅对你可见的提示 */}
            {showReminder.userOnlyTips && (
              <div className="bg-cream-100 rounded-[14px] p-3">
                <p className="text-xs text-brown-300 mb-1">仅对你可见</p>
                <p className="text-sm text-brown-500">{showReminder.userOnlyTips}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowReminder(null)}>
                关闭
              </Button>
              <Button onClick={() => copyToClipboard(showReminder.content)}>
                一键复制到微信
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 删除确认 Modal */}
      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="删除收款节点" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-brown-500">确定要删除该收款节点吗？</p>
          <p className="text-xs text-danger">此操作不可撤销</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setDeletingId(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={deleteLoading}>
              确认删除
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
