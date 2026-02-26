export function SiteHeader({ title = "Dashboard" }: { title?: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-1.5 px-4 lg:px-6">
        <h1 className="text-sm font-medium tracking-tight">{title}</h1>
      </div>
    </header>
  )
}
