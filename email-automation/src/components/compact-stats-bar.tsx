"use client"

interface Stat {
  label: string
  value: string | number
}

interface CompactStatsBarProps {
  stats: Stat[]
}

export function CompactStatsBar({ stats }: CompactStatsBarProps) {
  return (
    <div className="flex items-center gap-6 text-sm">
      {stats.map((stat, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-muted-foreground">{stat.label}</span>
          <span className="font-mono font-medium tabular-nums">{stat.value}</span>
        </div>
      ))}
    </div>
  )
}
