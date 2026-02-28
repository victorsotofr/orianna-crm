'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useTranslation } from '@/lib/i18n'

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const { t } = useTranslation()
  const [type, setType] = useState<string>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (!selected.type.startsWith('image/')) {
      toast.error(t.feedback.toasts.imageOnly)
      return
    }
    if (selected.size > 5 * 1024 * 1024) {
      toast.error(t.feedback.toasts.imageTooLarge)
      return
    }
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  const clearFile = () => {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resetForm = () => {
    setType('bug')
    setTitle('')
    setDescription('')
    clearFile()
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t.feedback.toasts.titleRequired)
      return
    }
    if (!description.trim()) {
      toast.error(t.feedback.toasts.descriptionRequired)
      return
    }

    setSubmitting(true)

    try {
      let imageUrl: string | null = null

      // Upload image to Supabase storage if provided
      if (file) {
        const ext = file.name.split('.').pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('feedback-assets')
          .upload(fileName, file)

        if (uploadError) {
          console.error('Upload error:', uploadError)
          toast.error(t.feedback.toasts.uploadError)
          setSubmitting(false)
          return
        }

        const { data: urlData } = supabase.storage
          .from('feedback-assets')
          .getPublicUrl(fileName)

        imageUrl = urlData.publicUrl
      }

      // Submit feedback via API
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, description, imageUrl }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || t.feedback.toasts.submitError)
      }

      toast.success(t.feedback.toasts.success)
      resetForm()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Feedback submit error:', error)
      toast.error(error.message || t.feedback.toasts.submitError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.feedback.title}</DialogTitle>
          <DialogDescription>
            {t.feedback.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-type">{t.feedback.labels.type}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="feedback-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">{t.feedback.types.bug}</SelectItem>
                <SelectItem value="enhancement">{t.feedback.types.improvement}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-title">{t.feedback.labels.title}</Label>
            <Input
              id="feedback-title"
              placeholder={t.feedback.labels.titlePlaceholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-description">{t.feedback.labels.description}</Label>
            <Textarea
              id="feedback-description"
              placeholder={t.feedback.labels.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.feedback.labels.screenshot}</Label>
            {preview ? (
              <div className="relative rounded-md border overflow-hidden">
                <img src={preview} alt="Preview" className="max-h-40 w-full object-contain bg-muted" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={clearFile}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 w-full rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <ImagePlus className="h-4 w-4" />
                {t.feedback.labels.addScreenshot}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t.common.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t.feedback.labels.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
