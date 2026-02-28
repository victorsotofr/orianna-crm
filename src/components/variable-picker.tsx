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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="h-7 text-xs gap-1.5">
          <Braces className="h-3 w-3" />
          Variables
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
        {AVAILABLE_VARIABLES.map((v) => (
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

export { AVAILABLE_VARIABLES }
