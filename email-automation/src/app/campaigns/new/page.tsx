'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Send, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Contact, Template } from '@/types/database';
import { extractTemplateVariables } from '@/lib/template-renderer';
import { SiteHeader } from '@/components/site-header';
import { ContactsDataTable } from '@/components/contacts-data-table';
import { IndustrySelector } from '@/components/industry-selector';

interface SendProgress {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  sending: boolean;
}

export default function NewCampaignPage() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateVariables, setTemplateVariables] = useState<{ [key: string]: string }>({});
  const [campaignName, setCampaignName] = useState('');
  
  const [sendProgress, setSendProgress] = useState<SendProgress>({
    total: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    sending: false,
  });

  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      const template = templates.find((t) => t.id === selectedTemplate);
      if (template) {
        const variables = extractTemplateVariables(template.html_content);
        const variablesObj: { [key: string]: string } = {};
        variables.forEach((v) => {
          if (!['first_name', 'last_name', 'email', 'company_name'].includes(v)) {
            variablesObj[v] = '';
          }
        });
        setTemplateVariables(variablesObj);
      }
    }
  }, [selectedTemplate, templates]);

  useEffect(() => {
    // Warn user if they try to leave during sending
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sendProgress.sending) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sendProgress.sending]);

  const fetchData = async () => {
    try {
      const [contactsRes, templatesRes] = await Promise.all([
        fetch('/api/contacts/search'),
        fetch('/api/templates'),
      ]);

      if (contactsRes.ok) {
        const contactsData = await contactsRes.json();
        setContacts(contactsData.contacts || []);
      }

      if (templatesRes.ok) {
        const templatesData = await templatesRes.json();
        setTemplates(templatesData.templates || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter((contact) => {
    if (selectedIndustry === 'all') return true;
    return contact.industry === selectedIndustry;
  });

  const validateForm = () => {
    if (!campaignName.trim()) {
      toast.error('Veuillez entrer un nom de campagne');
      return false;
    }

    if (selectedContacts.length === 0) {
      toast.error('Veuillez sélectionner au moins un contact');
      return false;
    }

    if (!selectedTemplate) {
      toast.error('Veuillez sélectionner un template');
      return false;
    }

    // Validate template variables
    for (const [key, value] of Object.entries(templateVariables)) {
      if (!value.trim()) {
        toast.error(`Veuillez remplir la variable: ${key}`);
        return false;
      }
    }

    return true;
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleSendCampaign = async () => {
    if (!validateForm()) return;

    setShowWarning(false);
    setSendProgress({
      total: selectedContacts.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      sending: true,
    });

    const DELAY_MS = 8000; // 8 seconds between emails
    const contactsToSend = contacts.filter((c) => selectedContacts.includes(c.id));

    // Create campaign first
    const campaignResponse = await fetch('/api/campaigns/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: campaignName,
        templateId: selectedTemplate,
        templateVariables,
        totalContacts: selectedContacts.length,
      }),
    });

    let campaignId = null;
    if (campaignResponse.ok) {
      const campaignData = await campaignResponse.json();
      campaignId = campaignData.campaignId;
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < contactsToSend.length; i++) {
      const contact = contactsToSend[i];

      try {
        const response = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactId: contact.id,
            templateId: selectedTemplate,
            campaignId,
            templateVariables,
          }),
        });

        const result = await response.json();

        if (result.alreadySent) {
          skipped++;
        } else if (result.success) {
          sent++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error('Error sending email:', error);
        failed++;
      }

      setSendProgress({
        total: selectedContacts.length,
        sent,
        failed,
        skipped,
        sending: true,
      });

      // Wait before next email (except for the last one)
      if (i < contactsToSend.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    // Mark campaign as completed
    if (campaignId) {
      await fetch(`/api/campaigns/${campaignId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sentCount: sent,
          failedCount: failed,
        }),
      });
    }

    setSendProgress((prev) => ({ ...prev, sending: false }));
    
    toast.success(
      `Campagne terminée: ${sent} envoyé${sent > 1 ? 's' : ''}, ${failed} échoué${failed > 1 ? 's' : ''}, ${skipped} ignoré${skipped > 1 ? 's' : ''}`
    );

    // Redirect to dashboard after a short delay
    setTimeout(() => {
      router.push('/dashboard');
    }, 2000);
  };

  if (loading) {
    return (
      <>
        <SiteHeader title="Nouvelle Campagne" />
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </>
    );
  }

  const progressPercentage = sendProgress.total > 0
    ? Math.round(((sendProgress.sent + sendProgress.failed + sendProgress.skipped) / sendProgress.total) * 100)
    : 0;

  return (
    <>
      <SiteHeader title="Nouvelle Campagne" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">

      {sendProgress.sending && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Ne fermez pas cette page pendant l&apos;envoi des emails!
          </AlertDescription>
        </Alert>
      )}

      {sendProgress.sending ? (
        <Card>
          <CardHeader>
            <CardTitle>Envoi en cours...</CardTitle>
            <CardDescription>
              {sendProgress.sent + sendProgress.failed + sendProgress.skipped} / {sendProgress.total} emails traités
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progressPercentage} className="w-full" />
            
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Envoyés</p>
                  <p className="text-2xl font-bold text-green-600">{sendProgress.sent}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-medium">Échoués</p>
                  <p className="text-2xl font-bold text-red-600">{sendProgress.failed}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium">Ignorés</p>
                  <p className="text-2xl font-bold text-yellow-600">{sendProgress.skipped}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Nom de la campagne</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Ex: Prospection Notaires - Janvier 2025"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sélection des contacts</CardTitle>
              <CardDescription>
                Filtrez et sélectionnez les contacts pour cette campagne
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <Label className="whitespace-nowrap">Filtrer par industrie:</Label>
                <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les industries</SelectItem>
                    <SelectItem value="real_estate">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        Immobilier
                      </div>
                    </SelectItem>
                    <SelectItem value="notary">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-purple-500" />
                        Notaire
                      </div>
                    </SelectItem>
                    <SelectItem value="hotel">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        Hôtellerie
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedIndustry === 'all' 
                    ? `${filteredContacts.length} contact(s) au total`
                    : `${filteredContacts.length} contact(s) dans cette industrie`
                  }
                </p>
              </div>

              <ContactsDataTable
                data={filteredContacts}
                selectedContactIds={selectedContacts}
                onSelectionChange={setSelectedContacts}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Template</CardTitle>
              <CardDescription>Choisissez le template d&apos;email</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} - {template.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedTemplate && Object.keys(templateVariables).length > 0 && (
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="font-semibold">Variables du template:</h3>
                  {Object.keys(templateVariables).map((variable) => (
                    <div key={variable} className="space-y-2">
                      <Label htmlFor={variable}>{variable}</Label>
                      <Input
                        id={variable}
                        value={templateVariables[variable]}
                        onChange={(e) =>
                          setTemplateVariables((prev) => ({
                            ...prev,
                            [variable]: e.target.value,
                          }))
                        }
                        placeholder={`Entrez ${variable}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={handleSendCampaign}
              disabled={selectedContacts.length === 0 || !selectedTemplate || sendProgress.sending}
              size="lg"
              className="min-w-[200px]"
            >
              <Send className="mr-2 h-4 w-4" />
              Lancer l&apos;envoi de {selectedContacts.length} email{selectedContacts.length > 1 ? 's' : ''}
            </Button>
          </div>
        </>
      )}
        </div>
      </div>
    </>
  );
}

