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
  { name: "company_name", label: "Entreprise", example: "Acme Corp" },
  { name: "job_title", label: "Poste", example: "Directeur" },
  { name: "email", label: "Email", example: "jean@acme.com" },
  { name: "video_url", label: "URL Vidéo", example: "https://..." },
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
      <DropdownMenuContent align="start" className="w-64">
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
