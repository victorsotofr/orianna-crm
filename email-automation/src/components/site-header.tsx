import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({ title = "Dashboard" }: { title?: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1.5 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1.5 h-4" />
        <h1 className="text-sm font-medium tracking-tight">{title}</h1>
      </div>
    </header>
  )
}
