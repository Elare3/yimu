import { Skeleton } from '@/components/ui/Skeleton';

export default function SettingsLoading() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-card border border-cream-200 p-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-full rounded-[14px]" />
        <Skeleton className="h-10 w-full rounded-[14px]" />
        <Skeleton className="h-10 w-32 rounded-button" />
      </div>
    </div>
  );
}
