'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatAmount, formatDate, isOverdueDate } from '@/lib/utils';
import { toast } from '@/stores/toastStore';

interface PaymentNodeData {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  status: string;
  paidAt?: string | null;
  paidAmount: number;
  reminderCount: number;
  notes?: string;
  project?: { id: string; name: string } | null;
  client?: { id: string; name: string; contactPerson?: string } | null;
}

interface PaymentCardProps {
  node: PaymentNodeData;
  onMarkPaid: (id: string) => void;
  onRemind: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: () => void;
  remindLoading?: boolean;
}

export default function PaymentCard({ node, onMarkPaid, onRemind, onDelete, onUpdate, remindLoading }: PaymentCardProps) {
  const [editing, setEditing] = useState(false);
  const [notesValue, setNotesValue] = useState(node.notes || '');
  const [saving, setSaving] = useState(false);

  // 截止当天 24:00 之前都不算逾期（北京时间）
  const isOverdue = () => {
    if (node.status === 'paid') return false;
    return isOverdueDate(node.dueDate);
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/payments/${node.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesValue }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('备注已保存');
        setEditing(false);
        onUpdate?.();
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={[
        'bg-white rounded-card border-[1.5px] p-4 sm:p-5 transition-all duration-200',
        isOverdue() ? 'border-danger/30 bg-danger-light/30' : 'border-cream-300',
      ].join(' ')}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-brown-800 text-sm">{node.name}</h3>
            <StatusBadge status={node.status} />
            {isOverdue() && (
              <span className="text-danger text-xs font-medium">逾期</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-brown-300 flex-wrap">
            {node.project && <span>{node.project.name}</span>}
            {node.client && <span>· {node.client.name}</span>}
            <span>· 到期 {formatDate(node.dueDate)}</span>
            {node.paidAt && <span>· 收款于 {formatDate(node.paidAt)}</span>}
            {node.reminderCount > 0 && <span>· 已催 {node.reminderCount} 次</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-serif text-lg font-bold text-brown-800">
            {formatAmount(node.amount)}
          </span>

          {node.status !== 'paid' && (
            <div className="flex gap-1.5">
              <button
                onClick={() => onDelete(node.id)}
                className="p-2.5 rounded-lg hover:bg-danger-light text-brown-300 hover:text-danger transition-colors"
                title="删除"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <Button
                variant="ghost"
                size="sm"
                loading={remindLoading}
                onClick={() => onRemind(node.id)}
              >
                催款
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onMarkPaid(node.id)}
              >
                确认收款
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 备注区域 */}
      {editing ? (
        <div className="mt-3 pt-3 border-t border-cream-200">
          <textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="添加备注..."
            rows={2}
            autoFocus
            className="w-full px-3 py-2 text-sm text-brown-800 bg-cream-50 rounded-[10px] border border-cream-300 outline-none focus:border-caramel focus:ring-2 focus:ring-caramel/15 resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setNotesValue(node.notes || ''); }}>
              取消
            </Button>
            <Button size="sm" loading={saving} onClick={handleSaveNotes}>
              保存
            </Button>
          </div>
        </div>
      ) : (
        <div
          className="mt-3 pt-3 border-t border-cream-100 flex items-start gap-2 cursor-pointer group"
          onClick={() => { setNotesValue(node.notes || ''); setEditing(true); }}
        >
          <svg className="w-3.5 h-3.5 text-brown-300 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {node.notes ? (
            <p className="text-sm text-brown-500 leading-relaxed group-hover:text-brown-700 transition-colors">{node.notes}</p>
          ) : (
            <p className="text-sm text-brown-300 italic group-hover:text-brown-500 transition-colors">点击添加备注</p>
          )}
        </div>
      )}
    </div>
  );
}
