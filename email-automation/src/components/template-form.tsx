"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { Loader2 } from "lucide-react"
import { Template } from "@/types/database"
import { IndustrySelector } from "@/components/industry-selector"
import { VariablePicker } from "@/components/variable-picker"

const formSchema = z.object({
  name: z
    .string()
    .min(3, "Le nom doit contenir au moins 3 caractères.")
    .max(100, "Le nom doit contenir au plus 100 caractères."),
  subject: z
    .string()
    .min(5, "Le sujet doit contenir au moins 5 caractères.")
    .max(200, "Le sujet doit contenir au plus 200 caractères."),
  industry: z
    .string()
    .min(1, "Veuillez sélectionner ou créer une industrie."),
  html_content: z
    .string()
    .min(50, "Le contenu HTML doit contenir au moins 50 caractères.")
    .max(10000, "Le contenu HTML doit contenir au plus 10000 caractères."),
})

interface TemplateFormProps {
  template?: Template
  onSuccess?: () => void
}

export function TemplateForm({ template, onSuccess }: TemplateFormProps) {
  const [submitting, setSubmitting] = React.useState(false)
  const contentRef = React.useRef<HTMLTextAreaElement>(null)
  const isEditing = !!template

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      subject: template?.subject || "",
      industry: template?.industry || "",
      html_content: template?.html_content || "",
    },
  })

  const insertVariable = (variable: string) => {
    const textarea = contentRef.current
    if (!textarea) {
      // Fallback: append to end
      const current = form.getValues("html_content")
      form.setValue("html_content", current + variable, { shouldDirty: true })
      return
    }

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = form.getValues("html_content")
    const newValue = current.substring(0, start) + variable + current.substring(end)
    form.setValue("html_content", newValue, { shouldDirty: true })

    // Restore cursor position after the inserted variable
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + variable.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setSubmitting(true)
    const loadingToast = toast.loading(
      isEditing ? "Mise à jour du template..." : "Création du template..."
    )

    try {
      if (!data.industry) {
        toast.dismiss(loadingToast)
        toast.error("Veuillez sélectionner une industrie")
        setSubmitting(false)
        return
      }

      const url = isEditing ? `/api/templates/${template.id}` : "/api/templates"
      const method = isEditing ? "PUT" : "POST"

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()
      toast.dismiss(loadingToast)

      if (response.ok) {
        toast.success(
          isEditing ? "Template mis à jour" : "Template créé",
          { description: `"${data.name}" ${isEditing ? "mis à jour" : "créé"}`, duration: 3000 }
        )
        onSuccess?.()
      } else if (response.status === 404 || response.status === 410) {
        toast.error("Template introuvable ou supprimé")
        setTimeout(() => window.location.reload(), 2000)
      } else {
        toast.error(result.error || "Une erreur est survenue")
      }
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error("Erreur réseau", { description: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  const htmlContentLength = form.watch("html_content")?.length || 0

  return (
    <form id="template-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-name" className="text-xs">Nom du Template</FieldLabel>
              <Input
                {...field}
                id="template-name"
                aria-invalid={fieldState.invalid}
                placeholder="Template Immobilier - Prospection"
                autoComplete="off"
                className="h-8 text-sm"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="subject"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-subject" className="text-xs">Sujet de l&apos;Email</FieldLabel>
              <Input
                {...field}
                id="template-subject"
                aria-invalid={fieldState.invalid}
                placeholder="Proposition de collaboration - {{company_name}}"
                autoComplete="off"
                className="h-8 text-sm"
              />
              <FieldDescription className="text-xs">
                Variables: {`{{first_name}}`}, {`{{last_name}}`}, {`{{company_name}}`}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="industry"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-industry" className="text-xs">Industrie</FieldLabel>
              <IndustrySelector
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Sélectionnez une industrie"
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="html_content"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="template-content" className="text-xs">Contenu HTML</FieldLabel>
                <VariablePicker onInsert={insertVariable} />
              </div>
              <InputGroup>
                <InputGroupTextarea
                  {...field}
                  ref={(el) => {
                    // Merge refs: react-hook-form ref + our local ref
                    field.ref(el)
                    ;(contentRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
                  }}
                  id="template-content"
                  placeholder="<p>Bonjour {{first_name}},</p>..."
                  rows={10}
                  className="min-h-[200px] resize-y font-mono text-xs"
                  aria-invalid={fieldState.invalid}
                />
                <InputGroupAddon align="block-end">
                  <InputGroupText className="tabular-nums text-xs">
                    {htmlContentLength}/10000
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Field orientation="horizontal" className="justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => form.reset()} disabled={submitting}>
          Réinitialiser
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {isEditing ? "Mise à jour..." : "Création..."}</>
          ) : (
            <>{isEditing ? "Mettre à jour" : "Créer le template"}</>
          )}
        </Button>
      </Field>
    </form>
  )
}
