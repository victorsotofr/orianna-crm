import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function ContactsLoading() {
  return (
    <>
      <SiteHeader title="Contacts" />
      <div className="page-container">
        <div className="page-content">
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-1">
              <Skeleton className="h-8 w-[200px] rounded" />
              <Skeleton className="h-8 w-[140px] rounded" />
              <Skeleton className="h-8 w-[180px] rounded" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-[100px] rounded" />
              <Skeleton className="h-8 w-[90px] rounded" />
            </div>
          </div>
          <div className="flex-1 min-h-0 space-y-3">
            <div className="flex gap-2 shrink-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-[140px] rounded" />
              ))}
            </div>
            <div className="flex-1 rounded-lg border bg-card p-3 space-y-3">
              <Skeleton className="h-8 w-full rounded" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
