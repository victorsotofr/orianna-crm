"use client"

import { formatDistanceToNow } from "date-fns"
import { Mail, MessageSquare, UserPlus, ArrowRightLeft, Zap, Clock, CheckCircle, Brain, Reply, Inbox } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import type { ContactTimeline } from "@/types/database"

const eventIcons: Record<string, React.ElementType> = {
  created: UserPlus,
  email_sent: Mail,
  reply_sent: Reply,
  replied: Inbox,
  incoming_email: Inbox,
  comment: MessageSquare,
  status_changed: ArrowRightLeft,
  enrolled: Zap,
  completed: CheckCircle,
  manual_task: Clock,
  ai_scored: Brain,
  ai_personalized: Brain,
}

const eventColors: Record<string, string> = {
  created: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300",
  email_sent: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
  reply_sent: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900 dark:text-cyan-300",
  replied: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300",
  incoming_email: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300",
  comment: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-300",
  status_changed: "bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300",
  enrolled: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300",
  completed: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300",
  manual_task: "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-300",
  ai_scored: "bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300",
  ai_personalized: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-900 dark:text-fuchsia-300",
}

interface TimelineEvent extends ContactTimeline {
  team_members?: {
    display_name: string;
    email: string;
  } | null;
}

export function ContactDetailTimeline({ events }: { events: TimelineEvent[] }) {
  const { t, dateFnsLocale } = useTranslation()

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t.timeline.emptyState}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {events.map((event) => {
        const Icon = eventIcons[event.event_type] || Clock
        const colorClass = eventColors[event.event_type] || eventColors.manual_task

        return (
          <div key={event.id} className="flex gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{event.title}</p>
              {event.description && (
                <p className="text-sm text-muted-foreground truncate">{event.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {event.team_members?.display_name && (
                  <span className="font-medium">{event.team_members.display_name} &middot; </span>
                )}
                {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: dateFnsLocale })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
