'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SiteHeader } from '@/components/site-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Pause, Play, Trash2, Mail, Users, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';
import type { Campaign, CampaignSequence, SequenceProgress } from '@/types/sequences';

interface Template {
  id: string;
  name: string;
  subject: string;
}

interface ContactProgress extends SequenceProgress {
  contact: {
    first_name: string | null;
    last_name: string | null;
    email: string;
    company_name: string | null;
  };
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
  const campaignId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sequence, setSequence] = useState<CampaignSequence | null>(null);
  const [templates, setTemplates] = useState<Record<string, Template>>({});
  const [contactProgress, setContactProgress] = useState<ContactProgress[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  const fetchData = useCallback(async () => {
    if (!campaignId) return;

    try {
      const response = await apiFetch(`/api/campaigns/sequences/${campaignId}`);
      if (!response.ok) {
        toast.error(t.common.networkError);
        router.push('/campaigns');
        return;
      }

      const data = await response.json();
      setCampaign(data.campaign);
      setSequence(data.sequence);
      setTemplates(data.templates || {});
      setContactProgress(data.contactProgress || []);
    } catch (error) {
      console.error('Error fetching campaign:', error);
      toast.error(t.common.networkError);
      router.push('/campaigns');
    } finally {
      setLoading(false);
    }
  }, [campaignId, t, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePause = async () => {
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/campaigns/sequences/${campaignId}/pause`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success(t.sequences.toasts.paused);
        fetchData();
      } else {
        toast.error(t.sequences.toasts.pauseError);
      }
    } catch {
      toast.error(t.sequences.toasts.pauseError);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/campaigns/sequences/${campaignId}/resume`, {
        method: 'POST',
      });

      if (response.ok) {
        toast.success(t.sequences.toasts.resumed);
        fetchData();
      } else {
        toast.error(t.sequences.toasts.resumeError);
      }
    } catch {
      toast.error(t.sequences.toasts.resumeError);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/campaigns/sequences/${campaignId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success(t.sequences.toasts.deleted);
        router.push('/campaigns');
      } else {
        toast.error(t.sequences.toasts.deleteError);
      }
    } catch {
      toast.error(t.sequences.toasts.deleteError);
    } finally {
      setActionLoading(false);
      setShowDeleteDialog(false);
    }
  };

  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const response = await apiFetch(`/api/campaigns/sequences/${campaignId}/send-now`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[send-now] Response:', data);

        if (data.sent > 0) {
          toast.success(`${data.sent} email(s) envoyé(s)`);
          fetchData(); // Refresh to see updated stats
        } else {
          const errorMsg = data.errors && data.errors.length > 0
            ? `Erreur: ${data.errors[0].error}`
            : data.message || 'Aucun email à envoyer';
          toast.error(errorMsg);

          // Log all errors to console for debugging
          if (data.errors) {
            console.error('[send-now] Errors:', data.errors);
          }
        }
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de l\'envoi');
      }
    } catch (err) {
      console.error('[send-now] Exception:', err);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setSendingNow(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStepLabel = (stepNumber: number) => {
    if (stepNumber === 0) return t.sequences.initialEmail;
    return t.sequences.followUp(stepNumber);
  };

  const stats = {
    total: contactProgress.length,
    completed: contactProgress.filter(cp => cp.is_completed).length,
    inProgress: contactProgress.filter(cp => !cp.is_completed && !cp.is_paused).length,
    paused: contactProgress.filter(cp => cp.is_paused).length,
  };

  return (
    <>
      <SiteHeader title={campaign?.name || t.sequences.title} />
      <div className="page-container">
        <div className="page-content">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : campaign ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={() => router.push('/campaigns')}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t.common.back}
                </Button>
                {campaign.is_sequence && sequence && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSendNow}
                      disabled={sendingNow || actionLoading}
                    >
                      {sendingNow ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Mail className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {sequence.is_active ? 'Envoyer maintenant' : 'Commencer la campagne'}
                    </Button>
                    {sequence.is_active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePause}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Pause className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {t.sequences.detail.pause}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResume}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {t.sequences.detail.resume}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                      disabled={actionLoading}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      {t.sequences.detail.delete}
                    </Button>
                  </div>
                )}
              </div>

              {/* Campaign info */}
              <div className="border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">{campaign.name}</h2>
                    {campaign.description && (
                      <p className="text-sm text-muted-foreground mt-1">{campaign.description}</p>
                    )}
                  </div>
                  <Badge variant={campaign.is_sequence ? 'default' : 'secondary'}>
                    {campaign.is_sequence ? t.sequences.list.sequence : t.sequences.list.manual}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {t.sequences.list.created}: {formatDate(campaign.created_at)}
                </div>
              </div>

              {/* Stats cards (only for sequences) */}
              {campaign.is_sequence && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Users className="h-4 w-4" />
                      <span className="text-xs">{t.sequences.detail.totalContacts}</span>
                    </div>
                    <div className="text-2xl font-bold">{stats.total}</div>
                  </div>
                  <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs">{t.sequences.detail.completed}</span>
                    </div>
                    <div className="text-2xl font-bold">{stats.completed}</div>
                  </div>
                  <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs">{t.sequences.detail.inProgress}</span>
                    </div>
                    <div className="text-2xl font-bold">{stats.inProgress}</div>
                  </div>
                  <div className="border rounded-lg p-4 bg-card">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Pause className="h-4 w-4" />
                      <span className="text-xs">{t.sequences.detail.paused}</span>
                    </div>
                    <div className="text-2xl font-bold">{stats.paused}</div>
                  </div>
                </div>
              )}

              {/* Sequence steps */}
              {campaign.is_sequence && sequence && (
                <div className="border rounded-lg p-4 space-y-3 bg-card">
                  <h3 className="text-sm font-medium">{t.sequences.detail.viewSequence}</h3>
                  <div className="space-y-2">
                    {sequence.steps.map((step: any) => {
                      const hasSent = step.stats?.sent > 0;
                      const hasScheduled = step.stats?.scheduled > 0;
                      const nextSendDate = step.stats?.nextSendDate;

                      return (
                        <div key={step.step_order} className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {getStepLabel(step.step_order)}
                            </Badge>
                            {step.step_order > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {t.sequences.delayDays(step.delay_days)} {t.sequences.afterPrevious}
                              </span>
                            )}
                            {hasSent && (
                              <div className="flex items-center gap-1 ml-auto">
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-medium text-green-600">
                                  {step.stats.sent} envoyé{step.stats.sent > 1 ? 's' : ''}
                                </span>
                              </div>
                            )}
                            {!hasSent && hasScheduled && nextSendDate && (
                              <div className="flex items-center gap-1 ml-auto">
                                <Clock className="h-3.5 w-3.5 text-blue-600" />
                                <span className="text-xs font-medium text-blue-600">
                                  Prévu: {formatDate(nextSendDate)}
                                </span>
                              </div>
                            )}
                            {!hasSent && !hasScheduled && (
                              <Badge variant="outline" className="text-xs ml-auto">
                                En attente
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              {templates[step.template_id]?.name || step.template_id}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {templates[step.template_id]?.subject}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contact progress table (only for sequences) */}
              {campaign.is_sequence && contactProgress.length > 0 && (
                <div className="border rounded-lg overflow-hidden bg-card">
                  <div className="p-4 border-b">
                    <h3 className="text-sm font-medium">{t.sequences.detail.contacts}</h3>
                  </div>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr className="border-b">
                          <th className="h-9 px-3 text-left text-xs font-medium">
                            {t.campaigns.tableHeaders.name}
                          </th>
                          <th className="h-9 px-3 text-left text-xs font-medium">
                            {t.campaigns.tableHeaders.email}
                          </th>
                          <th className="h-9 px-3 text-left text-xs font-medium">
                            {t.campaigns.tableHeaders.company}
                          </th>
                          <th className="h-9 px-3 text-left text-xs font-medium">
                            {t.sequences.detail.currentStep}
                          </th>
                          <th className="h-9 px-3 text-left text-xs font-medium">
                            {t.sequences.detail.nextSend}
                          </th>
                          <th className="h-9 px-3 text-left text-xs font-medium">
                            {t.common.status}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {contactProgress.map(cp => (
                          <tr key={cp.contact_id} className="border-b hover:bg-muted/30">
                            <td className="px-3 py-2 text-xs font-medium">
                              {cp.contact.first_name} {cp.contact.last_name}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {cp.contact.email}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {cp.contact.company_name || '\u2014'}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-xs">
                                {getStepLabel(cp.current_step)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {cp.next_send_date ? formatDate(cp.next_send_date) : '\u2014'}
                            </td>
                            <td className="px-3 py-2">
                              {cp.is_completed ? (
                                <Badge variant="secondary" className="text-xs">
                                  {t.sequences.status.completed}
                                </Badge>
                              ) : cp.is_paused ? (
                                <Badge variant="outline" className="text-xs">
                                  {t.sequences.status.paused}
                                </Badge>
                              ) : (
                                <Badge variant="default" className="text-xs">
                                  {t.sequences.status.active}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Manual campaign message */}
              {!campaign.is_sequence && (
                <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-card">
                  <Mail className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-sm font-medium mb-1">{t.sequences.detail.manualCampaign}</h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    {t.sequences.emptyState.description}
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.sequences.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.sequences.deleteDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={actionLoading}>
              {actionLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
