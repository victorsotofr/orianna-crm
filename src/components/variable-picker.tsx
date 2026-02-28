"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Braces } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import type { Translations } from "@/lib/i18n"

function getVariablesWithLabels(t: Translations) {
  return [
    { name: "first_name", label: t.variables.labels.firstName, example: "Jean" },
    { name: "last_name", label: t.variables.labels.lastName, example: "Dupont" },
    { name: "email", label: t.variables.labels.email, example: "jean@acme.com" },
    { name: "phone", label: t.variables.labels.phone, example: "+33 6 12 34 56 78" },
    { name: "company_name", label: t.variables.labels.company, example: "Acme Corp" },
    { name: "company_domain", label: t.variables.labels.domain, example: "acme.com" },
    { name: "job_title", label: t.variables.labels.position, example: "Directeur" },
    { name: "linkedin_url", label: t.variables.labels.linkedin, example: "https://linkedin.com/in/..." },
    { name: "location", label: t.variables.labels.location, example: "Paris" },
    { name: "education", label: t.variables.labels.education, example: "HEC Paris" },
    { name: "status", label: t.variables.labels.status, example: "new" },
    { name: "notes", label: t.variables.labels.notes, example: "Client potentiel" },
    { name: "first_contact", label: t.variables.labels.firstContact, example: "2026-01-15" },
    { name: "second_contact", label: t.variables.labels.secondContact, example: "2026-01-18" },
    { name: "third_contact", label: t.variables.labels.thirdContact, example: "2026-01-22" },
    { name: "last_contacted_at", label: t.variables.labels.lastContact, example: "2026-01-22" },
    { name: "replied_at", label: t.variables.labels.repliedAt, example: "2026-01-23" },
    { name: "ai_score", label: t.variables.labels.aiScore, example: "85" },
    { name: "ai_score_label", label: t.variables.labels.aiLabel, example: "HOT" },
    { name: "ai_personalized_line", label: t.variables.labels.aiPersonalization, example: "Votre récente expansion à Lyon..." },
  ]
}

// Static variable names for non-translated usage (template rendering etc.)
const AVAILABLE_VARIABLES = [
  { name: "first_name", label: "Prénom", example: "Jean" },
  { name: "last_name", label: "Nom", example: "Dupont" },
  { name: "email", label: "Email", example: "jean@acme.com" },
  { name: "phone", label: "Téléphone", example: "+33 6 12 34 56 78" },
  { name: "company_name", label: "Entreprise", example: "Acme Corp" },
  { name: "company_domain", label: "Domaine", example: "acme.com" },
  { name: "job_title", label: "Poste", example: "Directeur" },
  { name: "linkedin_url", label: "LinkedIn", example: "https://linkedin.com/in/..." },
  { name: "location", label: "Localisation", example: "Paris" },
  { name: "education", label: "Formation", example: "HEC Paris" },
  { name: "status", label: "Statut", example: "new" },
  { name: "notes", label: "Notes", example: "Client potentiel" },
  { name: "first_contact", label: "1er contact", example: "2026-01-15" },
  { name: "second_contact", label: "2e contact", example: "2026-01-18" },
  { name: "third_contact", label: "3e contact", example: "2026-01-22" },
  { name: "last_contacted_at", label: "Dernier contact", example: "2026-01-22" },
  { name: "replied_at", label: "Répondu le", example: "2026-01-23" },
  { name: "ai_score", label: "Score IA", example: "85" },
  { name: "ai_score_label", label: "Label IA", example: "HOT" },
  { name: "ai_personalized_line", label: "Personnalisation IA", example: "Votre récente expansion à Lyon..." },
]

interface VariablePickerProps {
  onInsert: (variable: string) => void
}

export function VariablePicker({ onInsert }: VariablePickerProps) {
  const { t } = useTranslation()
  const variables = getVariablesWithLabels(t)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="h-7 text-xs gap-1.5">
          <Braces className="h-3 w-3" />
          {t.variables.title}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
        {variables.map((v) => (
          <DropdownMenuItem
            key={v.name}
            onClick={() => onInsert(`{{${v.name}}}`)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">{`{{${v.name}}}`}</Badge>
              <span className="text-xs text-muted-foreground">{v.label}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { AVAILABLE_VARIABLES, getVariablesWithLabels }
