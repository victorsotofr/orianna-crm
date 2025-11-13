'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Eye, FileText, Loader2, Plus, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Template } from '@/types/database';
import { extractTemplateVariables } from '@/lib/template-renderer';
import { SiteHeader } from '@/components/site-header';
import { TemplateForm } from '@/components/template-form';

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
      } else {
        toast.error('Erreur lors du chargement des templates');
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Erreur lors du chargement des templates');
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
    // First check if it's a custom industry
    const customIndustry = industries.find(ind => ind.name === industry);
    if (customIndustry) {
      return customIndustry.display_name;
    }

    // Fallback to predefined labels
    const labels: { [key: string]: string } = {
      real_estate: 'Immobilier',
      notary: 'Notaire',
      hotel: 'Hôtellerie',
      other: 'Autre',
    };
    return labels[industry] || industry;
  };

  const getIndustryColor = (industry: string) => {
    const colors: { [key: string]: string } = {
      real_estate: 'bg-blue-500',
      notary: 'bg-purple-500',
      hotel: 'bg-green-500',
      other: 'bg-gray-500',
    };
    // Use predefined color or a default color for custom industries
    return colors[industry] || 'bg-orange-500';
  };

  const handlePreview = (template: Template) => {
    setSelectedTemplate(template);
    setPreviewOpen(true);
  };

  const handleEdit = (template: Template) => {
    setSelectedTemplate(template);
    setEditOpen(true);
  };

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    
    setDeleting(true);
    const loadingToast = toast.loading('Suppression du template...');
    
    try {
      const response = await fetch(`/api/templates/${templateToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      toast.dismiss(loadingToast);

      if (response.ok) {
        toast.success(data.message || 'Template supprimé avec succès', {
          description: `Le template "${templateToDelete.name}" a été supprimé`,
          duration: 4000,
        });
        fetchTemplates();
        setDeleteOpen(false);
        setTemplateToDelete(null);
      } else {
        toast.error(data.error || 'Erreur lors de la suppression du template', {
          description: 'Veuillez réessayer ou contacter le support',
          duration: 5000,
        });
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Error deleting template:', error);
      toast.error('Erreur réseau lors de la suppression', {
        description: error.message || 'Vérifiez votre connexion internet',
        duration: 5000,
      });
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
    let preview = htmlContent
      .replace(/\{\{\s*first_name\s*\}\}/g, 'Jean')
      .replace(/\{\{\s*last_name\s*\}\}/g, 'Dupont')
      .replace(/\{\{\s*company_name\s*\}\}/g, 'Entreprise Example')
      .replace(/\{\{\s*video_url\s*\}\}/g, 'https://example.com/video');
    
    return preview;
  };

  if (loading) {
    return (
      <>
        <SiteHeader title="Templates" />
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader title="Templates" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          
          {/* Header with Add button */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground">
                Gérez vos templates d'emails pour vos campagnes
              </p>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nouveau Template
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nouveau Template</DialogTitle>
                  <DialogDescription>
                    Créez un nouveau template d'email
                  </DialogDescription>
                </DialogHeader>
                <TemplateForm onSuccess={handleFormSuccess} />
              </DialogContent>
            </Dialog>
          </div>

          {/* Templates Table - Clean single border */}
          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Aucun template disponible</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Créer votre premier template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Industrie</TableHead>
                    <TableHead>Variables</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const variables = extractTemplateVariables(template.html_content);
                    return (
                      <TableRow key={template.id}>
                        <TableCell className="font-medium">
                          {template.name}
                        </TableCell>
                        <TableCell className="max-w-md truncate">
                          {template.subject}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getIndustryColor(template.industry)} text-white`}>
                            {getIndustryLabel(template.industry)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {variables.slice(0, 3).map((variable) => (
                              <Badge key={variable} variant="outline" className="text-xs">
                                {variable}
                              </Badge>
                            ))}
                            {variables.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{variables.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Ouvrir le menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handlePreview(template)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Prévisualiser
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(template)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Modifier
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDeleteClick(template)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
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

          {/* Preview Dialog - Wide horizontal layout */}
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-xl">{selectedTemplate?.name}</DialogTitle>
                <DialogDescription className="text-base">
                  <strong>Sujet:</strong> {selectedTemplate?.subject}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left side - Variables and Info */}
                <div className="md:col-span-1 space-y-4">
                  <div>
                    <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                      Variables disponibles
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate &&
                        extractTemplateVariables(selectedTemplate.html_content).map((variable) => (
                          <Badge key={variable} variant="secondary" className="font-mono text-xs">
                            {`{{ ${variable} }}`}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-sm text-muted-foreground uppercase tracking-wide">
                      Industrie
                    </h3>
                    {selectedTemplate && (
                      <Badge className={`${getIndustryColor(selectedTemplate.industry)} text-white`}>
                        {getIndustryLabel(selectedTemplate.industry)}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Right side - Preview */}
                <div className="md:col-span-2">
                  <div className="border rounded-lg p-6 bg-muted/30 max-h-[500px] overflow-y-auto">
                    <h3 className="font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wide">
                      Aperçu avec données d'exemple
                    </h3>
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{
                        __html: selectedTemplate ? renderPreviewHtml(selectedTemplate.html_content) : '',
                      }}
                    />
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Modifier le Template</DialogTitle>
                <DialogDescription>
                  Modifiez les informations du template
                </DialogDescription>
              </DialogHeader>
              {selectedTemplate && (
                <TemplateForm
                  template={selectedTemplate}
                  onSuccess={handleFormSuccess}
                />
              )}
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Supprimer le template</DialogTitle>
                <DialogDescription>
                  Êtes-vous sûr de vouloir supprimer le template &quot;{templateToDelete?.name}&quot; ?
                  Cette action est irréversible.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  Annuler
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    'Supprimer'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </>
  );
}
