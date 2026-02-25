"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ContactStatusBadge } from "@/components/contact-status-badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { toast } from "sonner"
import { Save, Loader2, Trash2, Mail, Building2, Phone, MessageSquare, UserCheck } from "lucide-react"
import type { Contact, Comment, TeamMember } from "@/types/database"

interface ContactDetailSheetProps {
  contactId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onContactUpdated?: () => void
  onContactDeleted?: () => void
}

export function ContactDetailSheet({
  contactId,
  open,
  onOpenChange,
  onContactUpdated,
  onContactDeleted,
}: ContactDetailSheetProps) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [comments, setComments] = useState<(Comment & { team_members?: { display_name: string } })[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newComment, setNewComment] = useState("")
  const [postingComment, setPostingComment] = useState(false)

  // Editable fields
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [phone, setPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState("new")
  const [assignedTo, setAssignedTo] = useState<string>("unassigned")

  useEffect(() => {
    if (contactId && open) {
      setLoading(true)
      fetchContact()
    }
  }, [contactId, open])

  const fetchContact = async () => {
    if (!contactId) return
    try {
      const [contactRes, commentsRes, teamRes] = await Promise.all([
        fetch(`/api/contacts/${contactId}`),
        fetch(`/api/comments?contact_id=${contactId}`),
        fetch('/api/contacts?limit=1&include_team=true'),
      ])

      if (contactRes.ok) {
        const { contact: c } = await contactRes.json()
        setContact(c)
        setFirstName(c.first_name || "")
        setLastName(c.last_name || "")
        setEmail(c.email || "")
        setCompanyName(c.company_name || "")
        setJobTitle(c.job_title || "")
        setPhone(c.phone || "")
        setNotes(c.notes || "")
        setStatus(c.status || "new")
        setAssignedTo(c.assigned_to || "unassigned")
      }

      if (commentsRes.ok) {
        const { comments: cmts } = await commentsRes.json()
        setComments(cmts)
      }

      if (teamRes.ok) {
        const data = await teamRes.json()
        if (data.teamMembers) setTeamMembers(data.teamMembers)
      }
    } catch (error) {
      console.error("Error fetching contact:", error)
      toast.error("Erreur lors du chargement")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!contactId) return
    setSaving(true)
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          company_name: companyName,
          job_title: jobTitle,
          phone,
          notes,
          status,
          assigned_to: assignedTo === "unassigned" ? null : assignedTo,
        }),
      })

      if (response.ok) {
        toast.success("Contact mis à jour")
        onContactUpdated?.()
      } else {
        const data = await response.json()
        toast.error(data.error || "Erreur lors de la mise à jour")
      }
    } catch {
      toast.error("Erreur lors de la mise à jour")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!contactId || !confirm("Supprimer ce contact ?")) return

    try {
      const response = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" })
      if (response.ok) {
        toast.success("Contact supprimé")
        onOpenChange(false)
        onContactDeleted?.()
      } else {
        toast.error("Erreur lors de la suppression")
      }
    } catch {
      toast.error("Erreur lors de la suppression")
    }
  }

  const handlePostComment = async () => {
    if (!newComment.trim() || !contactId) return
    setPostingComment(true)
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, content: newComment }),
      })

      if (response.ok) {
        setNewComment("")
        toast.success("Commentaire ajouté")
        const commentsRes = await fetch(`/api/comments?contact_id=${contactId}`)
        if (commentsRes.ok) setComments((await commentsRes.json()).comments)
      }
    } catch {
      toast.error("Erreur lors de l'ajout du commentaire")
    } finally {
      setPostingComment(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {loading ? "Chargement..." : `${firstName} ${lastName}`}
          </SheetTitle>
          <SheetDescription>
            {email && <span className="font-mono text-xs">{email}</span>}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contact ? (
          <div className="space-y-5 mt-4">
            {/* Status + actions */}
            <div className="flex items-center justify-between">
              <ContactStatusBadge status={status} />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                  Enregistrer
                </Button>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Prénom</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Nom</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-sm font-mono" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Entreprise
                </Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Poste</Label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Téléphone
                </Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Statut</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Nouveau</SelectItem>
                    <SelectItem value="contacted">Contacté</SelectItem>
                    <SelectItem value="replied">Répondu</SelectItem>
                    <SelectItem value="qualified">Qualifié</SelectItem>
                    <SelectItem value="unqualified">Non qualifié</SelectItem>
                    <SelectItem value="do_not_contact">Ne pas contacter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Owner assignment */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <UserCheck className="h-3 w-3" /> Propriétaire
              </Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Non assigné" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Non assigné</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.display_name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Notes..."
                className="text-sm"
              />
            </div>

            {/* Comments */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Commentaires ({comments.length})
              </h4>
              <div className="flex gap-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  rows={2}
                  className="flex-1 text-sm"
                />
                <Button
                  size="sm"
                  onClick={handlePostComment}
                  disabled={postingComment || !newComment.trim()}
                  className="self-end"
                >
                  {postingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Envoyer"}
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="border-l-2 border-muted pl-3 py-1.5">
                    <p className="text-sm">{comment.content}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {comment.team_members?.display_name || "Utilisateur"} &middot;{" "}
                      {new Date(comment.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Aucun commentaire</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground text-sm">Contact non trouvé</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
