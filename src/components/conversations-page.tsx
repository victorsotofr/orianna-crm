"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import { AlertTriangle, BriefcaseBusiness, CalendarPlus, Check, Copy, Download, Loader2, MailSearch, RefreshCw, Send, Sparkles, Trash2, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmailStatusBadge } from "@/components/email-status-badge"
import { apiFetch } from "@/lib/api"
import { stripQuotedReplyHistory } from "@/lib/email-content"
import { useTranslation } from "@/lib/i18n"
import type { MailboxMessage, MailboxThread } from "@/types/database"

interface ConversationContact {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  status: string | null
  email_bounced: boolean | null
  bounce_reason: string | null
  email_recovery_count: number | null
}

interface ConversationThread extends MailboxThread {
  contacts?: ConversationContact | null
}

interface ConversationMessage extends MailboxMessage {
  emails_sent?: {
    status: string
    opened_at: string | null
    replied_at: string | null
  } | null
}

function getDisplayName(thread: ConversationThread) {
  const fullName = [thread.contacts?.first_name, thread.contacts?.last_name].filter(Boolean).join(" ").trim()
  if (fullName) return fullName
  if (thread.contacts?.email) return thread.contacts.email
  const participant = thread.participants?.[0]
  return participant?.name || participant?.email || "Conversation"
}

function getSubline(thread: ConversationThread) {
  return thread.contacts?.company_name || thread.contacts?.email || thread.participants?.[0]?.email || ""
}

function getMessageBody(message: ConversationMessage) {
  const raw = (message.text_body || message.snippet || "").trim()
  // Strip quoted reply history so the thread reads cleanly
  return stripQuotedReplyHistory(raw)
}

export function ConversationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const contactId = searchParams.get("contactId")
  const { t, dateFnsLocale } = useTranslation()

  const [threads, setThreads] = useState<ConversationThread[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [sending, setSending] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draftBody, setDraftBody] = useState("")
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false)
  const [meetingSummary, setMeetingSummary] = useState("")
  const [meetingDate, setMeetingDate] = useState("")
  const [meetingStartTime, setMeetingStartTime] = useState("14:00")
  const [meetingEndTime, setMeetingEndTime] = useState("14:30")
  const [extractingMeeting, setExtractingMeeting] = useState(false)
  const [creatingMeeting, setCreatingMeeting] = useState(false)
  const [meetingPrepOpen, setMeetingPrepOpen] = useState(false)
  const [meetingPrepLoading, setMeetingPrepLoading] = useState(false)
  const [meetingPrepData, setMeetingPrepData] = useState<{
    brief: {
      company_summary: string
      contact_role: string
      engagement_recap: string
      recent_signals: string[]
      talking_points: string[]
      suggested_questions: string[]
      red_flags: string[]
    }
    contact: { name: string; company: string; jobTitle: string; score: number | null; scoreLabel: string | null }
    hasWebResearch: boolean
  } | null>(null)
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null)
  const syncingRef = React.useRef(false)

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return threads

    return threads.filter((thread) => {
      const haystack = [
        getDisplayName(thread),
        getSubline(thread),
        thread.subject,
        thread.snippet,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return haystack.includes(query)
    })
  }, [search, threads])

  useEffect(() => {
    void loadThreads(true)
  }, [contactId])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void handleSync(true)
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null)
      setMessages([])
      return
    }

    setMeetingPrepData(null)
    void loadThread(selectedThreadId)
    void fetchExistingMeetingPrep(selectedThreadId)
  }, [selectedThreadId])

  async function loadThreads(triggerSync: boolean) {
    setLoading(true)
    try {
      const query = new URLSearchParams()
      if (contactId) query.set("contact_id", contactId)

      const response = await apiFetch(`/api/conversations?${query.toString()}`)
      if (!response.ok) throw new Error((await response.json()).error || t.conversations.loadError)

      const data = await response.json()
      const nextThreads = data.threads || []
      setThreads(nextThreads)

      setSelectedThreadId((current) => {
        if (current && nextThreads.some((thread: ConversationThread) => thread.id === current)) {
          return current
        }
        return nextThreads[0]?.id || null
      })

      if (triggerSync) {
        void handleSync(true)
      }
    } catch (error: any) {
      console.error("Conversations load error:", error)
      toast.error(error.message || t.conversations.loadError)
    } finally {
      setLoading(false)
    }
  }

  async function loadThread(threadId: string) {
    setDetailLoading(true)
    try {
      const response = await apiFetch(`/api/conversations/${threadId}`)
      if (!response.ok) throw new Error((await response.json()).error || t.conversations.loadError)

      const data = await response.json()
      setSelectedThread(data.thread)
      setMessages(data.messages || [])
      setThreads((current) =>
        current.map((thread) =>
          thread.id === threadId
            ? {
              ...thread,
              unread_count: 0,
            }
            : thread
        )
      )
      setDraftBody("")
    } catch (error: any) {
      console.error("Conversation detail error:", error)
      toast.error(error.message || t.conversations.loadError)
    } finally {
      setDetailLoading(false)
    }
  }

  async function fetchExistingMeetingPrep(threadId: string) {
    try {
      const response = await apiFetch(`/api/conversations/${threadId}/meeting-prep`)
      if (!response.ok) return
      const data = await response.json()
      if (data.exists) {
        setMeetingPrepData({
          brief: data.brief,
          contact: data.contact,
          hasWebResearch: data.hasWebResearch,
        })
      }
    } catch {
      // Silently fail — not critical
    }
  }

  async function handleSync(silent = false) {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const response = await apiFetch("/api/conversations/sync", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.syncError)

      if (!silent) {
        const stored = data.result?.stored || 0
        if (stored > 0) {
          toast.success(t.conversations.syncSuccess(stored))
        } else {
          toast.message(t.conversations.syncNoChanges)
        }
      }

      // Handle bounce notifications
      const bounces = data.result?.detectedBounces || []
      for (const bounce of bounces) {
        if (bounce.isHardBounce) {
          toast.error(t.bounce.detected, {
            description: `${bounce.failedEmail} — ${bounce.bounceReason}`,
            duration: 10000,
            action: {
              label: t.bounce.recoverButton,
              onClick: () => {
                void triggerBounceRecovery(bounce.contactId)
              },
            },
          })
        }
      }

      await loadThreads(false)
      if (selectedThreadId) {
        await loadThread(selectedThreadId)
      }
    } catch (error: any) {
      console.error("Conversation sync error:", error)
      if (!silent) {
        toast.error(error.message || t.conversations.syncError)
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }

  async function triggerBounceRecovery(contactId: string) {
    toast.info(t.bounce.recovering, { duration: 5000 })
    try {
      const response = await apiFetch(`/api/contacts/${contactId}/recover-email`, { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Recovery failed")

      if (data.recovered) {
        const msg = data.resent
          ? t.bounce.recovered.replace("{email}", data.newEmail)
          : t.bounce.recoveredNoResend.replace("{email}", data.newEmail)
        toast.success(msg, { duration: 10000 })
      } else {
        toast.error(t.bounce.recoveryFailed.replace("{name}", contactId), { duration: 8000 })
      }
    } catch (error: any) {
      toast.error(error.message || "Recovery failed")
    }
  }

  async function handleSuggestReply() {
    if (!selectedThreadId) return

    setSuggesting(true)
    try {
      const response = await apiFetch(`/api/conversations/${selectedThreadId}/suggest-reply`, {
        method: "POST",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.suggestError)

      setDraftBody(data.draft || "")

      // If AI proposed a meeting, open the meeting dialog pre-filled for user confirmation
      if (data.meetingProposal) {
        const proposal = data.meetingProposal
        if (proposal.summary) setMeetingSummary(proposal.summary)
        if (proposal.start) {
          const startDate = new Date(proposal.start)
          setMeetingDate(startDate.toISOString().split("T")[0])
          setMeetingStartTime(startDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false }))
        }
        if (proposal.end) {
          const endDate = new Date(proposal.end)
          setMeetingEndTime(endDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false }))
        }
        setMeetingDialogOpen(true)
        toast.info(t.conversations.meetingDialog.proposalReady)
      }
    } catch (error: any) {
      console.error("Suggest reply error:", error)
      toast.error(error.message || t.conversations.suggestError)
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSendReply() {
    if (!selectedThreadId || !draftBody.trim()) return

    setSending(true)
    try {
      const response = await apiFetch(`/api/conversations/${selectedThreadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: draftBody,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.replyError)

      toast.success(t.conversations.replySent)
      setDraftBody("")
      await loadThreads(false)
      await loadThread(selectedThreadId)
    } catch (error: any) {
      console.error("Send reply error:", error)
      toast.error(error.message || t.conversations.replyError)
    } finally {
      setSending(false)
    }
  }

  async function handleDeleteConversation() {
    const threadId = deleteThreadId
    if (!threadId) return

    setDeleting(true)
    try {
      const response = await apiFetch(`/api/conversations/${threadId}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.deleteError)

      const remainingThreads = threads.filter((thread) => thread.id !== threadId)
      setThreads(remainingThreads)
      if (selectedThreadId === threadId) {
        setSelectedThreadId(remainingThreads[0]?.id || null)
        setSelectedThread(null)
        setMessages([])
        setDraftBody("")
      }
      setDeleteThreadId(null)
      toast.success(t.conversations.deleteSuccess)
    } catch (error: any) {
      console.error("Delete conversation error:", error)
      toast.error(error.message || t.conversations.deleteError)
    } finally {
      setDeleting(false)
    }
  }

  async function handleMeetingPrep() {
    if (!selectedThreadId) return

    // If we already have data, just show it
    if (meetingPrepData) {
      setMeetingPrepOpen(true)
      return
    }

    generateMeetingPrep()
  }

  async function generateMeetingPrep() {
    if (!selectedThreadId) return

    setMeetingPrepLoading(true)
    setMeetingPrepData(null)
    setMeetingPrepOpen(true)
    toast.info(t.conversations.meetingPrep.backgroundNotice, { duration: 4000 })
    try {
      const response = await apiFetch(`/api/conversations/${selectedThreadId}/meeting-prep`, {
        method: "POST",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.meetingPrep.error)
      setMeetingPrepData(data)
      toast.success(t.conversations.meetingPrep.ready)
    } catch (error: any) {
      console.error("Meeting prep error:", error)
      toast.error(error.message || t.conversations.meetingPrep.error)
      if (!meetingPrepData) setMeetingPrepOpen(false)
    } finally {
      setMeetingPrepLoading(false)
    }
  }

  async function openMeetingDialog() {
    if (!selectedThreadId) return

    // Show dialog immediately with defaults while AI extracts
    const contact = selectedThread?.contacts
    const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ")
    setMeetingSummary(contactName ? `Call ${contactName} - Orianna` : "Call - Orianna")
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setMeetingDate(tomorrow.toISOString().split("T")[0])
    setMeetingStartTime("14:00")
    setMeetingEndTime("14:30")
    setMeetingDialogOpen(true)
    setExtractingMeeting(true)

    try {
      const response = await apiFetch(`/api/conversations/${selectedThreadId}/extract-meeting`, {
        method: "POST",
      })
      if (response.ok) {
        const data = await response.json()
        if (data.summary) setMeetingSummary(data.summary)
        if (data.date) setMeetingDate(data.date)
        if (data.startTime) setMeetingStartTime(data.startTime)
        if (data.endTime) setMeetingEndTime(data.endTime)
      }
    } catch (error) {
      console.error("Extract meeting error:", error)
    } finally {
      setExtractingMeeting(false)
    }
  }

  async function handleCreateMeeting() {
    if (!selectedThread || !meetingSummary.trim() || !meetingDate || !meetingStartTime || !meetingEndTime) return

    setCreatingMeeting(true)
    try {
      const start = `${meetingDate}T${meetingStartTime}:00`
      const end = `${meetingDate}T${meetingEndTime}:00`
      const contact = selectedThread.contacts

      const response = await apiFetch("/api/google-calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: meetingSummary,
          start,
          end,
          attendees: contact?.email ? [contact.email] : [],
          contactId: selectedThread.contact_id || undefined,
          threadId: selectedThread.id,
          createMeet: true,
          sendUpdates: "all",
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.meetingDialog.error)

      const meetUrl = data.event?.meetUrl
      if (meetUrl) {
        // Replace {{meet_link}} placeholder or insert the Meet link into the draft
        setDraftBody((prev) => {
          if (prev.includes("{{meet_link}}")) {
            return prev.replace(/\{\{meet_link\}\}/g, meetUrl)
          }
          // Fallback: insert before sign-off or append
          const link = `\nGoogle Meet : ${meetUrl}`
          if (prev.includes(meetUrl)) return prev
          const signOffPattern = /\n\n(Bien [àa] vous|Cordialement|Best regards|Regards|Cdlt)[,.]?\s*\n/i
          const match = prev.match(signOffPattern)
          if (match?.index != null) {
            return prev.slice(0, match.index) + "\n" + link + prev.slice(match.index)
          }
          return prev.trimEnd() + "\n" + link
        })
        toast.success(
          <div>
            <p>{t.conversations.meetingDialog.success}</p>
            <a href={meetUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
              {t.conversations.meetingDialog.meetLink}: {meetUrl}
            </a>
          </div>,
          { duration: 8000 }
        )
      } else {
        toast.success(t.conversations.meetingDialog.success)
      }

      setMeetingDialogOpen(false)
    } catch (error: any) {
      console.error("Create meeting error:", error)
      toast.error(error.message || t.conversations.meetingDialog.error)
    } finally {
      setCreatingMeeting(false)
    }
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b">
        <div className="flex w-full items-center justify-between gap-1.5 px-4 lg:px-6">
          <h1 className="text-sm font-medium tracking-tight">{t.conversations.title}</h1>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleSync(false)} disabled={syncing}>
            {syncing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            {syncing ? t.conversations.syncing : t.common.refresh}
          </Button>
        </div>
      </header>
      <div className="page-container">
        <div className="page-content">

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col rounded-xl border bg-card">
              <div className="border-b p-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.conversations.searchPlaceholder}
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.common.loading}
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                    {t.conversations.emptyState}
                  </div>
                ) : (
                  filteredThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className={`group relative w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer ${thread.id === selectedThreadId ? "bg-muted/60" : ""
                        }`}
                      onClick={() => setSelectedThreadId(thread.id)}
                    >
                      <button
                        className="absolute right-2 bottom-2 hidden rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteThreadId(thread.id)
                        }}
                        title={t.conversations.delete}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{getDisplayName(thread)}</p>
                          <p className="truncate text-xs text-muted-foreground">{getSubline(thread)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: true, locale: dateFnsLocale })}
                          </p>
                          {thread.unread_count > 0 && (
                            <span className="mt-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                              {thread.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 truncate text-xs font-medium text-foreground/90">
                        {thread.subject || t.conversations.noSubject}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{thread.snippet || t.conversations.noPreview}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col rounded-xl border bg-card">
              {!selectedThread ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {t.conversations.noSelection}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{getDisplayName(selectedThread)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedThread.subject || t.conversations.noSubject}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedThread.contact_id && (
                        <Button variant="outline" size="sm" onClick={handleMeetingPrep} disabled={meetingPrepLoading}>
                          {meetingPrepLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <BriefcaseBusiness className="mr-2 h-4 w-4" />
                          )}
                          {t.conversations.meetingPrep.button}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={openMeetingDialog} disabled={extractingMeeting}>
                        {extractingMeeting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CalendarPlus className="mr-2 h-4 w-4" />
                        )}
                        {t.conversations.scheduleMeeting}
                      </Button>
                      {selectedThread.contact_id && (
                        <Button variant="outline" size="sm" onClick={() => router.push(`/contacts/${selectedThread.contact_id}`)}>
                          <UserRound className="mr-2 h-4 w-4" />
                          {t.conversations.openContact}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Bounce alert banner */}
                  {selectedThread.contacts?.email_bounced && (
                    <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-destructive">{t.bounce.detected}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {selectedThread.contacts.bounce_reason || selectedThread.contacts.email}
                        </p>
                      </div>
                      {(selectedThread.contacts.email_recovery_count || 0) < 3 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => selectedThread.contact_id && triggerBounceRecovery(selectedThread.contact_id)}
                        >
                          <MailSearch className="mr-1.5 h-3.5 w-3.5" />
                          {t.bounce.recoverButton}
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    {detailLoading ? (
                      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t.common.loading}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                        {t.conversations.noMessages}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((message) => {
                          const inbound = message.direction === "inbound"
                          return (
                            <div
                              key={message.id}
                              className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                            >
                              <div
                                className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm ${inbound
                                  ? "bg-muted text-foreground"
                                  : "bg-primary text-primary-foreground"
                                  }`}
                              >
                                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] opacity-80">
                                  <span className="font-medium">
                                    {inbound ? message.from_name || message.from_email || t.conversations.contact : t.conversations.you}
                                  </span>
                                  <span>{format(new Date(message.message_at), "dd MMM yyyy HH:mm", { locale: dateFnsLocale })}</span>
                                  {message.is_auto_reply && (
                                    <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px]">
                                      {t.conversations.autoReply}
                                    </span>
                                  )}
                                  {!inbound && message.email_sent_id && (
                                    <EmailStatusBadge status={message.emails_sent?.status || "sent"} />
                                  )}
                                </div>
                                <div className="whitespace-pre-wrap text-sm leading-6">
                                  {getMessageBody(message) || t.conversations.noPreview}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="px-4 py-3">
                    <div className="rounded-xl border bg-background shadow-sm">
                      <Textarea
                        value={draftBody}
                        onChange={(event) => setDraftBody(event.target.value)}
                        placeholder={t.conversations.replyPlaceholder}
                        className="min-h-[40px] border-0 shadow-none focus-visible:ring-0 resize-none rounded-xl rounded-b-none"
                      />
                      <div className="flex items-center justify-between px-3 py-2">
                        <button
                          type="button"
                          onClick={handleSuggestReply}
                          disabled={suggesting || !selectedThreadId}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          {suggesting ? t.conversations.suggestingReply : t.conversations.suggestReply}
                        </button>
                        <button
                          type="button"
                          onClick={handleSendReply}
                          disabled={sending || !draftBody.trim() || !selectedThread?.contact_id}
                          className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                          {sending ? t.conversations.replying : t.common.send}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={!!deleteThreadId} onOpenChange={(open) => { if (!open) setDeleteThreadId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.conversations.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.conversations.deleteConfirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteConversation} disabled={deleting}>
              {deleting ? t.conversations.deleting : t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={meetingDialogOpen} onOpenChange={setMeetingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t.conversations.meetingDialog.title}
              {extractingMeeting && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t.conversations.meetingDialog.summary}</Label>
              <Input
                value={meetingSummary}
                onChange={(e) => setMeetingSummary(e.target.value)}
                placeholder={t.conversations.meetingDialog.summaryPlaceholder}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t.conversations.meetingDialog.date}</Label>
              <Input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t.conversations.meetingDialog.startTime}</Label>
                <Input
                  type="time"
                  value={meetingStartTime}
                  onChange={(e) => setMeetingStartTime(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t.conversations.meetingDialog.endTime}</Label>
                <Input
                  type="time"
                  value={meetingEndTime}
                  onChange={(e) => setMeetingEndTime(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleCreateMeeting}
              disabled={creatingMeeting || !meetingSummary.trim() || !meetingDate}
            >
              {creatingMeeting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="mr-2 h-4 w-4" />
              )}
              {creatingMeeting ? t.conversations.meetingDialog.creating : t.conversations.meetingDialog.create}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={meetingPrepOpen} onOpenChange={setMeetingPrepOpen}>
        <DialogContent className="w-[calc(100vw-80px)] max-w-none sm:max-w-none h-[calc(100vh-80px)] flex flex-col overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="h-5 w-5" />
              {t.conversations.meetingPrep.title}
              {meetingPrepLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </DialogTitle>
          </DialogHeader>
          {meetingPrepLoading && !meetingPrepData ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p>{t.conversations.meetingPrep.loading}</p>
            </div>
          ) : meetingPrepData ? (
            <MeetingPrepContent data={meetingPrepData} t={t} onRegenerate={generateMeetingPrep} regenerating={meetingPrepLoading} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function MeetingPrepContent({ data, t, onRegenerate, regenerating }: { data: NonNullable<ReturnType<typeof useMeetingPrepData>>; t: ReturnType<typeof useTranslation>["t"]; onRegenerate: () => void; regenerating: boolean }) {
  const [copied, setCopied] = useState(false)
  const brief = data.brief
  const contact = data.contact

  function buildPlainText() {
    return [
      `MEETING BRIEF - ${contact.name}`,
      contact.company ? `${t.conversations.meetingPrep.company}: ${contact.company}` : "",
      contact.jobTitle ? `${t.conversations.meetingPrep.role}: ${contact.jobTitle}` : "",
      contact.score != null ? `Score: ${contact.score}/100 (${contact.scoreLabel})` : "",
      "",
      brief.company_summary,
      "",
      brief.engagement_recap,
      "",
      brief.recent_signals.length > 0 ? `${t.conversations.meetingPrep.signals}:\n${brief.recent_signals.map(s => `  - ${s}`).join("\n")}` : "",
      "",
      `${t.conversations.meetingPrep.talkingPoints}:\n${brief.talking_points.map(p => `  - ${p}`).join("\n")}`,
      "",
      brief.suggested_questions.length > 0 ? `${t.conversations.meetingPrep.questions}:\n${brief.suggested_questions.map(q => `  - ${q}`).join("\n")}` : "",
      "",
      brief.red_flags.length > 0 ? `${t.conversations.meetingPrep.redFlags}:\n${brief.red_flags.map(f => `  - ${f}`).join("\n")}` : "",
    ].filter(Boolean).join("\n")
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
    a.download = `meeting-brief-${contact.name.replace(/\s+/g, "-").toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-semibold">{contact.name}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {contact.company && <span>{contact.company}</span>}
          {contact.jobTitle && <span>{contact.jobTitle}</span>}
          {contact.score != null && (
            <span className={`font-medium ${contact.scoreLabel === "HOT" ? "text-red-500" : contact.scoreLabel === "WARM" ? "text-orange-500" : "text-blue-500"}`}>
              {contact.score}/100 ({contact.scoreLabel})
            </span>
          )}
        </div>
        {brief.company_summary && brief.company_summary !== "N/A" && (
          <p className="mt-2 text-xs text-muted-foreground">{brief.company_summary}</p>
        )}
      </div>

      {/* Engagement */}
      {brief.engagement_recap && brief.engagement_recap !== "Données insuffisantes" && (
        <Section title={t.conversations.meetingPrep.engagement}>
          <p className="text-sm text-muted-foreground">{brief.engagement_recap}</p>
        </Section>
      )}

      {/* Recent Signals */}
      {brief.recent_signals.length > 0 && (
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

      {/* Talking Points */}
      {brief.talking_points.length > 0 && (
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

      {/* Suggested Questions */}
      {brief.suggested_questions.length > 0 && (
        <Section title={t.conversations.meetingPrep.questions}>
          <ul className="space-y-1.5">
            {brief.suggested_questions.map((q, i) => (
              <li key={i} className="text-sm italic text-muted-foreground">&ldquo;{q}&rdquo;</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Red Flags */}
      {brief.red_flags.length > 0 && (
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

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? t.conversations.meetingPrep.copied : t.conversations.meetingPrep.copy}
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" />
          {t.conversations.meetingPrep.download}
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {regenerating ? t.conversations.meetingPrep.regenerating : t.conversations.meetingPrep.regenerate}
        </Button>
      </div>

      {data.hasWebResearch && (
        <p className="text-center text-[11px] text-muted-foreground">{t.conversations.meetingPrep.webResearchNote}</p>
      )}
    </div>
  )
}

function useMeetingPrepData() {
  return null as {
    brief: {
      company_summary: string
      contact_role: string
      engagement_recap: string
      recent_signals: string[]
      talking_points: string[]
      suggested_questions: string[]
      red_flags: string[]
    }
    contact: { name: string; company: string; jobTitle: string; score: number | null; scoreLabel: string | null }
    hasWebResearch: boolean
  } | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">{title}</p>
      {children}
    </div>
  )
}
