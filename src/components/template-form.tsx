"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Loader2, Eye, Code, Type } from "lucide-react"
import { Template } from "@/types/database"
import { VariablePicker, AVAILABLE_VARIABLES } from "@/components/variable-picker"
import { RichTextEditor } from "@/components/rich-text-editor"
import { useTranslation } from "@/lib/i18n"
import { preserveEmptyParagraphs } from "@/lib/template-renderer"
import type { Editor } from "@tiptap/react"

interface TemplateFormProps {
  template?: Template
  onSuccess?: () => void
}

const PREVIEW_DATA: Record<string, string> = {
  first_name: "Jean",
  last_name: "Dupont",
  email: "jean@example.com",
  phone: "+33 6 12 34 56 78",
  company_name: "Entreprise Example",
  company_domain: "example.com",
  job_title: "Directeur Commercial",
  linkedin_url: "https://linkedin.com/in/jean-dupont",
  location: "Paris",
  education: "HEC Paris",
  ai_personalized_line: "Votre récente expansion à Lyon montre une belle dynamique de croissance.",
}

function renderPreview(html: string): string {
  let result = html
  for (const v of AVAILABLE_VARIABLES) {
    const regex = new RegExp(`\\{\\{\\s*${v.name}\\s*\\}\\}`, "g")
    result = result.replace(regex, PREVIEW_DATA[v.name] || v.example)
  }
  return preserveEmptyParagraphs(result)
}

export function TemplateForm({ template, onSuccess }: TemplateFormProps) {
  const { t } = useTranslation()
  const [submitting, setSubmitting] = React.useState(false)
  const [editorTab, setEditorTab] = React.useState<string>("visual")
  const editorRef = React.useRef<Editor | null>(null)
  const codeRef = React.useRef<HTMLTextAreaElement>(null)
  const isEditing = !!template

  const formSchema = z.object({
    name: z
      .string()
      .min(3, t.templates.form.validation.nameMin)
      .max(100, t.templates.form.validation.nameMax),
    subject: z
      .string()
      .min(5, t.templates.form.validation.subjectMin)
      .max(200, t.templates.form.validation.subjectMax),
    html_content: z
      .string()
      .min(20, t.templates.form.validation.contentMin)
      .max(10000, t.templates.form.validation.contentMax),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      subject: template?.subject || "",
      html_content: template?.html_content || "",
    },
  })

  const insertVariable = (variable: string) => {
    if (editorTab === "code") {
      // Insert into textarea at cursor
      const textarea = codeRef.current
      if (!textarea) {
        const current = form.getValues("html_content")
        form.setValue("html_content", current + variable, { shouldDirty: true })
        return
      }
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const current = form.getValues("html_content")
      const newValue = current.substring(0, start) + variable + current.substring(end)
      form.setValue("html_content", newValue, { shouldDirty: true })
      requestAnimationFrame(() => {
        textarea.focus()
        const pos = start + variable.length
        textarea.setSelectionRange(pos, pos)
      })
    } else {
      // Insert into rich text editor
      const editor = editorRef.current
      if (editor) {
        editor.chain().focus().insertContent(variable).run()
        form.setValue("html_content", editor.getHTML(), { shouldDirty: true })
      }
    }
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setSubmitting(true)
    const loadingToast = toast.loading(
      isEditing ? t.templates.form.toasts.updating : t.templates.form.toasts.creating
    )

    try {
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
          isEditing ? t.templates.form.toasts.updated : t.templates.form.toasts.created,
          { description: `"${data.name}" ${isEditing ? t.templates.form.toasts.updatedName('').trim() : t.templates.form.toasts.createdName('').trim()}`, duration: 3000 }
        )
        onSuccess?.()
      } else if (response.status === 404 || response.status === 410) {
        toast.error(t.templates.form.toasts.notFound)
        setTimeout(() => window.location.reload(), 2000)
      } else {
        toast.error(result.error || t.common.networkError)
      }
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(t.templates.form.toasts.networkError, { description: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  const htmlContent = form.watch("html_content") || ""

  return (
    <form id="template-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <FieldGroup>
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="template-name" className="text-xs">{t.templates.form.name}</FieldLabel>
              <Input
                {...field}
                id="template-name"
                aria-invalid={fieldState.invalid}
                placeholder={t.templates.form.placeholders.name}
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
              <FieldLabel htmlFor="template-subject" className="text-xs">{t.templates.form.subject}</FieldLabel>
              <Input
                {...field}
                id="template-subject"
                aria-invalid={fieldState.invalid}
                placeholder={t.templates.form.placeholders.subject}
                autoComplete="off"
                className="h-8 text-sm"
              />
              <FieldDescription className="text-[10px]">
                Variables: {`{{first_name}}`}, {`{{company_name}}`}, {`{{last_name}}`}
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="html_content"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between mb-1">
                <FieldLabel className="text-xs">{t.templates.form.content}</FieldLabel>
                <VariablePicker onInsert={insertVariable} />
              </div>

              <Tabs value={editorTab} onValueChange={setEditorTab}>
                <TabsList className="h-7 mb-2">
                  <TabsTrigger value="visual" className="text-xs h-6 gap-1">
                    <Type className="h-3 w-3" /> {t.templates.form.visual}
                  </TabsTrigger>
                  <TabsTrigger value="code" className="text-xs h-6 gap-1">
                    <Code className="h-3 w-3" /> {t.templates.form.html}
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="text-xs h-6 gap-1">
                    <Eye className="h-3 w-3" /> {t.templates.form.preview}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="visual" className="mt-0">
                  <RichTextEditor
                    value={field.value}
                    onChange={(html) => {
                      field.onChange(html)
                    }}
                    placeholder={t.templates.form.placeholders.contentText}
                    onEditorReady={(editor) => { editorRef.current = editor }}
                  />
                </TabsContent>

                <TabsContent value="code" className="mt-0">
                  <Textarea
                    ref={codeRef}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={t.templates.form.placeholders.contentHtml}
                    rows={10}
                    className="min-h-[180px] max-h-[300px] resize-y font-mono text-xs"
                  />
                </TabsContent>

                <TabsContent value="preview" className="mt-0">
                  <div className="border rounded-md min-h-[180px] max-h-[300px] overflow-y-auto px-4 py-3 bg-white dark:bg-muted/20">
                    {htmlContent ? (
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: renderPreview(htmlContent) }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{t.common.noContent}</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                {t.common.charactersCount(htmlContent.length, 10000)}
              </p>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <Field orientation="horizontal" className="justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => form.reset()} disabled={submitting}>
          {t.common.reset}
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> {isEditing ? t.templates.form.toasts.updating : t.templates.form.creating}</>
          ) : (
            <>{isEditing ? t.templates.form.updateButton : t.templates.form.createButton}</>
          )}
        </Button>
      </Field>
    </form>
  )
}
