"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SequenceTimeline } from "@/components/sequence-timeline"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import { Loader2, Save, Play, Pause, Users, Layers, CheckCircle, Trash2, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import type { Sequence, SequenceStep, Template, Contact } from "@/types/database"

interface SequenceDetail {
  sequence: Sequence
  steps: (SequenceStep & { templates?: { id: string; name: string; subject: string } | null })[]
  stats: { active: number; completed: number; total: number }
  enrolledContactIds: string[]
}

interface SequenceBuilderSheetProps {
  sequenceId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSequenceUpdated?: () => void
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Brouillon", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  paused: { label: "Pausée", variant: "outline" },
  archived: { label: "Archivée", variant: "destructive" },
}

export function SequenceBuilderSheet({
  sequenceId,
  open,
  onOpenChange,
  onSequenceUpdated,
}: SequenceBuilderSheetProps) {
  const router = useRouter()
  const [data, setData] = useState<SequenceDetail | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  // Enroll
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    if (sequenceId && open) {
      setLoading(true)
      fetchAll()
    }
  }, [sequenceId, open])

  const fetchAll = async () => {
    if (!sequenceId) return
    try {
      const [seqRes, tplRes, contactsRes] = await Promise.all([
        fetch(`/api/sequences/${sequenceId}`),
        fetch("/api/templates"),
        fetch("/api/contacts?limit=500"),
      ])

      if (seqRes.ok) {
        const d = await seqRes.json()
        setData(d)
        setName(d.sequence.name)
        setDescription(d.sequence.description || "")
      }
      if (tplRes.ok) {
        const { templates: tpls } = await tplRes.json()
        setTemplates(tpls || [])
      }
      if (contactsRes.ok) {
        const { contacts: cts } = await contactsRes.json()
        setContacts(cts || [])
      }
    } catch (error) {
      console.error("Error loading sequence:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!sequenceId) return
    setSaving(true)
    try {
      const response = await fetch(`/api/sequences/${sequenceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      })
      if (response.ok) {
        toast.success("Séquence mise à jour")
        onSequenceUpdated?.()
        fetchAll()
      } else {
        toast.error("Erreur lors de la mise à jour")
      }
    } catch {
      toast.error("Erreur lors de la mise à jour")
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async () => {
    if (!sequenceId) return
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/activate`, { method: "POST" })
      const result = await response.json()
      if (response.ok) {
        toast.success("Séquence activée")
        onSequenceUpdated?.()
        fetchAll()
      } else {
        toast.error(result.error || "Erreur lors de l'activation")
      }
    } catch {
      toast.error("Erreur lors de l'activation")
    }
  }

  const handlePause = async () => {
    if (!sequenceId) return
    try {
      const response = await fetch(`/api/sequences/${sequenceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      })
      if (response.ok) {
        toast.success("Séquence mise en pause")
        onSequenceUpdated?.()
        fetchAll()
      }
    } catch {
      toast.error("Erreur")
    }
  }

  const handleAddStep = async (
    stepData: { step_type: string; template_id: string | null; delay_days: number; instructions: string | null },
    insertAfterOrder?: number
  ) => {
    if (!sequenceId) return
    const response = await fetch(`/api/sequences/${sequenceId}/steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...stepData,
        insert_after_order: insertAfterOrder,
      }),
    })
    if (response.ok) {
      toast.success("Étape ajoutée")
      await fetchAll()
    } else {
      const result = await response.json()
      toast.error(result.error || "Erreur lors de l'ajout")
    }
  }

  const handleDeleteStep = async (stepId: string) => {
    if (!sequenceId || !confirm("Supprimer cette étape ?")) return
    const response = await fetch(`/api/sequences/${sequenceId}/steps/${stepId}`, { method: "DELETE" })
    if (response.ok) {
      toast.success("Étape supprimée")
      await fetchAll()
    } else {
      toast.error("Erreur lors de la suppression")
    }
  }

  const handleMoveStep = async (stepId: string, direction: "up" | "down") => {
    if (!sequenceId || !data) return
    const currentSteps = data.steps
    const idx = currentSteps.findIndex(s => s.id === stepId)
    if (idx === -1) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= currentSteps.length) return

    const stepA = currentSteps[idx]
    const stepB = currentSteps[swapIdx]

    try {
      await Promise.all([
        fetch(`/api/sequences/${sequenceId}/steps/${stepA.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step_order: stepB.step_order }),
        }),
        fetch(`/api/sequences/${sequenceId}/steps/${stepB.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step_order: stepA.step_order }),
        }),
      ])
      await fetchAll()
    } catch {
      toast.error("Erreur lors du déplacement")
    }
  }

  const handleDeleteSequence = async () => {
    if (!sequenceId || !confirm("Archiver cette séquence ?")) return
    try {
      const response = await fetch(`/api/sequences/${sequenceId}`, { method: "DELETE" })
      if (response.ok) {
        toast.success("Séquence archivée")
        onOpenChange(false)
        onSequenceUpdated?.()
      }
    } catch {
      toast.error("Erreur lors de la suppression")
    }
  }

  const handleEnroll = async () => {
    if (!sequenceId || selectedContacts.length === 0) {
      toast.error("Sélectionnez au moins un contact")
      return
    }
    setEnrolling(true)
    try {
      const response = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: selectedContacts }),
      })
      if (response.ok) {
        const result = await response.json()
        toast.success(`${result.enrolled} contact(s) inscrit(s)${result.skipped > 0 ? `, ${result.skipped} déjà inscrit(s)` : ""}`)
        setSelectedContacts([])
        fetchAll()
      } else {
        const result = await response.json()
        toast.error(result.error || "Erreur lors de l'inscription")
      }
    } catch {
      toast.error("Erreur lors de l'inscription")
    } finally {
      setEnrolling(false)
    }
  }

  if (!sequenceId) return null

  const sequence = data?.sequence
  const steps = data?.steps || []
  const stats = data?.stats || { active: 0, completed: 0, total: 0 }
  const enrolledSet = new Set(data?.enrolledContactIds || [])
  const badge = statusLabels[sequence?.status || "draft"] || statusLabels.draft
  const isDraft = sequence?.status === "draft"
  const isActive = sequence?.status === "active"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {loading ? "Chargement..." : name}
            {sequence && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </SheetTitle>
          <SheetDescription>
            {sequence && (
              <span className="font-mono text-xs">
                {steps.length} étape(s) &middot; {stats.active} actif(s) &middot; {stats.completed} terminé(s)
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="mt-4 space-y-4">
            {/* Open full page */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                router.push(`/sequences/${sequenceId}`)
              }}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Ouvrir en pleine page
            </Button>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {isDraft && (
                <Button size="sm" onClick={handleActivate} disabled={steps.length === 0}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Activer
                </Button>
              )}
              {isActive && (
                <Button variant="outline" size="sm" onClick={handlePause}>
                  <Pause className="mr-1.5 h-3.5 w-3.5" />
                  Pause
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Enregistrer
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="sm" onClick={handleDeleteSequence} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Archiver
              </Button>
            </div>

            {/* Stats bar */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground border rounded-md px-3 py-2">
              <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {steps.length} étapes</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {stats.active} actifs</span>
              <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3" /> {stats.completed} terminés</span>
            </div>

            <Tabs defaultValue="steps" className="space-y-3">
              <TabsList className="h-8">
                <TabsTrigger value="steps" className="text-xs">Étapes</TabsTrigger>
                <TabsTrigger value="enroll" className="text-xs">Inscrire</TabsTrigger>
                <TabsTrigger value="settings" className="text-xs">Paramètres</TabsTrigger>
              </TabsList>

              <TabsContent value="steps">
                <SequenceTimeline
                  steps={steps}
                  templates={templates}
                  onAddStep={handleAddStep}
                  onDeleteStep={handleDeleteStep}
                  onMoveStep={handleMoveStep}
                />
              </TabsContent>

              <TabsContent value="enroll" className="space-y-3">
                {!isActive ? (
                  <div className="border rounded-lg py-6 text-center text-sm text-muted-foreground">
                    La séquence doit être active pour inscrire des contacts.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {enrolledSet.size > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {enrolledSet.size} contact(s) déjà inscrit(s) dans cette séquence
                      </p>
                    )}
                    <div className="max-h-[250px] overflow-y-auto border rounded-lg p-2 space-y-0.5">
                      {contacts.map((contact) => {
                        const alreadyEnrolled = enrolledSet.has(contact.id)
                        return (
                          <label
                            key={contact.id}
                            className={`flex items-center gap-2 p-1.5 rounded text-sm ${alreadyEnrolled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedContacts.includes(contact.id)}
                              disabled={alreadyEnrolled}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedContacts([...selectedContacts, contact.id])
                                } else {
                                  setSelectedContacts(selectedContacts.filter((id) => id !== contact.id))
                                }
                              }}
                              className="rounded"
                            />
                            <span>{contact.first_name} {contact.last_name}</span>
                            <span className="text-xs text-muted-foreground font-mono">{contact.email}</span>
                            {alreadyEnrolled && <Badge variant="outline" className="text-[10px] ml-auto">Inscrit</Badge>}
                          </label>
                        )
                      })}
                      {contacts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">Aucun contact</p>
                      )}
                    </div>
                    <Button size="sm" onClick={handleEnroll} disabled={enrolling || selectedContacts.length === 0}>
                      {enrolling ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Users className="mr-1.5 h-3.5 w-3.5" />}
                      Inscrire {selectedContacts.length} contact(s)
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="settings" className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nom</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-sm" />
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Enregistrer
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
