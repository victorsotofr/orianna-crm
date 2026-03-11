"use client"

import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n"

const statusStyles: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; className: string }> = {
  new: { variant: "secondary", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  contacted: { variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  engaged: { variant: "secondary", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  qualified: { variant: "secondary", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  meeting_scheduled: { variant: "secondary", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  opportunity: { variant: "secondary", className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200" },
  customer: { variant: "secondary", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  lost: { variant: "secondary", className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  do_not_contact: { variant: "destructive", className: "" },
}

export function ContactStatusBadge({ status, emailBounced }: { status: string; emailBounced?: boolean }) {
  const { t } = useTranslation()

  const statusLabels: Record<string, string> = {
    new: t.statuses.new,
    contacted: t.statuses.contacted,
    engaged: t.statuses.engaged,
    qualified: t.statuses.qualified,
    meeting_scheduled: t.statuses.meeting_scheduled,
    opportunity: t.statuses.opportunity,
    customer: t.statuses.customer,
    lost: t.statuses.lost,
    do_not_contact: t.statuses.do_not_contact,
  }

  const style = statusStyles[status] || { variant: "outline" as const, className: "" }
  const label = statusLabels[status] || status

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={style.variant} className={style.className}>
        {label}
      </Badge>
      {emailBounced && (
        <Badge variant="outline" className="border-red-500 text-red-500 text-[10px] px-1.5 py-0 gap-0.5">
          <AlertTriangle className="h-3 w-3" />
          {t.bounce.bounced}
        </Badge>
      )}
    </div>
  )
}
