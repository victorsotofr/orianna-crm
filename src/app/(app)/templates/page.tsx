'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { Plus, Loader2, FileText, Eye, Trash2, MoreHorizontal, Braces } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Template } from '@/types/database';
import { extractTemplateVariables } from '@/lib/template-renderer';
import { AVAILABLE_VARIABLES } from '@/components/variable-picker';
import { useTranslation } from '@/lib/i18n';

export default function TemplatesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
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

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/templates/${templateToDelete.id}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success(t.templates.toasts.deleted);
        fetchTemplates();
        setDeleteOpen(false);
        setTemplateToDelete(null);
      } else {
        toast.error(t.templates.toasts.deleteError);
      }
    } catch {
      toast.error(t.templates.toasts.deleteError);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SiteHeader title={t.templates.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <CompactStatsBar stats={[
              { label: t.templates.title, value: templates.length },
            ]} />
            <Button size="sm" onClick={() => router.push('/templates/new')}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t.templates.new}
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[100px] rounded-lg" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">{t.templates.emptyState.title}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t.templates.emptyState.description}</p>
              <Button size="sm" onClick={() => router.push('/templates/new')}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t.templates.emptyState.button}
              </Button>
            </div>
          ) : (
            <div className="table-container">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs">{t.templates.tableHeaders.name}</TableHead>
                    <TableHead className="text-xs">{t.templates.tableHeaders.subject}</TableHead>
                    <TableHead className="text-xs">{t.templates.tableHeaders.variables}</TableHead>
                    <TableHead className="text-xs w-[60px]">{t.templates.tableHeaders.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => {
                    const variables = extractTemplateVariables(template.html_content);
                    return (
                      <TableRow
                        key={template.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/templates/${template.id}`)}
                      >
                        <TableCell className="py-2 text-sm font-medium">{template.name}</TableCell>
                        <TableCell className="py-2 text-sm text-muted-foreground max-w-xs truncate">
                          {template.subject}
                        </TableCell>
                        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                          {variables.length > 0 ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="cursor-pointer text-xs gap-1 hover:bg-secondary/80"
                                >
                                  <Braces className="h-3 w-3" />
                                  {t.templates.nVariables(variables.length)}
                                </Badge>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
                                {variables.map((v) => {
                                  const info = AVAILABLE_VARIABLES.find((av) => av.name === v);
                                  return (
                                    <DropdownMenuItem key={v} className="flex items-center justify-between">
                                      <Badge variant="secondary" className="font-mono text-xs">{`{{${v}}}`}</Badge>
                                      <span className="text-xs text-muted-foreground">{info?.label || v}</span>
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t.templates.noVariables}</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/templates/${template.id}`)}>
                                <Eye className="mr-2 h-3.5 w-3.5" />
                                {t.templates.viewEdit}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => { setTemplateToDelete(template); setDeleteOpen(true); }}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                {t.common.delete}
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

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.templates.deleteDialog.title}</DialogTitle>
            <DialogDescription>
              {templateToDelete ? t.templates.deleteDialog.description(templateToDelete.name) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>{t.common.cancel}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {t.common.delete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
