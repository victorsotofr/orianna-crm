"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n"

const statusStyles: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; className: string }> = {
  pending: { variant: "outline", className: "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300" },
  sent: { variant: "secondary", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  delivered: { variant: "secondary", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200" },
  opened: { variant: "secondary", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" },
  replied: { variant: "secondary", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" },
  bounced: { variant: "destructive", className: "" },
  failed: { variant: "destructive", className: "" },
}

export function EmailStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()

  const labels: Record<string, string> = {
    pending: t.emailsTable.statuses.pending,
    sent: t.emailsTable.statuses.sent,
    delivered: t.emailsTable.statuses.delivered,
    opened: t.emailsTable.statuses.opened,
    replied: t.emailsTable.statuses.replied,
    bounced: t.emailsTable.statuses.bounced,
    failed: t.emailsTable.statuses.failed,
  }

  const style = statusStyles[status] || { variant: "outline" as const, className: "" }

  return (
    <Badge variant={style.variant} className={style.className}>
      {labels[status] || status}
    </Badge>
  )
}
