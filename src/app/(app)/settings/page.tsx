'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { StickySaveBar } from '@/components/sticky-save-bar';
import { useTranslation, type Language } from '@/lib/i18n';
import { createClient } from '@/lib/supabase-browser';

export default function SettingsPage() {
  const { t, language, setLanguage } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);

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
            smtpPassword: settings.smtp_password || '',
            imapHost: settings.imap_host || 'webmail.polytechnique.fr',
            imapPort: String(settings.imap_port || '993'),
            imapUser: settings.imap_user || '',
            imapPassword: settings.imap_password || '',
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
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) {
      toast.error(t.settings.toasts.smtpRequired);
      return;
    }
    if (!smtpPassword) {
      toast.error(t.settings.toasts.passwordRequired);
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = {
        smtpHost, smtpPort, smtpUser,
        smtpPassword,
        imapHost, imapPort, imapUser,
        dailySendLimit,
      };
      if (imapPassword) body.imapPassword = imapPassword;

      const response = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast.success(t.settings.toasts.saved);
        await fetchSettings();
      } else {
        const data = await response.json();
        toast.error(data.error || t.settings.toasts.saveError);
      }
    } catch {
      toast.error(t.settings.toasts.networkError);
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
      toast.error(t.settings.toasts.fillSmtp);
      return;
    }
    if (!smtpPassword) {
      toast.error(t.settings.toasts.passwordNeeded);
      return;
    }

    setTesting(true);
    try {
      const body: Record<string, string | boolean> = {
        smtpHost, smtpPort, smtpUser,
        smtpPassword,
      };

      const response = await fetch('/api/settings/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || t.settings.toasts.testSuccess);
        if (hasUnsavedChanges) await handleSave();
      } else {
        toast.error(data.error || t.settings.toasts.testFailed);
      }
    } catch {
      toast.error(t.settings.toasts.networkError);
    } finally {
      setTesting(false);
    }
  };

  const handleLanguageChange = async (lang: Language) => {
    const previousLanguage = language;
    setLanguage(lang);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('user_settings')
        .update({ language: lang })
        .eq('user_id', user.id);
      if (error) throw error;
      toast.success(t.settings.toasts.languageChanged);
    } catch {
      setLanguage(previousLanguage);
      toast.error(t.settings.toasts.languageError);
    }
  };

  if (loading) {
    return (
      <>
        <SiteHeader title={t.settings.title} />
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
      <SiteHeader title={t.settings.title} />
      <div className="page-container">
        <div className="page-content">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* SMTP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t.settings.smtp.title}</CardTitle>
              <CardDescription className="text-xs">{t.settings.smtp.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">{t.settings.smtp.server}</Label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.settings.smtp.port}</Label>
                  <Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.settings.smtp.user}</Label>
                <Input type="email" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.settings.smtp.password}</Label>
                <div className="relative">
                  <Input
                    type={showSmtpPassword ? 'text' : 'password'}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="h-8 text-sm pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSmtpPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t.settings.smtp.encrypted}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {t.settings.smtp.testConnection}
              </Button>
            </CardContent>
          </Card>

          {/* IMAP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t.settings.imap.title}</CardTitle>
              <CardDescription className="text-xs">{t.settings.imap.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">{t.settings.smtp.server}</Label>
                  <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t.settings.smtp.port}</Label>
                  <Input type="number" value={imapPort} onChange={(e) => setImapPort(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.settings.smtp.user}</Label>
                <Input value={imapUser} onChange={(e) => setImapUser(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t.settings.smtp.password}</Label>
                <div className="relative">
                  <Input
                    type={showImapPassword ? 'text' : 'password'}
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    className="h-8 text-sm pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowImapPassword(!showImapPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showImapPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t.settings.smtp.encrypted}</p>
              </div>
            </CardContent>
          </Card>

          {/* Limits + Language */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t.settings.limits.title}</CardTitle>
                <CardDescription className="text-xs">{t.settings.limits.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <Label className="text-xs">{t.settings.limits.dailyLimit}</Label>
                  <Input type="number" value={dailySendLimit} onChange={(e) => setDailySendLimit(e.target.value)} className="h-8 text-sm w-24" />
                  <p className="text-[11px] text-muted-foreground">{t.settings.limits.emailsPerDay}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{t.settings.language.title}</CardTitle>
                <CardDescription className="text-xs">{t.settings.language.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  <Label className="text-xs">{t.settings.language.label}</Label>
                  <Select value={language} onValueChange={(v) => handleLanguageChange(v as Language)}>
                    <SelectTrigger className="h-8 text-sm w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">{t.settings.language.fr}</SelectItem>
                      <SelectItem value="en">{t.settings.language.en}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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
