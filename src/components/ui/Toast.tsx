'use client';

import { useEffect, useState } from 'react';
import { useToastStore, type ToastType } from '@/stores/toastStore';

/* ── Icon SVGs ────────────────────────────────────────────── */

function SuccessIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/* ── Styling maps ─────────────────────────────────────────── */

const typeStyles: Record<ToastType, string> = {
  success: 'bg-olive-light text-olive border-olive/20',
  error: 'bg-danger-light text-danger border-danger/20',
  warning: 'bg-amber-bg text-amber border-amber/20',
  info: 'bg-caramel-bg text-caramel border-caramel/20',
};

const iconMap: Record<ToastType, () => JSX.Element> = {
  success: SuccessIcon,
  error: ErrorIcon,
  warning: WarningIcon,
  info: InfoIcon,
};

/* ── Single toast item ────────────────────────────────────── */

function ToastItem({
  id,
  type,
  message,
}: {
  id: string;
  type: ToastType;
  message: string;
}) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [exiting, setExiting] = useState(false);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => removeToast(id), 200);
  };

  const Icon = iconMap[type];

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 px-4 py-3',
        'rounded-button border shadow-lg',
        'min-w-[300px] max-w-[420px]',
        typeStyles[type],
        exiting
          ? 'animate-[toastOut_0.2s_ease_forwards]'
          : 'animate-[toastIn_0.3s_ease]',
      ].join(' ')}
    >
      <span className="shrink-0 mt-0.5">
        <Icon />
      </span>
      <p className="flex-1 text-sm font-medium leading-snug">{message}</p>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss notification"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ── Container (mount once in layout) ─────────────────────── */

function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  // Prevent SSR hydration issues
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} type={t.type} message={t.message} />
      ))}

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateX(24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toastOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(24px);
          }
        }
      `}</style>
    </div>
  );
}

export { ToastContainer, ToastItem };
