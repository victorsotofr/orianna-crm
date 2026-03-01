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

interface FilePreview {
  file: File
  url: string
}

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const { t } = useTranslation()
  const [type, setType] = useState<string>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<FilePreview[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected) return

    const newFiles: FilePreview[] = []
    for (const file of Array.from(selected)) {
      if (!file.type.startsWith('image/')) {
        toast.error(t.feedback.toasts.imageOnly)
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t.feedback.toasts.imageTooLarge)
        continue
      }
      newFiles.push({ file, url: URL.createObjectURL(file) })
    }

    setFiles((prev) => [...prev, ...newFiles])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const next = [...prev]
      URL.revokeObjectURL(next[index].url)
      next.splice(index, 1)
      return next
    })
  }

  const resetForm = () => {
    setType('bug')
    setTitle('')
    setDescription('')
    files.forEach((f) => URL.revokeObjectURL(f.url))
    setFiles([])
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
      const imageUrls: string[] = []

      // Upload all images to Supabase storage
      for (const { file } of files) {
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

        imageUrls.push(urlData.publicUrl)
      }

      // Submit feedback via API
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          description,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        }),
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
            <Label>{t.feedback.labels.screenshots}</Label>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="relative rounded-md border overflow-hidden w-24 h-24">
                    <img src={f.url} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-0.5 right-0.5 h-5 w-5"
                      onClick={() => removeFile(i)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 w-full rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <ImagePlus className="h-4 w-4" />
              {t.feedback.labels.addScreenshots}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
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
