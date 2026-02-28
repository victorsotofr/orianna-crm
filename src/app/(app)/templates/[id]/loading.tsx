import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function TemplateEditLoading() {
  return (
    <>
      <SiteHeader title="Template" />
      <div className="page-container">
        <div className="page-content">
          <div className="flex items-center gap-3 shrink-0">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-6 w-40 rounded" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 flex-1 min-h-0">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-8 w-full rounded" />
              <Skeleton className="h-8 w-48 rounded" />
              <Skeleton className="h-[300px] w-full rounded" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-[100px] rounded-lg" />
              <Skeleton className="h-[60px] rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
