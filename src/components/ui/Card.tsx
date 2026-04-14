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

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`px-6 py-4 border-b border-cream-200 ${className}`}>
      {children}
    </div>
  );
}

interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={`px-6 py-4 ${className}`}>{children}</div>;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

function CardFooter({ children, className = '' }: CardFooterProps) {
  return (
    <div className={`px-6 py-4 border-t border-cream-200 ${className}`}>
      {children}
    </div>
  );
}

export { Card, CardHeader, CardBody, CardFooter, type CardProps };
