type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingProps {
  size?: SpinnerSize;
  className?: string;
}

const sizeMap: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
};

/** Spinning loader circle. */
function Loading({ size = 'md', className = '' }: LoadingProps) {
  return (
    <div
      className={[
        'rounded-full animate-spin',
        'border-caramel/25 border-t-caramel',
        sizeMap[size],
        className,
      ].join(' ')}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/** Full-page overlay with centered spinner and optional message. */
function LoadingOverlay({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-cream-50/80 backdrop-blur-[2px]">
      <Loading size="lg" />
      {message && (
        <p className="mt-4 text-sm text-brown-500">{message}</p>
      )}
    </div>
  );
}

/** Inline loading placeholder for sections within a page. */
function LoadingSection({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loading size="md" />
      {message && (
        <p className="mt-3 text-sm text-brown-300">{message}</p>
      )}
    </div>
  );
}

export { Loading, LoadingOverlay, LoadingSection, type LoadingProps, type SpinnerSize };
