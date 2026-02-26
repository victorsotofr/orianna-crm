"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Mail,
  ClipboardCheck,
  Clock,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Zap,
  GripVertical,
} from "lucide-react"
import type { SequenceStep, Template } from "@/types/database"

type StepWithTemplate = SequenceStep & {
  templates?: { id: string; name: string; subject: string } | null
}

interface SequenceTimelineProps {
  steps: StepWithTemplate[]
  templates: Template[]
  onAddStep: (step: { step_type: string; template_id: string | null; delay_days: number; instructions: string | null }, insertAfterOrder?: number) => Promise<void>
  onDeleteStep: (stepId: string) => Promise<void>
  onMoveStep: (stepId: string, direction: "up" | "down") => Promise<void>
  onUpdateStep?: (stepId: string, data: Partial<SequenceStep>) => Promise<void>
  disabled?: boolean
}

const stepConfig: Record<string, {
  label: string
  icon: React.ElementType
  bg: string
  border: string
  iconBg: string
  text: string
}> = {
  email: {
    label: "Email",
    icon: Mail,
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800",
    iconBg: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400",
    text: "text-blue-700 dark:text-blue-300",
  },
  manual_task: {
    label: "Tâche manuelle",
    icon: ClipboardCheck,
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-800",
    iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-400",
    text: "text-orange-700 dark:text-orange-300",
  },
  wait: {
    label: "Attente",
    icon: Clock,
    bg: "bg-gray-50 dark:bg-gray-950/40",
    border: "border-gray-200 dark:border-gray-700",
    iconBg: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    text: "text-gray-700 dark:text-gray-300",
  },
}

function InsertButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center py-1">
      <button
        type="button"
        onClick={onClick}
        className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-muted-foreground/25 text-muted-foreground/50 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all text-xs"
      >
        <Plus className="h-3 w-3" />
        <span className="hidden group-hover:inline">Ajouter</span>
      </button>
    </div>
  )
}

function DelayIndicator({ days }: { days: number }) {
  if (days <= 0) return null
  return (
    <div className="flex justify-center py-0.5">
      <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
        <Clock className="h-3 w-3" />
        {days === 1 ? "1 jour" : `${days} jours`}
      </div>
    </div>
  )
}

function AddStepForm({
  templates,
  onAdd,
  onCancel,
  insertAfterOrder,
}: {
  templates: Template[]
  onAdd: (step: { step_type: string; template_id: string | null; delay_days: number; instructions: string | null }, insertAfterOrder?: number) => Promise<void>
  onCancel: () => void
  insertAfterOrder?: number
}) {
  const [stepType, setStepType] = useState("email")
  const [templateId, setTemplateId] = useState("")
  const [delayDays, setDelayDays] = useState("0")
  const [instructions, setInstructions] = useState("")
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    try {
      await onAdd(
        {
          step_type: stepType,
          template_id: stepType === "email" ? templateId || null : null,
          delay_days: parseInt(delayDays) || 0,
          instructions: instructions || null,
        },
        insertAfterOrder
      )
      onCancel()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md border rounded-lg bg-card p-4 space-y-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Nouvelle étape</p>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={stepType} onValueChange={setStepType}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="manual_task">Tâche manuelle</SelectItem>
              <SelectItem value="wait">Attente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Délai (jours)</Label>
          <Input
            type="number"
            min="0"
            value={delayDays}
            onChange={(e) => setDelayDays(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {stepType === "email" && (
        <div className="space-y-1">
          <Label className="text-xs">Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sélectionner..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {stepType === "manual_task" && (
        <div className="space-y-1">
          <Label className="text-xs">Instructions</Label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Instructions..."
            rows={2}
            className="text-xs"
          />
        </div>
      )}

      <Button size="sm" onClick={handleAdd} disabled={adding} className="w-full">
        {adding ? (
          <span className="animate-spin mr-1.5 h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full inline-block" />
        ) : (
          <Plus className="mr-1.5 h-3.5 w-3.5" />
        )}
        Ajouter l&apos;étape
      </Button>
    </div>
  )
}

function StepCard({
  step,
  index,
  totalSteps,
  onDelete,
  onMoveUp,
  onMoveDown,
  disabled,
}: {
  step: StepWithTemplate
  index: number
  totalSteps: number
  onDelete: (stepId: string) => Promise<void>
  onMoveUp: (stepId: string) => void
  onMoveDown: (stepId: string) => void
  disabled?: boolean
}) {
  const config = stepConfig[step.step_type] || stepConfig.email
  const Icon = config.icon

  return (
    <div className={`group mx-auto w-full max-w-md border rounded-lg ${config.bg} ${config.border} transition-all hover:shadow-sm`}>
      <div className="flex items-center gap-3 p-3">
        {/* Step number + reorder */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onMoveUp(step.id)}
            disabled={index === 0 || disabled}
            className="text-muted-foreground/40 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <span className="text-[10px] font-mono font-bold text-muted-foreground leading-none">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={() => onMoveDown(step.id)}
            disabled={index === totalSteps - 1 || disabled}
            className="text-muted-foreground/40 hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        {/* Icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
          </div>
          <p className="text-sm mt-0.5 truncate text-foreground">
            {step.step_type === "email" && step.templates
              ? step.templates.name
              : step.step_type === "wait"
                ? `Attendre ${step.delay_days} jour${step.delay_days > 1 ? "s" : ""}`
                : step.instructions || "Pas de description"}
          </p>
          {step.step_type === "email" && step.templates?.subject && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Objet : {step.templates.subject}
            </p>
          )}
        </div>

        {/* Delete */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-7 w-7 text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
          onClick={() => onDelete(step.id)}
          disabled={disabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function SequenceTimeline({
  steps,
  templates,
  onAddStep,
  onDeleteStep,
  onMoveStep,
  disabled,
}: SequenceTimelineProps) {
  const [insertingAt, setInsertingAt] = useState<number | null>(null)

  return (
    <div className="relative py-4">
      {/* Vertical connector line */}
      {steps.length > 0 && (
        <div className="absolute left-1/2 top-8 bottom-8 w-px -translate-x-1/2 bg-border" />
      )}

      {/* Start trigger */}
      <div className="flex justify-center pb-2 relative z-10">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400">
          <Zap className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">Début de la séquence</span>
        </div>
      </div>

      {/* Steps */}
      {steps.length === 0 ? (
        <div className="relative z-10 py-4">
          {insertingAt === -1 ? (
            <AddStepForm
              templates={templates}
              onAdd={onAddStep}
              onCancel={() => setInsertingAt(null)}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-muted-foreground">Aucune étape dans cette séquence</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setInsertingAt(-1)}
                disabled={disabled}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Ajouter la première étape
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-0 relative z-10">
          {steps.map((step, idx) => (
            <div key={step.id}>
              {/* Delay indicator */}
              {step.delay_days > 0 && step.step_type !== "wait" && (
                <DelayIndicator days={step.delay_days} />
              )}

              {/* Insert button before step (only for inserting between steps) */}
              {insertingAt === idx ? (
                <div className="py-2">
                  <AddStepForm
                    templates={templates}
                    onAdd={onAddStep}
                    onCancel={() => setInsertingAt(null)}
                    insertAfterOrder={idx > 0 ? steps[idx - 1].step_order : 0}
                  />
                </div>
              ) : (
                <InsertButton onClick={() => setInsertingAt(idx)} />
              )}

              {/* Step card */}
              <StepCard
                step={step}
                index={idx}
                totalSteps={steps.length}
                onDelete={onDeleteStep}
                onMoveUp={(id) => onMoveStep(id, "up")}
                onMoveDown={(id) => onMoveStep(id, "down")}
                disabled={disabled}
              />
            </div>
          ))}

          {/* Insert button at end */}
          {insertingAt === steps.length ? (
            <div className="py-2">
              <AddStepForm
                templates={templates}
                onAdd={onAddStep}
                onCancel={() => setInsertingAt(null)}
                insertAfterOrder={steps[steps.length - 1].step_order}
              />
            </div>
          ) : (
            <InsertButton onClick={() => setInsertingAt(steps.length)} />
          )}
        </div>
      )}

      {/* End marker */}
      <div className="flex justify-center pt-2 relative z-10">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted border border-muted-foreground/10 text-muted-foreground">
          <span className="text-xs font-semibold">Fin de la séquence</span>
        </div>
      </div>
    </div>
  )
}
