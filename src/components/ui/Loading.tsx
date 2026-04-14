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

export { Loading, type LoadingProps, type SpinnerSize };
