"use client"

import { useEffect } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import { Extension } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Underline from "@tiptap/extension-underline"
import Placeholder from "@tiptap/extension-placeholder"

const TabHardBreak = Extension.create({
  name: 'tabHardBreak',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => editor.commands.setHardBreak(),
      'Shift-Tab': ({ editor }) => editor.commands.setHardBreak(),
    }
  },
})
import { Button } from "@/components/ui/button"
import { Bold, Italic, Underline as UnderlineIcon, Link2, List, ListOrdered, Undo, Redo } from "lucide-react"

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  onEditorReady?: (editor: Editor) => void
}

export function RichTextEditor({ value, onChange, placeholder, className, onEditorReady }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || "" }),
      TabHardBreak,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Sync external value changes (e.g., tab switch)
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const currentHtml = editor.getHTML()
      if (currentHtml !== value) {
        editor.commands.setContent(value, { emitUpdate: false })
      }
    }
  }, [value, editor])

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor)
    }
  }, [editor, onEditorReady])

  const handleLink = () => {
    if (!editor) return
    const url = prompt("URL du lien:")
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  if (!editor) return null

  const isExpanded = className?.includes("flex-col") || className?.includes("h-full")

  return (
    <div className={`border rounded-md overflow-hidden ${isExpanded ? "flex flex-col" : ""} ${className || ""}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b bg-muted/30 shrink-0">
        <ToolbarButton
          icon={<Bold className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Gras"
        />
        <ToolbarButton
          icon={<Italic className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italique"
        />
        <ToolbarButton
          icon={<UnderlineIcon className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Souligné"
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          icon={<Link2 className="h-3.5 w-3.5" />}
          onClick={handleLink}
          active={editor.isActive("link")}
          title="Lien"
        />
        <ToolbarButton
          icon={<List className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Liste"
        />
        <ToolbarButton
          icon={<ListOrdered className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Liste numérotée"
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarButton
          icon={<Undo className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().undo().run()}
          title="Annuler"
        />
        <ToolbarButton
          icon={<Redo className="h-3.5 w-3.5" />}
          onClick={() => editor.chain().focus().redo().run()}
          title="Rétablir"
        />
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className={`${isExpanded ? "flex-1" : "min-h-[180px] max-h-[300px]"} overflow-y-auto px-3 py-2 text-sm prose prose-sm max-w-none dark:prose-invert focus-within:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-full [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground/50 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none`}
      />

    </div>
  )
}

function ToolbarButton({ icon, onClick, title, active }: { icon: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-6 w-6 ${active ? "bg-muted text-foreground" : ""}`}
      onClick={onClick}
      title={title}
    >
      {icon}
    </Button>
  )
}
