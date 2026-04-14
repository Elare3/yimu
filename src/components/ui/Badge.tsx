import { type ReactNode } from 'react';

type BadgeVariant =
  | 'quoted'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'cancelled'
  | 'default';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  quoted: 'bg-[#FDF5ED] text-[#C47D3F]',
  in_progress: 'bg-[#E8F3E8] text-[#5B8C5A]',
  review: 'bg-[#FFFCF0] text-[#D4940E]',
  completed: 'bg-[#E8F3E8] text-[#3D7A3C]',
  cancelled: 'bg-[#FDF0EF] text-[#C0534F]',
  default: 'bg-cream-100 text-brown-500',
};

const variantLabels: Record<string, string> = {
  quoted: '已报价',
  in_progress: '进行中',
  review: '验收中',
  completed: '已完成',
  cancelled: '已取消',
  draft: '草稿',
  sent: '已发送',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期',
  pending: '待收款',
  reminded: '已提醒',
  paid: '已收款',
  overdue: '已逾期',
};

function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-3 py-1',
        'text-xs font-medium',
        'rounded-tag',
        'transition-colors duration-200',
        variantStyles[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  );
}

/** Convenience component that auto-maps a status string to the correct variant and label. */
function StatusBadge({
  status,
  className = '',
}: {
  status: string;
  className?: string;
}) {
  const variant = (
    Object.keys(variantStyles).includes(status) ? status : 'default'
  ) as BadgeVariant;

  const label = variantLabels[status] ?? status;

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

export { Badge, StatusBadge, type BadgeProps, type BadgeVariant };
