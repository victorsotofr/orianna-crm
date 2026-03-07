"use client"

import React, { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, formatDistanceToNow } from "date-fns"
import { CalendarPlus, Loader2, RefreshCw, Send, Sparkles, Trash2, UserRound } from "lucide-react"
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
import { SiteHeader } from "@/components/site-header"
import { apiFetch } from "@/lib/api"
import { useTranslation } from "@/lib/i18n"
import type { MailboxMessage, MailboxThread } from "@/types/database"

interface ConversationContact {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  status: string | null
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
  return (message.text_body || message.snippet || "").trim()
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [draftBody, setDraftBody] = useState("")
  const [meetingDialogOpen, setMeetingDialogOpen] = useState(false)
  const [meetingSummary, setMeetingSummary] = useState("")
  const [meetingDate, setMeetingDate] = useState("")
  const [meetingStartTime, setMeetingStartTime] = useState("14:00")
  const [meetingEndTime, setMeetingEndTime] = useState("14:30")
  const [extractingMeeting, setExtractingMeeting] = useState(false)
  const [creatingMeeting, setCreatingMeeting] = useState(false)
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

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null)
      setMessages([])
      return
    }

    void loadThread(selectedThreadId)
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
    if (!selectedThreadId) return

    setDeleting(true)
    try {
      const threadId = selectedThreadId
      const response = await apiFetch(`/api/conversations/${threadId}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t.conversations.deleteError)

      const remainingThreads = threads.filter((thread) => thread.id !== threadId)
      setThreads(remainingThreads)
      setSelectedThreadId(remainingThreads[0]?.id || null)
      setSelectedThread(null)
      setMessages([])
      setDraftBody("")
      setConfirmDeleteOpen(false)
      toast.success(t.conversations.deleteSuccess)
    } catch (error: any) {
      console.error("Delete conversation error:", error)
      toast.error(error.message || t.conversations.deleteError)
    } finally {
      setDeleting(false)
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
      <SiteHeader title={t.conversations.title} />
      <div className="page-container">
        <div className="page-content">
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div>
              <h2 className="text-base font-semibold">{t.conversations.inbox}</h2>
              <p className="text-sm text-muted-foreground">
                {contactId ? t.conversations.filteredToContact : t.conversations.subtitle}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleSync(false)} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {syncing ? t.conversations.syncing : t.common.refresh}
            </Button>
          </div>

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
                    <button
                      key={thread.id}
                      className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                        thread.id === selectedThreadId ? "bg-muted/60" : ""
                      }`}
                      onClick={() => setSelectedThreadId(thread.id)}
                    >
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
                    </button>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDeleteOpen(true)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t.conversations.delete}
                      </Button>
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
                                className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm ${
                                  inbound
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

                  <div className="border-t px-4 py-4">
                    <div className="mb-3">
                      <p className="text-sm font-medium">{t.conversations.directReply}</p>
                    </div>
                    <div className="space-y-3">
                      <Textarea
                        value={draftBody}
                        onChange={(event) => setDraftBody(event.target.value)}
                        placeholder={t.conversations.replyPlaceholder}
                        className="min-h-[160px]"
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" onClick={handleSuggestReply} disabled={suggesting || !selectedThreadId}>
                          {suggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                          {suggesting ? t.conversations.suggestingReply : t.conversations.suggestReply}
                        </Button>
                        <Button onClick={handleSendReply} disabled={sending || !draftBody.trim() || !selectedThread?.contact_id}>
                          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                          {sending ? t.conversations.replying : t.common.send}
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
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
    </>
  )
}
