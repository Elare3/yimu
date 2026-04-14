'use client';

import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatAmount, formatDate } from '@/lib/utils';

interface PaymentNodeData {
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
}

interface PaymentCardProps {
  node: PaymentNodeData;
  onMarkPaid: (id: string) => void;
  onRemind: (id: string) => void;
  onDelete: (id: string) => void;
  remindLoading?: boolean;
}

export default function PaymentCard({ node, onMarkPaid, onRemind, onDelete, remindLoading }: PaymentCardProps) {
  const isOverdue = () => {
    if (node.status === 'paid') return false;
    return new Date(node.dueDate) < new Date();
  };

  return (
    <div
      className={[
        'bg-white rounded-card border-[1.5px] p-5 transition-all duration-200',
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
          <div className="flex items-center gap-3 text-xs text-brown-300">
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
                className="p-1.5 rounded-lg hover:bg-danger-light text-brown-300 hover:text-danger transition-colors"
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
    </div>
  );
}
