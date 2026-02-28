"use client"

import { Button } from "@/components/ui/button"
import { Loader2, Save, X } from "lucide-react"
import { useTranslation } from "@/lib/i18n"

interface StickySaveBarProps {
  onSave: () => void
  saving: boolean
  hasChanges: boolean
  onDiscard?: () => void
}

export function StickySaveBar({ onSave, saving, hasChanges, onDiscard }: StickySaveBarProps) {
  const { t } = useTranslation()

  if (!hasChanges) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 lg:px-6">
        <span className="text-sm text-muted-foreground mr-auto">{t.common.unsavedChanges}</span>
        {onDiscard && (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            {t.common.cancel}
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          {t.common.save}
        </Button>
      </div>
    </div>
  )
}
