'use client';

import { type HTMLAttributes, type ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
  className?: string;
}

function Card({ children, hoverable = true, className = '', ...props }: CardProps) {
  return (
    <div
      className={[
        'bg-white rounded-card border border-cream-200',
        'shadow-sm',
        hoverable
          ? [
              'transition-all duration-300 ease-out',
              'hover:-translate-y-[3px]',
              'hover:shadow-[0_8px_30px_rgba(196,125,63,0.08)]',
              'hover:border-caramel/25',
            ].join(' ')
          : '',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export { Card, type CardProps };
