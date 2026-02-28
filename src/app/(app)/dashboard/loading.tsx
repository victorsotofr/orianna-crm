import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function DashboardLoading() {
  return (
    <>
      <SiteHeader title="Dashboard" />
      <div className="page-container">
        <div className="page-content">
          <div className="flex gap-3 shrink-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 flex-1 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[120px] rounded-lg shrink-0" />
          <Skeleton className="h-4 w-32 rounded shrink-0" />
          <div className="flex-1 min-h-0 rounded-lg border bg-card overflow-hidden">
            <div className="p-3 space-y-3">
              <Skeleton className="h-8 w-full rounded" />
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
