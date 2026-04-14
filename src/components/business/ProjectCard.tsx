'use client';

import { formatAmount, formatDate } from '@/lib/utils';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    status: string;
    priority: string;
    totalAmount: number;
    paidAmount: number;
    deadline?: string | null;
    notes: string;
    client?: { id: string; name: string } | null;
    tags?: string[];
  };
  onClick?: () => void;
  isDragging?: boolean;
}

const PRIORITY_CONFIG: Record<string, { dot: string; label: string }> = {
  high: { dot: 'bg-danger', label: '紧急' },
  medium: { dot: 'bg-amber', label: '中等' },
  low: { dot: 'bg-olive', label: '普通' },
};

const STATUS_DOT_COLORS: Record<string, string> = {
  quoted: '#C47D3F',
  in_progress: '#5B8C5A',
  review: '#D4940E',
  completed: '#8BA88B',
};

export default function ProjectCard({ project, onClick, isDragging }: ProjectCardProps) {
  const priorityConfig = PRIORITY_CONFIG[project.priority] || PRIORITY_CONFIG.medium;
  const paymentPercent = project.totalAmount > 0
    ? Math.round((project.paidAmount / project.totalAmount) * 100)
    : 0;

  return (
    <div
      onClick={onClick}
      className={[
        'bg-white rounded-card border-[1.5px] border-cream-300 p-4 cursor-pointer',
        'transition-all duration-200',
        isDragging
          ? 'shadow-xl rotate-[2deg] scale-105 border-caramel/40'
          : 'hover:translate-y-[-2px] hover:shadow-[0_12px_32px_rgba(44,36,32,0.06)] hover:border-caramel/25',
      ].join(' ')}
    >
      {/* 名称 + 优先级 */}
      <div className="flex items-start justify-between mb-1.5">
        <h4 className="font-semibold text-brown-800 text-sm leading-snug line-clamp-2 flex-1 mr-2">
          {project.name}
        </h4>
        {project.priority === 'high' && (
          <span className="relative flex-shrink-0 mt-0.5">
            <span className="absolute inset-0 rounded-full bg-danger/20 animate-ping" style={{ width: 10, height: 10 }} />
            <span className={`block w-2.5 h-2.5 rounded-full ${priorityConfig.dot}`} />
          </span>
        )}
      </div>

      {/* 客户名 */}
      {project.client && (
        <p className="text-brown-300 text-xs mb-3">{project.client.name}</p>
      )}

      {/* 金额 */}
      {project.totalAmount > 0 && (
        <p className="font-serif text-lg font-bold text-brown-800 mb-2">
          {formatAmount(project.totalAmount)}
        </p>
      )}

      {/* 收款进度条 */}
      {project.totalAmount > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-brown-300 mb-1">
            <span>收款</span>
            <span>{paymentPercent}%</span>
          </div>
          <div className="h-1 bg-cream-100 rounded-full overflow-hidden">
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

      {/* 底部: 截止日 + 标签 */}
      <div className="flex items-center justify-between mt-2">
        {project.deadline && (
          <div className="flex items-center gap-1 text-xs text-brown-300">
            <span>⏤</span>
            <span>{formatDate(project.deadline)}</span>
          </div>
        )}
        {project.tags && project.tags.length > 0 && (
          <div className="flex gap-1">
            {project.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="bg-caramel-bg text-caramel text-[10px] px-1.5 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 备注（仅显示一行） */}
      {project.notes && (
        <p className="text-brown-300 text-xs italic mt-1.5 line-clamp-1">
          {project.notes}
        </p>
      )}
    </div>
  );
}

export { STATUS_DOT_COLORS, PRIORITY_CONFIG };
export type { ProjectCardProps };
