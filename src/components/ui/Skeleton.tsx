/**
 * Skeleton — 骨架屏占位组件
 * 页面切换时立即显示，避免白屏等待
 */

interface SkeletonProps {
  className?: string;
  /** 圆形骨架（头像等） */
  circle?: boolean;
}

/** 单个骨架块 */
function Skeleton({ className = '', circle = false }: SkeletonProps) {
  return (
    <div
      className={[
        'animate-pulse bg-cream-200/60 rounded-[10px]',
        circle ? 'rounded-full' : '',
        className,
      ].join(' ')}
    />
  );
}

/** 骨架卡片 —— 用于列表项 */
function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-card border border-cream-200 p-5 space-y-3 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex items-center gap-2 pt-1">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-1 flex-1" />
      </div>
    </div>
  );
}

/** 仪表盘摘要卡片骨架 */
function SkeletonSummaryCard() {
  return (
    <div className="bg-white rounded-card border border-cream-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-8 rounded-[10px]" />
      </div>
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-2 w-20" />
    </div>
  );
}

/** 看板列骨架 */
function SkeletonKanbanColumn() {
  return (
    <div className="min-w-0 md:min-w-[260px] md:w-[280px] shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Skeleton circle className="h-3 w-3" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
      <div className="space-y-3 bg-cream-50/50 rounded-[16px] p-3 min-h-[200px]">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

/** 仪表盘整体骨架 */
function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      {/* 摘要卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonSummaryCard key={i} />
        ))}
      </div>
      {/* 图表 */}
      <div className="bg-white rounded-card border border-cream-200 p-6">
        <Skeleton className="h-5 w-24 mb-4" />
        <Skeleton className="h-[300px] w-full rounded-[14px]" />
      </div>
      {/* 两栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-card border border-cream-200 p-6 space-y-4">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton circle className="h-8 w-8" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2 w-20" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-card border border-cream-200 p-6 space-y-4">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2 w-20" />
              </div>
              <Skeleton className="h-6 w-20 rounded-tag" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonCard,
  SkeletonKanbanColumn,
  SkeletonDashboard,
};
