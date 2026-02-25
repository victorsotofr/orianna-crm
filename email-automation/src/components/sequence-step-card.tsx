"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mail, ClipboardCheck, Clock, Trash2, ChevronUp, ChevronDown } from "lucide-react"
import type { SequenceStep } from "@/types/database"

const stepTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  email: { label: "Email", icon: Mail, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  manual_task: { label: "Tâche manuelle", icon: ClipboardCheck, color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" },
  wait: { label: "Attente", icon: Clock, color: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300" },
}

interface SequenceStepCardProps {
  step: SequenceStep & { templates?: { id: string; name: string; subject: string } | null }
  onDelete: (stepId: string) => void
  onMoveUp?: (stepId: string) => void
  onMoveDown?: (stepId: string) => void
  isFirst?: boolean
  isLast?: boolean
}

export function SequenceStepCard({ step, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: SequenceStepCardProps) {
  const config = stepTypeConfig[step.step_type] || stepTypeConfig.email
  const Icon = config.icon

  return (
    <Card className="relative">
      <CardContent className="flex items-center gap-3 py-2.5 px-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMoveUp?.(step.id)}
            disabled={isFirst}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onMoveDown?.(step.id)}
            disabled={isLast}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>

        <span className="text-xs font-mono font-bold w-5 text-center text-muted-foreground">{step.step_order}</span>

        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
            {step.delay_days > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                <Clock className="h-2.5 w-2.5 mr-0.5" />
                +{step.delay_days}j
              </Badge>
            )}
          </div>
          <p className="text-sm mt-0.5 truncate">
            {step.step_type === 'email' && step.templates
              ? step.templates.name
              : step.instructions || 'Pas de description'}
          </p>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(step.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  )
}
