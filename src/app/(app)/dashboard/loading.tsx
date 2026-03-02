import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function DashboardLoading() {
  return (
    <>
      <SiteHeader title="Dashboard" />
      <div className="page-container">
        <div className="page-content">
          {/* KPI cards skeleton */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] rounded-lg" />
            ))}
          </div>
          {/* Leaderboard skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="p-3 space-y-2">
                <Skeleton className="h-8 w-full rounded" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </div>
          </div>
          {/* Recent activity skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded" />
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="p-3 space-y-2">
                <Skeleton className="h-8 w-full rounded" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
