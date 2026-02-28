import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function ContactDetailLoading() {
  return (
    <>
      <SiteHeader title="Contact" />
      <div className="page-container">
        <div className="page-content overflow-y-auto">
          <div className="flex items-center gap-3 shrink-0">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 flex-1 min-h-0">
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <Skeleton className="h-4 w-24 rounded" />
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full rounded" />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <Skeleton className="h-4 w-20 rounded" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <Skeleton className="h-[120px] rounded-lg" />
              <Skeleton className="h-[120px] rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
