import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function TemplatesLoading() {
  return (
    <>
      <SiteHeader title="Templates" />
      <div className="page-container">
        <div className="page-content">
          <div className="flex items-center justify-between gap-3 shrink-0">
            <Skeleton className="h-8 w-[120px] rounded" />
            <Skeleton className="h-8 w-[100px] rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
