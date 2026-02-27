'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { StickySaveBar } from '@/components/sticky-save-bar';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [smtpHost, setSmtpHost] = useState('webmail.polytechnique.fr');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapHost, setImapHost] = useState('webmail.polytechnique.fr');
  const [imapPort, setImapPort] = useState('993');
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [dailySendLimit, setDailySendLimit] = useState('50');

  const [originalValues, setOriginalValues] = useState({
    smtpHost: 'webmail.polytechnique.fr',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    imapHost: 'webmail.polytechnique.fr',
    imapPort: '993',
    imapUser: '',
    imapPassword: '',
    dailySendLimit: '50',
  });

  useEffect(() => { fetchSettings(); }, []);

  useEffect(() => {
    const hasChanges =
      smtpHost !== originalValues.smtpHost ||
      smtpPort !== originalValues.smtpPort ||
      smtpUser !== originalValues.smtpUser ||
      smtpPassword !== originalValues.smtpPassword ||
      imapHost !== originalValues.imapHost ||
      imapPort !== originalValues.imapPort ||
      imapUser !== originalValues.imapUser ||
      imapPassword !== originalValues.imapPassword ||
      dailySendLimit !== originalValues.dailySendLimit;
    setHasUnsavedChanges(hasChanges);
  }, [smtpHost, smtpPort, smtpUser, smtpPassword, imapHost, imapPort, imapUser, imapPassword, dailySendLimit, originalValues]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings/save');
      if (response.ok) {
        const { settings } = await response.json();
        if (settings) {
          const vals = {
            smtpHost: settings.smtp_host || 'webmail.polytechnique.fr',
            smtpPort: String(settings.smtp_port || '587'),
            smtpUser: settings.smtp_user || '',
            smtpPassword: settings.has_password ? '••••••••' : '',
            imapHost: settings.imap_host || 'webmail.polytechnique.fr',
            imapPort: String(settings.imap_port || '993'),
            imapUser: settings.imap_user || '',
            imapPassword: settings.has_imap_password ? '••••••••' : '',
            dailySendLimit: String(settings.daily_send_limit || '50'),
          };
          setSmtpHost(vals.smtpHost);
          setSmtpPort(vals.smtpPort);
          setSmtpUser(vals.smtpUser);
          setSmtpPassword(vals.smtpPassword);
          setImapHost(vals.imapHost);
          setImapPort(vals.imapPort);
          setImapUser(vals.imapUser);
          setImapPassword(vals.imapPassword);
          setDailySendLimit(vals.dailySendLimit);
          setOriginalValues(vals);
          setHasUnsavedChanges(false);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) {
      toast.error('Veuillez remplir tous les champs SMTP requis');
      return;
    }
    const isPlaceholder = smtpPassword === '••••••••';
    if (!smtpPassword && !isPlaceholder) {
      toast.error('Veuillez entrer un mot de passe SMTP');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = {
        smtpHost, smtpPort, smtpUser,
        imapHost, imapPort, imapUser,
        dailySendLimit,
      };
      if (!isPlaceholder) body.smtpPassword = smtpPassword;
      if (imapPassword && imapPassword !== '••••••••') body.imapPassword = imapPassword;

      const response = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast.success('Paramètres enregistrés');
        await fetchSettings();
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de l\'enregistrement');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = useCallback(() => {
    setSmtpHost(originalValues.smtpHost);
    setSmtpPort(originalValues.smtpPort);
    setSmtpUser(originalValues.smtpUser);
    setSmtpPassword(originalValues.smtpPassword);
    setImapHost(originalValues.imapHost);
    setImapPort(originalValues.imapPort);
    setImapUser(originalValues.imapUser);
    setImapPassword(originalValues.imapPassword);
    setDailySendLimit(originalValues.dailySendLimit);
  }, [originalValues]);

  const handleTestConnection = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) {
      toast.error('Remplissez les champs SMTP');
      return;
    }
    const isPlaceholder = smtpPassword === '••••••••';
    if (!smtpPassword && !isPlaceholder) {
      toast.error('Mot de passe requis');
      return;
    }

    setTesting(true);
    try {
      const body: Record<string, string | boolean> = {
        smtpHost, smtpPort, smtpUser,
        useSavedPassword: isPlaceholder,
      };
      if (!isPlaceholder) body.smtpPassword = smtpPassword;

      const response = await fetch('/api/settings/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || 'Connexion réussie');
        if (hasUnsavedChanges) await handleSave();
      } else {
        toast.error(data.error || 'Échec du test');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <>
        <SiteHeader title="Paramètres" />
        <div className="page-container">
          <div className="flex items-center justify-center flex-1">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteHeader title="Paramètres" />
      <div className="px-4 py-4 lg:px-6 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* SMTP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Configuration SMTP</CardTitle>
              <CardDescription className="text-xs">Envoi d&apos;emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Serveur</Label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Utilisateur</Label>
                <Input type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mot de passe</Label>
                <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} className="h-8 text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  {smtpPassword === '••••••••' ? 'Mot de passe sauvegardé' : 'Sera chiffré avant stockage'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Tester la connexion
              </Button>
            </CardContent>
          </Card>

          {/* IMAP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Configuration IMAP</CardTitle>
              <CardDescription className="text-xs">Détection des réponses (optionnel)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Serveur</Label>
                  <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Port</Label>
                  <Input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Utilisateur</Label>
                <Input value={imapUser} onChange={(e) => setImapUser(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mot de passe</Label>
                <Input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)} className="h-8 text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  {imapPassword === '••••••••' ? 'Mot de passe sauvegardé' : 'Sera chiffré avant stockage'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Limits */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Limites</CardTitle>
              <CardDescription className="text-xs">Contrôle du volume d&apos;envoi</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <Label className="text-xs">Limite quotidienne</Label>
                <Input type="number" value={dailySendLimit} onChange={(e) => setDailySendLimit(e.target.value)} className="h-8 text-sm w-24" />
                <p className="text-[11px] text-muted-foreground">Emails par jour maximum</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <StickySaveBar
        onSave={handleSave}
        saving={saving}
        hasChanges={hasUnsavedChanges}
        onDiscard={handleDiscard}
      />
    </>
  );
}
