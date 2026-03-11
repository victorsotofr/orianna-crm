"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, BriefcaseBusiness, Check, Copy, Download, Eye, Loader2, Mail, MailCheck, MessageSquare, UserPlus, ArrowRightLeft, Zap, Clock, CheckCircle, Brain, Reply, Inbox, RefreshCw, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api"
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
  meeting_prep: BriefcaseBusiness,
  email_bounced: AlertTriangle,
  email_soft_bounce: AlertTriangle,
  email_recovered: MailCheck,
  email_recovery_failed: XCircle,
  enriched: UserPlus,
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
  meeting_prep: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300",
  email_bounced: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
  email_soft_bounce: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300",
  email_recovered: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300",
  email_recovery_failed: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-300",
  enriched: "bg-teal-100 text-teal-600 dark:bg-teal-900 dark:text-teal-300",
}

interface TimelineEvent extends ContactTimeline {
  team_members?: {
    display_name: string;
    email: string;
  } | null;
}

interface MeetingPrepBrief {
  company_summary?: string
  contact_role?: string
  engagement_recap?: string
  recent_signals?: string[]
  talking_points?: string[]
  suggested_questions?: string[]
  red_flags?: string[]
}

export function ContactDetailTimeline({ events, contactId }: { events: TimelineEvent[]; contactId?: string }) {
  const { t, dateFnsLocale } = useTranslation()
  const [viewBrief, setViewBrief] = useState<{ brief: MeetingPrepBrief; createdAt: string } | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {t.timeline.emptyState}
      </p>
    )
  }

  async function handleRegenerate() {
    if (!contactId) return
    setRegenerating(true)
    toast.info(t.conversations.meetingPrep.backgroundNotice, { duration: 4000 })
    try {
      const response = await apiFetch(`/api/contacts/${contactId}/meeting-prep`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.meetingPrep.error)
      setViewBrief({ brief: data.brief, createdAt: new Date().toISOString() })
      toast.success(t.conversations.meetingPrep.ready)
    } catch (error: any) {
      toast.error(error.message || t.conversations.meetingPrep.error)
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        {events.map((event) => {
          const Icon = eventIcons[event.event_type] || Clock
          const colorClass = eventColors[event.event_type] || eventColors.manual_task
          const hasBrief = event.event_type === "meeting_prep" && event.metadata?.talking_points

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
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    {event.team_members?.display_name && (
                      <span className="font-medium">{event.team_members.display_name} &middot; </span>
                    )}
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: dateFnsLocale })}
                  </p>
                  {hasBrief && (
                    <button
                      onClick={() => setViewBrief({ brief: event.metadata as MeetingPrepBrief, createdAt: event.created_at })}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950"
                    >
                      <Eye className="h-3 w-3" />
                      {t.timeline.viewBrief}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {viewBrief && (
        <MeetingPrepDialog
          brief={viewBrief.brief}
          createdAt={viewBrief.createdAt}
          onClose={() => setViewBrief(null)}
          onRegenerate={contactId ? handleRegenerate : undefined}
          regenerating={regenerating}
        />
      )}
    </>
  )
}

function MeetingPrepDialog({ brief, createdAt, onClose, onRegenerate, regenerating }: {
  brief: MeetingPrepBrief
  createdAt: string
  onClose: () => void
  onRegenerate?: () => void
  regenerating?: boolean
}) {
  const { t, dateFnsLocale } = useTranslation()
  const [copied, setCopied] = useState(false)

  function buildPlainText() {
    const lines: string[] = [
      `MEETING BRIEF`,
      `${t.timeline.generatedOn} ${new Date(createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      "",
    ]
    if (brief.company_summary) lines.push(brief.company_summary, "")
    if (brief.contact_role) lines.push(brief.contact_role, "")
    if (brief.engagement_recap) lines.push(`${t.conversations.meetingPrep.engagement}: ${brief.engagement_recap}`, "")
    if (brief.recent_signals?.length) {
      lines.push(`${t.conversations.meetingPrep.signals}:`)
      brief.recent_signals.forEach(s => lines.push(`  - ${s}`))
      lines.push("")
    }
    if (brief.talking_points?.length) {
      lines.push(`${t.conversations.meetingPrep.talkingPoints}:`)
      brief.talking_points.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`))
      lines.push("")
    }
    if (brief.suggested_questions?.length) {
      lines.push(`${t.conversations.meetingPrep.questions}:`)
      brief.suggested_questions.forEach(q => lines.push(`  - ${q}`))
      lines.push("")
    }
    if (brief.red_flags?.length) {
      lines.push(`${t.conversations.meetingPrep.redFlags}:`)
      brief.red_flags.forEach(f => lines.push(`  - ${f}`))
    }
    return lines.join("\n")
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildPlainText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([buildPlainText()], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `meeting-brief-${new Date(createdAt).toISOString().split("T")[0]}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-[calc(100vw-80px)] max-w-none sm:max-w-none h-[calc(100vh-80px)] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5" />
            {t.conversations.meetingPrep.title}
            {regenerating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t.timeline.generatedOn} {formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: dateFnsLocale })}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {(brief.company_summary || brief.contact_role) && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              {brief.company_summary && <p className="text-sm text-muted-foreground">{brief.company_summary}</p>}
              {brief.contact_role && <p className="text-sm text-muted-foreground">{brief.contact_role}</p>}
            </div>
          )}

          {brief.engagement_recap && (
            <Section title={t.conversations.meetingPrep.engagement}>
              <p className="text-sm text-muted-foreground">{brief.engagement_recap}</p>
            </Section>
          )}

          {brief.recent_signals && brief.recent_signals.length > 0 && (
            <Section title={t.conversations.meetingPrep.signals}>
              <ul className="space-y-1">
                {brief.recent_signals.map((signal, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="shrink-0 text-primary">•</span>
                    {signal}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {brief.talking_points && brief.talking_points.length > 0 && (
            <Section title={t.conversations.meetingPrep.talkingPoints}>
              <ol className="space-y-1.5">
                {brief.talking_points.map((point, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 font-medium text-primary">{i + 1}.</span>
                    {point}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {brief.suggested_questions && brief.suggested_questions.length > 0 && (
            <Section title={t.conversations.meetingPrep.questions}>
              <ul className="space-y-1.5">
                {brief.suggested_questions.map((q, i) => (
                  <li key={i} className="text-sm italic text-muted-foreground">&ldquo;{q}&rdquo;</li>
                ))}
              </ul>
            </Section>
          )}

          {brief.red_flags && brief.red_flags.length > 0 && (
            <Section title={t.conversations.meetingPrep.redFlags}>
              <ul className="space-y-1.5">
                {brief.red_flags.map((flag, i) => (
                  <li key={i} className="flex gap-2 text-sm text-orange-600 dark:text-orange-400">
                    <span className="shrink-0">⚠</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? t.conversations.meetingPrep.copied : t.conversations.meetingPrep.copy}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              {t.conversations.meetingPrep.download}
            </Button>
            {onRegenerate && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onRegenerate} disabled={regenerating}>
                {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {regenerating ? t.conversations.meetingPrep.regenerating : t.conversations.meetingPrep.regenerate}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">{title}</p>
      {children}
    </div>
  )
}
