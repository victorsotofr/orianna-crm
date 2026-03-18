'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SiteHeader } from '@/components/site-header';
import { toast } from 'sonner';
import { Plus, Loader2, FileText, Trash2, MoreHorizontal, Braces, Search, Mail, Pencil, LayoutGrid, List, Copy } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Template } from '@/types/database';
import { extractTemplateVariables } from '@/lib/template-renderer';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

type ViewMode = 'grid' | 'list';

export default function TemplatesPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('templates_view') as ViewMode) || 'grid';
    }
    return 'grid';
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
    supabase.auth.getUser().then((res: any) => {
      if (res.data?.user) setUserId(res.data.user.id);
    });
  }, []);

  const toggleView = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('templates_view', mode);
  };

  const fetchTemplates = async () => {
    try {
      const response = await apiFetch('/api/templates');
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

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        stripHtml(t.html_content).toLowerCase().includes(q)
    );
  }, [templates, search]);

  const { myTemplates, teamTemplates } = useMemo(() => {
    if (!userId) return { myTemplates: filtered, teamTemplates: [] };
    return {
      myTemplates: filtered.filter((t) => t.created_by === userId),
      teamTemplates: filtered.filter((t) => t.created_by !== userId),
    };
  }, [filtered, userId]);

  const handleDuplicate = async (template: Template) => {
    setDuplicating(template.id);
    try {
      const response = await apiFetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (copie)`,
          subject: template.subject,
          html_content: template.html_content,
        }),
      });
      if (response.ok) {
        toast.success(t.templates.toasts.duplicated);
        fetchTemplates();
      } else {
        toast.error(t.templates.toasts.duplicateError);
      }
    } catch {
      toast.error(t.templates.toasts.duplicateError);
    } finally {
      setDuplicating(null);
    }
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;
    setDeleting(true);
    try {
      const response = await apiFetch(`/api/templates/${templateToDelete.id}`, { method: 'DELETE' });
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

  // ── Shared card renderer ──────────────────────────────────────────
  const renderCard = (template: Template) => {
    const variables = extractTemplateVariables(template.html_content);
    const preview = stripHtml(template.html_content);

    return (
      <div
        key={template.id}
        className="group relative border rounded-lg overflow-hidden cursor-pointer hover:shadow-md hover:border-foreground/20 transition-all bg-card"
        onClick={() => router.push(`/templates/${template.id}`)}
      >
        <div className="bg-muted/50 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium truncate">{template.subject}</p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{template.name}</p>
            </div>
            {renderActions(template)}
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {preview || '—'}
          </p>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between gap-2">
          {variables.length > 0 ? (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Braces className="h-2.5 w-2.5" />
              {t.templates.nVariables(variables.length)}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">{t.templates.noVariables}</span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(template.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>
    );
  };

  // ── Shared list row renderer ──────────────────────────────────────
  const renderRow = (template: Template) => {
    const variables = extractTemplateVariables(template.html_content);
    const preview = stripHtml(template.html_content);

    return (
      <TableRow
        key={template.id}
        className="cursor-pointer hover:bg-muted/30 group"
        onClick={() => router.push(`/templates/${template.id}`)}
      >
        <TableCell>
          <div>
            <p className="text-xs font-medium">{template.name}</p>
            <p className="text-[11px] text-muted-foreground truncate max-w-xs">{template.subject}</p>
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground max-w-sm">
          <p className="truncate">{preview || '—'}</p>
        </TableCell>
        <TableCell>
          {variables.length > 0 ? (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Braces className="h-2.5 w-2.5" />
              {t.templates.nVariables(variables.length)}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">{t.templates.noVariables}</span>
          )}
        </TableCell>
        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
          {new Date(template.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {renderActions(template)}
        </TableCell>
      </TableRow>
    );
  };

  // ── Shared actions dropdown ───────────────────────────────────────
  const renderActions = (template: Template) => (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/templates/${template.id}`)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            {t.templates.viewEdit}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleDuplicate(template)}
            disabled={duplicating === template.id}
          >
            {duplicating === template.id
              ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              : <Copy className="mr-2 h-3.5 w-3.5" />}
            {t.templates.duplicate}
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
    </div>
  );

  // ── Section renderer ──────────────────────────────────────────────
  const renderSection = (title: string, items: Template[], count: number) => {
    if (items.length === 0) return null;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>
          <span className="text-xs text-muted-foreground">({count})</span>
        </div>
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map(renderCard)}
          </div>
        ) : (
          <div className="table-container">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>{t.templates.tableHeaders.name}</TableHead>
                  <TableHead>{t.templates.tableHeaders.subject}</TableHead>
                  <TableHead>{t.templates.tableHeaders.variables}</TableHead>
                  <TableHead className="w-[80px]">Date</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(renderRow)}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <SiteHeader title={t.templates.title} />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t.templates.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length}/{templates.length}
            </span>
            {/* View toggle */}
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => toggleView('grid')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => toggleView('list')}
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button size="sm" onClick={() => router.push('/templates/new')} className="ml-auto">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t.templates.new}
            </Button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[180px] rounded-lg" />
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
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center py-16">
              <Search className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">{t.templates.noResults}</p>
            </div>
          ) : (
            <div className="space-y-8">
              {renderSection(t.templates.myTemplates, myTemplates, myTemplates.length)}
              {renderSection(t.templates.teamTemplates, teamTemplates, teamTemplates.length)}
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
