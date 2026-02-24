"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mail, ClipboardCheck, Clock, Trash2, GripVertical } from "lucide-react"
import type { SequenceStep } from "@/types/database"

const stepTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  email: { label: "Email", icon: Mail, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  manual_task: { label: "Tâche manuelle", icon: ClipboardCheck, color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  wait: { label: "Attente", icon: Clock, color: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
}

interface SequenceStepCardProps {
  step: SequenceStep & { templates?: { id: string; name: string; subject: string } | null }
  onDelete: (stepId: string) => void
}

export function SequenceStepCard({ step, onDelete }: SequenceStepCardProps) {
  const config = stepTypeConfig[step.step_type] || stepTypeConfig.email
  const Icon = config.icon

  return (
    <Card className="relative">
      <CardContent className="flex items-center gap-4 py-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <GripVertical className="h-4 w-4" />
          <span className="text-sm font-mono font-bold w-6 text-center">{step.step_order}</span>
        </div>

        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.color}`}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{config.label}</Badge>
            {step.delay_days > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                +{step.delay_days}j
              </Badge>
            )}
          </div>
          <p className="text-sm mt-1 truncate">
            {step.step_type === 'email' && step.templates
              ? step.templates.name
              : step.instructions || 'Pas de description'}
          </p>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(step.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
