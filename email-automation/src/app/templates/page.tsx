'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { TemplateForm } from '@/components/template-form';
import { toast } from 'sonner';
import { Plus, Loader2, FileText, Eye, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { Template } from '@/types/database';
import { extractTemplateVariables } from '@/lib/template-renderer';

interface Industry {
  id: string;
  name: string;
  display_name: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchIndustries();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndustries = async () => {
    try {
      const response = await fetch('/api/industries');
      if (response.ok) {
        const data = await response.json();
        setIndustries(data.industries || []);
      }
    } catch (error) {
      console.error('Error fetching industries:', error);
    }
  };

  const getIndustryLabel = (industry: string) => {
    const custom = industries.find(ind => ind.name === industry);
    if (custom) return custom.display_name;
    const labels: Record<string, string> = {
      real_estate: 'Immobilier',
      notary: 'Notaire',
      hotel: 'Hôtellerie',
      other: 'Autre',
    };
    return labels[industry] || industry;
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/templates/${templateToDelete.id}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Template supprimé');
        fetchTemplates();
        setDeleteOpen(false);
        setTemplateToDelete(null);
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
    fetchTemplates();
    setEditOpen(false);
    setAddOpen(false);
    setSelectedTemplate(null);
  };

  const renderPreviewHtml = (htmlContent: string) => {
    return htmlContent
      .replace(/\{\{\s*first_name\s*\}\}/g, 'Jean')
      .replace(/\{\{\s*last_name\s*\}\}/g, 'Dupont')
      .replace(/\{\{\s*company_name\s*\}\}/g, 'Entreprise Example')
      .replace(/\{\{\s*video_url\s*\}\}/g, 'https://example.com/video');
  };

  return (
    <>
      <SiteHeader title="Templates" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <CompactStatsBar stats={[
              { label: 'Templates', value: templates.length },
              { label: 'Actifs', value: templates.filter(t => t.is_active !== false).length },
            ]} />
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Nouveau
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">Aucun template</h3>
              <p className="text-xs text-muted-foreground mb-4">Créez votre premier template d&apos;email</p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Créer un template
              </Button>
            </div>
          ) : (
            <div className="table-container">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Nom</TableHead>
                    <TableHead className="text-xs">Sujet</TableHead>
                    <TableHead className="text-xs">Industrie</TableHead>
                    <TableHead className="text-xs">Variables</TableHead>
                    <TableHead className="text-xs w-[60px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const variables = extractTemplateVariables(template.html_content);
                    return (
                      <TableRow key={template.id}>
                        <TableCell className="py-2 text-sm font-medium">{template.name}</TableCell>
                        <TableCell className="py-2 text-sm text-muted-foreground max-w-xs truncate">
                          {template.subject}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="text-xs">
                            {getIndustryLabel(template.industry)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {variables.slice(0, 3).map((v) => (
                              <Badge key={v} variant="secondary" className="text-xs font-mono">{v}</Badge>
                            ))}
                            {variables.length > 3 && (
                              <Badge variant="secondary" className="text-xs">+{variables.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedTemplate(template); setPreviewOpen(true); }}>
                                <Eye className="mr-2 h-3.5 w-3.5" />
                                Prévisualiser
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setSelectedTemplate(template); setEditOpen(true); }}>
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { setTemplateToDelete(template); setDeleteOpen(true); }}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau Template</DialogTitle>
            <DialogDescription>Créez un nouveau template d&apos;email</DialogDescription>
          </DialogHeader>
          <TemplateForm onSuccess={handleFormSuccess} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le Template</DialogTitle>
            <DialogDescription>Modifiez les informations du template</DialogDescription>
          </DialogHeader>
          {selectedTemplate && <TemplateForm template={selectedTemplate} onSuccess={handleFormSuccess} />}
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTemplate?.name}</DialogTitle>
            <DialogDescription>
              <strong>Sujet:</strong> {selectedTemplate?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Variables</p>
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate && extractTemplateVariables(selectedTemplate.html_content).map((v) => (
                    <Badge key={v} variant="secondary" className="font-mono text-xs">{`{{ ${v} }}`}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Industrie</p>
                {selectedTemplate && (
                  <Badge variant="outline">{getIndustryLabel(selectedTemplate.industry)}</Badge>
                )}
              </div>
            </div>
            <div className="col-span-2 border rounded-lg p-4 bg-muted/30 max-h-[400px] overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground mb-3">Aperçu</p>
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{
                  __html: selectedTemplate ? renderPreviewHtml(selectedTemplate.html_content) : '',
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le template</DialogTitle>
            <DialogDescription>
              Supprimer &quot;{templateToDelete?.name}&quot; ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Annuler</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
