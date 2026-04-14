/**
 * PageShimmer — 超轻量页面切换占位
 * 配合 SWR 预取使用：大多数情况下缓存已就绪，此组件闪过即消失
 * 比完整骨架屏更轻，减少视觉跳动
 */
export default function PageShimmer() {
  return (
    <div className="space-y-4 animate-pulse pt-2">
      <div className="h-5 w-32 bg-cream-200/40 rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 bg-cream-200/30 rounded-card" />
        ))}
      </div>
    </div>
  );
}
