'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SiteHeader } from '@/components/site-header';
import { RichTextEditor } from '@/components/rich-text-editor';
import { IndustrySelector } from '@/components/industry-selector';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Eye, Pencil, Trash2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Template } from '@/types/database';
import { extractTemplateVariables } from '@/lib/template-renderer';
import { AVAILABLE_VARIABLES } from '@/components/variable-picker';

const PREVIEW_DATA: Record<string, string> = {
  first_name: 'Jean',
  last_name: 'Dupont',
  company_name: 'Entreprise Example',
  job_title: 'Directeur Commercial',
  email: 'jean@example.com',
  video_url: 'https://example.com/video',
};

function renderPreview(html: string): string {
  let result = html;
  for (const v of AVAILABLE_VARIABLES) {
    const regex = new RegExp(`\\{\\{\\s*${v.name}\\s*\\}\\}`, 'g');
    result = result.replace(regex, PREVIEW_DATA[v.name] || v.example);
  }
  return result;
}

export default function TemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editHtmlContent, setEditHtmlContent] = useState('');

  useEffect(() => {
    fetchTemplate();
  }, [templateId]);

  const initEditState = (t: Template) => {
    setEditName(t.name);
    setEditSubject(t.subject);
    setEditIndustry(t.industry);
    setEditHtmlContent(t.html_content);
  };

  const fetchTemplate = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const { templates } = await response.json();
        const found = templates.find((t: Template) => t.id === templateId);
        if (found) {
          setTemplate(found);
          initEditState(found);
        } else {
          toast.error('Template non trouvé');
          router.push('/templates');
        }
      }
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editName.trim() || !editSubject.trim() || !editIndustry || !editHtmlContent.trim()) {
      toast.error('Tous les champs sont requis');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          subject: editSubject.trim(),
          industry: editIndustry,
          html_content: editHtmlContent,
        }),
      });

      if (response.ok) {
        const { template: updated } = await response.json();
        setTemplate(updated);
        initEditState(updated);
        toast.success('Template mis à jour');
        setEditing(false);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de la sauvegarde');
      }
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Template supprimé');
        router.push('/templates');
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  const startEditing = () => {
    if (template) initEditState(template);
    setEditing(true);
  };

  const cancelEditing = () => {
    if (template) initEditState(template);
    setEditing(false);
  };

  if (loading) {
    return (
      <>
        <SiteHeader title="Template" />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!template) return null;

  const variables = extractTemplateVariables(editing ? editHtmlContent : template.html_content);

  return (
    <>
      <SiteHeader title={template.name} />
      <div className="page-container">
        <div className="page-content">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/templates')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Retour
            </Button>
            <div className="flex items-center gap-2">
              {editing && (
                <>
                  <Button variant="outline" size="sm" onClick={cancelEditing} disabled={saving}>
                    Annuler
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Enregistrer
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Supprimer
              </Button>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5 w-fit">
            <Button
              variant={!editing ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={cancelEditing}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Aperçu
            </Button>
            <Button
              variant={editing ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={startEditing}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Modifier
            </Button>
          </div>

          {/* Metadata bar */}
          {editing ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs border rounded-lg px-4 py-2.5 bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Label className="text-muted-foreground shrink-0">Nom:</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-xs w-48"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-muted-foreground shrink-0">Industrie:</Label>
                <IndustrySelector value={editIndustry} onValueChange={setEditIndustry} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Variables: </span>
                {variables.length > 0 ? variables.map((v) => (
                  <Badge key={v} variant="secondary" className="font-mono text-[10px]">{`{{ ${v} }}`}</Badge>
                )) : (
                  <span className="text-muted-foreground">aucune</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs border rounded-lg px-4 py-2.5 bg-muted/30">
              <div>
                <span className="text-muted-foreground">Nom: </span>
                <span className="font-medium">{template.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sujet: </span>
                <span className="font-medium">{template.subject}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Industrie: </span>
                <Badge variant="outline" className="text-[10px] ml-0.5">{template.industry}</Badge>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Variables: </span>
                {variables.length > 0 ? variables.map((v) => (
                  <Badge key={v} variant="secondary" className="font-mono text-[10px]">{`{{ ${v} }}`}</Badge>
                )) : (
                  <span className="text-muted-foreground">aucune</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Créé le </span>
                <span>{new Date(template.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          )}

          {/* Content area — same email chrome for both modes */}
          <div className="border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
            {/* Email header */}
            <div className="bg-muted/50 border-b px-5 py-3 space-y-1 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">De:</span>
                <span>vous@orianna.fr</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">À:</span>
                <span>jean.dupont@example.com</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-xs text-muted-foreground shrink-0">Objet:</span>
                {editing ? (
                  <Input
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    placeholder="Sujet de l'email..."
                    className="h-7 text-sm font-medium"
                  />
                ) : (
                  <span className="font-medium">{renderPreview(template.subject)}</span>
                )}
              </div>
            </div>
            {/* Email body */}
            {editing ? (
              <div className="flex-1 min-h-0 bg-white dark:bg-card flex flex-col">
                <RichTextEditor
                  value={editHtmlContent}
                  onChange={setEditHtmlContent}
                  placeholder="Rédigez votre email ici..."
                  className="border-0 rounded-none h-full"
                />
              </div>
            ) : (
              <div className="px-6 py-5 bg-white dark:bg-card flex-1 overflow-y-auto">
                <div
                  className="prose prose-sm max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: renderPreview(template.html_content) }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le template</DialogTitle>
            <DialogDescription>
              Supprimer &quot;{template.name}&quot; ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
