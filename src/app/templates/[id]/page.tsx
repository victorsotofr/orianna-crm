'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SiteHeader } from '@/components/site-header';
import { TemplateForm } from '@/components/template-form';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Eye, Pencil, Trash2 } from 'lucide-react';
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
  const [tab, setTab] = useState<string>('preview');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplate();
  }, [templateId]);

  const fetchTemplate = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const { templates } = await response.json();
        const found = templates.find((t: Template) => t.id === templateId);
        if (found) {
          setTemplate(found);
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

  const handleFormSuccess = () => {
    toast.success('Template mis à jour');
    fetchTemplate();
    setTab('preview');
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

  const variables = extractTemplateVariables(template.html_content);

  return (
    <>
      <SiteHeader title={template.name} />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-3 px-4 lg:px-6">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/templates')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Retour
            </Button>
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

          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="preview">
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Aperçu
              </TabsTrigger>
              <TabsTrigger value="edit">
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Modifier
              </TabsTrigger>
            </TabsList>

            {/* Preview tab - FULL PAGE */}
            <TabsContent value="preview" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Metadata sidebar */}
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Nom</p>
                    <p className="text-sm font-semibold">{template.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sujet</p>
                    <p className="text-sm">{template.subject}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Industrie</p>
                    <Badge variant="outline">{template.industry}</Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Variables utilisées</p>
                    <div className="flex flex-wrap gap-1">
                      {variables.map((v) => (
                        <Badge key={v} variant="secondary" className="font-mono text-xs">{`{{ ${v} }}`}</Badge>
                      ))}
                      {variables.length === 0 && (
                        <p className="text-xs text-muted-foreground">Aucune variable</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Créé le</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {new Date(template.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                {/* Email preview - large */}
                <div className="lg:col-span-2">
                  <div className="border rounded-lg overflow-hidden">
                    {/* Email header */}
                    <div className="bg-muted/50 border-b px-5 py-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">De:</span>
                        <span>vous@orianna.fr</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium">À:</span>
                        <span>jean.dupont@example.com</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-xs text-muted-foreground">Objet:</span>
                        <span className="font-medium">{renderPreview(template.subject)}</span>
                      </div>
                    </div>
                    {/* Email body */}
                    <div className="px-6 py-5 bg-white dark:bg-card min-h-[400px]">
                      <div
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: renderPreview(template.html_content) }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Edit tab - FULL PAGE */}
            <TabsContent value="edit">
              <div className="max-w-3xl">
                <TemplateForm template={template} onSuccess={handleFormSuccess} />
              </div>
            </TabsContent>
          </Tabs>
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
