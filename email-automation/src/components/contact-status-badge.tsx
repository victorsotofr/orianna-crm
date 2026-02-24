"use client"

import { Badge } from "@/components/ui/badge"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className: string }> = {
  new: { label: "Nouveau", variant: "secondary", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  contacted: { label: "Contacté", variant: "secondary", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  replied: { label: "Répondu", variant: "secondary", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  qualified: { label: "Qualifié", variant: "secondary", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  unqualified: { label: "Non qualifié", variant: "secondary", className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  do_not_contact: { label: "Ne pas contacter", variant: "destructive", className: "" },
}

export function ContactStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, variant: "outline" as const, className: "" }

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  )
}
