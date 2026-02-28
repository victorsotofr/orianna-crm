import { Skeleton } from '@/components/ui/skeleton';
import { SiteHeader } from '@/components/site-header';

export default function SettingsLoading() {
  return (
    <>
      <SiteHeader title="Settings" />
      <div className="page-container">
        <div className="flex flex-1 min-h-0">

          {/* Left nav skeleton */}
          <nav className="w-[160px] shrink-0 border-r py-4 px-4 lg:px-6 space-y-4">
            <div>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md mt-0.5" />
              <Skeleton className="h-7 w-full rounded-md mt-0.5" />
            </div>
            <div>
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md mt-0.5" />
            </div>
          </nav>

          {/* Content skeleton */}
          <div className="flex-1 py-4 px-6 lg:px-10">
            <div className="grid grid-cols-[200px_1fr] gap-10 max-w-3xl">
              <div>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-4 w-40 mt-2" />
                <Skeleton className="h-4 w-36 mt-1" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-3 w-10" />
                <div className="grid grid-cols-[1fr_72px] gap-2">
                  <Skeleton className="h-9 rounded" />
                  <Skeleton className="h-9 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-9 rounded" />
                  <Skeleton className="h-9 rounded" />
                </div>
                <Skeleton className="h-3 w-10 mt-2" />
                <div className="grid grid-cols-[1fr_72px] gap-2">
                  <Skeleton className="h-9 rounded" />
                  <Skeleton className="h-9 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-9 rounded" />
                  <Skeleton className="h-9 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
