'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SiteHeader } from '@/components/site-header';
import { RichTextEditor } from '@/components/rich-text-editor';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Braces } from 'lucide-react';
import { AVAILABLE_VARIABLES } from '@/components/variable-picker';
import { useTranslation } from '@/lib/i18n';
import type { Editor } from '@tiptap/react';

export default function NewTemplatePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');

  const insertVariable = (varName: string) => {
    const variable = `{{${varName}}}`;
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(variable).run();
      setHtmlContent(editorRef.current.getHTML());
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t.templates.newPage.toasts.nameRequired);
      return;
    }
    if (!subject.trim()) {
      toast.error(t.templates.newPage.toasts.subjectRequired);
      return;
    }
    if (!htmlContent.trim() || htmlContent === '<p></p>') {
      toast.error(t.templates.newPage.toasts.contentRequired);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          html_content: htmlContent,
        }),
      });

      if (response.ok) {
        const { template } = await response.json();
        toast.success(t.templates.newPage.toasts.created);
        router.push(`/templates/${template.id}`);
      } else {
        const data = await response.json();
        toast.error(data.error || t.templates.newPage.toasts.createError);
      }
    } catch {
      toast.error(t.templates.newPage.toasts.createError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title={t.templates.newPage.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/templates')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              {t.common.back}
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              {t.templates.newPage.createButton}
            </Button>
          </div>

          {/* Metadata bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs border rounded-lg px-4 py-2.5 bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Label className="text-muted-foreground shrink-0">{t.templates.newPage.labels.name}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.templates.newPage.placeholders.name}
                className="h-7 text-xs w-52"
              />
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer text-[10px] gap-1 hover:bg-secondary/80"
                  >
                    <Braces className="h-3 w-3" />
                    {t.variables.title}
                  </Badge>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
                  {AVAILABLE_VARIABLES.map((v) => (
                    <DropdownMenuItem
                      key={v.name}
                      onClick={() => insertVariable(v.name)}
                      className="flex items-center justify-between"
                    >
                      <Badge variant="secondary" className="font-mono text-xs">{`{{${v.name}}}`}</Badge>
                      <span className="text-xs text-muted-foreground">{v.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Email chrome */}
          <div className="border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
            {/* Email header */}
            <div className="bg-muted/50 border-b px-5 py-3 space-y-1 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{t.templates.newPage.labels.from}</span>
                <span>{t.templates.newPage.placeholders.from}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{t.templates.newPage.labels.to}</span>
                <span>{t.templates.newPage.placeholders.to}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-xs text-muted-foreground shrink-0">{t.templates.newPage.labels.subject}</span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t.templates.newPage.placeholders.subject}
                  className="h-7 text-sm font-medium"
                />
              </div>
            </div>
            {/* Email body */}
            <div className="flex-1 min-h-0 bg-white dark:bg-card flex flex-col">
              <RichTextEditor
                value={htmlContent}
                onChange={setHtmlContent}
                onEditorReady={(editor) => { editorRef.current = editor; }}
                placeholder={t.templates.newPage.placeholders.content}
                className="border-0 rounded-none h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
