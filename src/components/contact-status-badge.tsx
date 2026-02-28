"use client"

import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n"

const statusStyles: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; className: string }> = {
  new: { variant: "secondary", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  contacted: { variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  replied: { variant: "secondary", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  qualified: { variant: "secondary", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  unqualified: { variant: "secondary", className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  do_not_contact: { variant: "destructive", className: "" },
}

export function ContactStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()

  const statusLabels: Record<string, string> = {
    new: t.statuses.new,
    contacted: t.statuses.contacted,
    replied: t.statuses.replied,
    qualified: t.statuses.qualified,
    unqualified: t.statuses.unqualified,
    do_not_contact: t.statuses.do_not_contact,
  }

  const style = statusStyles[status] || { variant: "outline" as const, className: "" }
  const label = statusLabels[status] || status

  return (
    <Badge variant={style.variant} className={style.className}>
      {label}
    </Badge>
  )
}
