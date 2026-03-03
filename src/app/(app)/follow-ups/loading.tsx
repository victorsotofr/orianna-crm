import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function FollowUpsLoading() {
  return (
    <>
      <SiteHeader title="Relances" />
      <div className="page-container">
        <div className="page-content">
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-[100px] rounded" />
              <Skeleton className="h-8 w-[100px] rounded" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-[160px] rounded" />
              <Skeleton className="h-8 w-[100px] rounded" />
            </div>
          </div>
          <div className="flex-1 min-h-0 rounded-lg border bg-card p-3 space-y-3">
            <Skeleton className="h-8 w-full rounded" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
