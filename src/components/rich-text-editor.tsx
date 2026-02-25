"use client"

import { useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react"
import { Button } from "@/components/ui/button"
import { Bold, Italic, Underline, Link2, List, ListOrdered, Undo, Redo } from "lucide-react"

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
}

export const RichTextEditor = forwardRef<HTMLDivElement, RichTextEditorProps>(
  function RichTextEditor({ value, onChange, placeholder, className }, ref) {
    const editorRef = useRef<HTMLDivElement>(null)
    const isInternalUpdate = useRef(false)

    useImperativeHandle(ref, () => editorRef.current as HTMLDivElement)

    // Sync external value changes (e.g., on initial load, reset, or tab switch)
    useEffect(() => {
      if (editorRef.current && !isInternalUpdate.current) {
        if (editorRef.current.innerHTML !== value) {
          editorRef.current.innerHTML = value
        }
      }
      isInternalUpdate.current = false
    }, [value])

    const handleInput = useCallback(() => {
      if (editorRef.current) {
        isInternalUpdate.current = true
        onChange(editorRef.current.innerHTML)
      }
    }, [onChange])

    const exec = useCallback((command: string, val?: string) => {
      document.execCommand(command, false, val)
      editorRef.current?.focus()
      handleInput()
    }, [handleInput])

    const handleLink = useCallback(() => {
      const url = prompt("URL du lien:")
      if (url) {
        exec("createLink", url)
      }
    }, [exec])

    return (
      <div className={`border rounded-md overflow-hidden ${className || ""}`}>
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-muted/30">
          <ToolbarButton icon={<Bold className="h-3.5 w-3.5" />} onClick={() => exec("bold")} title="Gras" />
          <ToolbarButton icon={<Italic className="h-3.5 w-3.5" />} onClick={() => exec("italic")} title="Italique" />
          <ToolbarButton icon={<Underline className="h-3.5 w-3.5" />} onClick={() => exec("underline")} title="Souligné" />
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton icon={<Link2 className="h-3.5 w-3.5" />} onClick={handleLink} title="Lien" />
          <ToolbarButton icon={<List className="h-3.5 w-3.5" />} onClick={() => exec("insertUnorderedList")} title="Liste" />
          <ToolbarButton icon={<ListOrdered className="h-3.5 w-3.5" />} onClick={() => exec("insertOrderedList")} title="Liste numérotée" />
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton icon={<Undo className="h-3.5 w-3.5" />} onClick={() => exec("undo")} title="Annuler" />
          <ToolbarButton icon={<Redo className="h-3.5 w-3.5" />} onClick={() => exec("redo")} title="Rétablir" />
        </div>

        {/* Editor area */}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          data-placeholder={placeholder}
          className="min-h-[180px] max-h-[300px] overflow-y-auto px-3 py-2 text-sm focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-muted-foreground/50"
          suppressContentEditableWarning
        />
      </div>
    )
  }
)

function ToolbarButton({ icon, onClick, title }: { icon: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={onClick}
      title={title}
    >
      {icon}
    </Button>
  )
}
