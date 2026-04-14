'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-gradient-to-r from-caramel to-caramel-light text-white',
    'hover:shadow-lg hover:shadow-caramel/25',
    'active:shadow-md',
    'disabled:from-caramel/50 disabled:to-caramel-light/50 disabled:shadow-none',
  ].join(' '),
  secondary: [
    'bg-white text-brown-800 border-[1.5px] border-cream-300',
    'hover:border-caramel/40 hover:text-caramel',
    'active:bg-cream-50',
    'disabled:text-brown-300 disabled:border-cream-200',
  ].join(' '),
  danger: [
    'bg-danger text-white',
    'hover:bg-danger/90 hover:shadow-lg hover:shadow-danger/25',
    'active:bg-danger/80',
    'disabled:bg-danger/50 disabled:shadow-none',
  ].join(' '),
  ghost: [
    'bg-transparent text-brown-500',
    'hover:bg-cream-100 hover:text-brown-800',
    'active:bg-cream-200',
    'disabled:text-brown-300 disabled:bg-transparent',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-5 py-2.5 text-sm gap-2',
  lg: 'px-7 py-3 text-base gap-2.5',
};

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.963 7.963 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium',
          'rounded-button transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-caramel/30 focus:ring-offset-1',
          'disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <Spinner className="h-4 w-4" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        <span className={loading ? 'opacity-70' : ''}>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize };
