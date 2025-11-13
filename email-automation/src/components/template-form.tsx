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

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setSubmitting(true)
    const loadingToast = toast.loading(
      isEditing ? "Mise à jour du template..." : "Création du template..."
    )
    
    try {
      // Validate industry
      if (!data.industry) {
        toast.dismiss(loadingToast)
        toast.error("Veuillez sélectionner une industrie")
        setSubmitting(false)
        return
      }

      const url = isEditing
        ? `/api/templates/${template.id}`
        : "/api/templates"
      
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
          isEditing
            ? "Template mis à jour avec succès"
            : "Template créé avec succès",
          {
            description: `Le template "${data.name}" a été ${isEditing ? "mis à jour" : "créé"}`,
            duration: 4000,
          }
        )
        onSuccess?.()
      } else if (response.status === 404) {
        toast.error("Template non trouvé", {
          description: "Ce template n'existe plus. La page va être rechargée.",
          duration: 5000,
        })
        // Refresh the page after 2 seconds
        setTimeout(() => window.location.reload(), 2000)
      } else if (response.status === 410) {
        toast.error("Template supprimé", {
          description: result.error || "Ce template a été supprimé et ne peut pas être modifié",
          duration: 5000,
        })
        // Refresh the page after 2 seconds
        setTimeout(() => window.location.reload(), 2000)
      } else {
        toast.error(result.error || "Une erreur est survenue", {
          description: "Veuillez réessayer ou contacter le support",
          duration: 5000,
        })
      }
    } catch (error: any) {
      toast.dismiss(loadingToast)
      console.error("Error submitting template:", error)
      toast.error("Erreur réseau", {
        description: error.message || "Vérifiez votre connexion internet",
        duration: 5000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const htmlContentLength = form.watch("html_content")?.length || 0

  return (
    <form id="template-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-name">
                Nom du Template
              </FieldLabel>
              <Input
                {...field}
                id="template-name"
                aria-invalid={fieldState.invalid}
                placeholder="Template Immobilier - Prospection"
                autoComplete="off"
              />
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="subject"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-subject">
                Sujet de l'Email
              </FieldLabel>
              <Input
                {...field}
                id="template-subject"
                aria-invalid={fieldState.invalid}
                placeholder="Proposition de collaboration - {{company_name}}"
                autoComplete="off"
              />
              <FieldDescription>
                Utilisez des variables comme {`{{first_name}}`}, {`{{last_name}}`}, {`{{company_name}}`}
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="industry"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-industry">
                Industrie
              </FieldLabel>
              <IndustrySelector
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Sélectionnez une industrie"
              />
              <FieldDescription>
                Choisissez l&apos;industrie ciblée par ce template. Vous pouvez créer une nouvelle industrie si elle n&apos;existe pas.
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />

        <Controller
          name="html_content"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-content">
                Contenu HTML
              </FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  {...field}
                  id="template-content"
                  placeholder="<p>Bonjour {{first_name}},</p>..."
                  rows={12}
                  className="min-h-[300px] resize-y font-mono text-sm"
                  aria-invalid={fieldState.invalid}
                />
                <InputGroupAddon align="block-end">
                  <InputGroupText className="tabular-nums">
                    {htmlContentLength}/10000 caractères
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Écrivez votre contenu HTML. Variables disponibles: {`{{first_name}}`}, {`{{last_name}}`}, {`{{company_name}}`}, {`{{video_url}}`}
              </FieldDescription>
              <FieldDescription className="text-orange-600 dark:text-orange-400 font-medium">
                ⚠️ Important : N&apos;incluez PAS de signature à la fin (ex: &quot;Cordialement, Votre nom&quot;). La signature configurée dans Paramètres sera automatiquement ajoutée.
              </FieldDescription>
              {fieldState.invalid && (
                <FieldError errors={[fieldState.error]} />
              )}
            </Field>
          )}
        />
      </FieldGroup>

      <Field orientation="horizontal" className="justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => form.reset()}
          disabled={submitting}
        >
          Réinitialiser
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isEditing ? "Mise à jour..." : "Création..."}
            </>
          ) : (
            <>{isEditing ? "Mettre à jour" : "Créer le template"}</>
          )}
        </Button>
      </Field>
    </form>
  )
}

