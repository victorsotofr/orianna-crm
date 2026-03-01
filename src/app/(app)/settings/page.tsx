'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, UserPlus, Trash2 } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { StickySaveBar } from '@/components/sticky-save-bar';
import { useTranslation, type Language } from '@/lib/i18n';
import { createClient } from '@/lib/supabase-browser';
import { useWorkspace } from '@/lib/workspace-context';
import { apiFetch } from '@/lib/api';

function PwInput({ value, onChange, show, onToggle, placeholder }: {
  value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm pr-8" placeholder={placeholder} />
      <button type="button" onClick={onToggle} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

type Section = 'email' | 'integrations' | 'preferences' | 'security' | 'workspace' | 'members';

export default function SettingsPage() {
  const { t, language, setLanguage } = useTranslation();
  const { workspace, members, refresh: refreshWorkspace } = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('email');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showImapPassword, setShowImapPassword] = useState(false);
  // Integrations state
  const [fullenrichApiKey, setFullenrichApiKey] = useState('');
  const [linkupApiKey, setLinkupApiKey] = useState('');
  const [fullenrichConfigured, setFullenrichConfigured] = useState(false);
  const [linkupConfigured, setLinkupConfigured] = useState(false);
  const [fullenrichCredits, setFullenrichCredits] = useState<number | null>(null);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [showFullenrichKey, setShowFullenrichKey] = useState(false);
  const [showLinkupKey, setShowLinkupKey] = useState(false);
  const [smtpHost, setSmtpHost] = useState('webmail.polytechnique.fr');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapHost, setImapHost] = useState('webmail.polytechnique.fr');
  const [imapPort, setImapPort] = useState('993');
  const [imapUser, setImapUser] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [dailySendLimit, setDailySendLimit] = useState('50');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [originalValues, setOriginalValues] = useState({
    smtpHost: 'webmail.polytechnique.fr', smtpPort: '587', smtpUser: '', smtpPassword: '',
    imapHost: 'webmail.polytechnique.fr', imapPort: '993', imapUser: '', imapPassword: '',
    dailySendLimit: '50',
  });

  useEffect(() => { fetchSettings(); fetchIntegrations(); }, []);
  useEffect(() => {
    setHasUnsavedChanges(
      smtpHost !== originalValues.smtpHost || smtpPort !== originalValues.smtpPort ||
      smtpUser !== originalValues.smtpUser || smtpPassword !== originalValues.smtpPassword ||
      imapHost !== originalValues.imapHost || imapPort !== originalValues.imapPort ||
      imapUser !== originalValues.imapUser || imapPassword !== originalValues.imapPassword ||
      dailySendLimit !== originalValues.dailySendLimit
    );
  }, [smtpHost, smtpPort, smtpUser, smtpPassword, imapHost, imapPort, imapUser, imapPassword, dailySendLimit, originalValues]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [hasUnsavedChanges]);

  const fetchSettings = async () => {
    try {
      const r = await fetch('/api/settings/save');
      if (r.ok) {
        const { settings } = await r.json();
        if (settings) {
          const v = {
            smtpHost: settings.smtp_host || 'webmail.polytechnique.fr', smtpPort: String(settings.smtp_port || '587'),
            smtpUser: settings.smtp_user || '', smtpPassword: settings.smtp_password || '',
            imapHost: settings.imap_host || 'webmail.polytechnique.fr', imapPort: String(settings.imap_port || '993'),
            imapUser: settings.imap_user || '', imapPassword: settings.imap_password || '',
            dailySendLimit: String(settings.daily_send_limit || '50'),
          };
          setSmtpHost(v.smtpHost); setSmtpPort(v.smtpPort); setSmtpUser(v.smtpUser); setSmtpPassword(v.smtpPassword);
          setImapHost(v.imapHost); setImapPort(v.imapPort); setImapUser(v.imapUser); setImapPassword(v.imapPassword);
          setDailySendLimit(v.dailySendLimit); setOriginalValues(v); setHasUnsavedChanges(false);
        }
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchIntegrations = async () => {
    try {
      const r = await apiFetch('/api/settings/workspace');
      if (r.ok) {
        const data = await r.json();
        setFullenrichConfigured(data.fullenrichConfigured || false);
        setLinkupConfigured(data.linkupConfigured || false);
      }
      // Fetch credits if FullEnrich is configured
      const cr = await apiFetch('/api/settings/enrichment-credits');
      if (cr.ok) {
        const cData = await cr.json();
        if (cData.configured) setFullenrichCredits(cData.credits);
      }
    } catch {}
  };

  const handleSaveIntegrations = async () => {
    setSavingIntegrations(true);
    try {
      const body: Record<string, string> = {};
      if (fullenrichApiKey) body.fullenrichApiKey = fullenrichApiKey;
      if (linkupApiKey) body.linkupApiKey = linkupApiKey;

      if (Object.keys(body).length === 0) {
        toast.error(t.settings.integrations.noChanges);
        return;
      }

      const r = await apiFetch('/api/settings/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (r.ok) {
        toast.success(t.settings.integrations.saved);
        setFullenrichApiKey('');
        setLinkupApiKey('');
        fetchIntegrations();
      } else {
        const d = await r.json();
        toast.error(d.error || t.settings.toasts.saveError);
      }
    } catch {
      toast.error(t.settings.toasts.networkError);
    } finally {
      setSavingIntegrations(false);
    }
  };

  const handleSave = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) { toast.error(t.settings.toasts.smtpRequired); return; }
    if (!smtpPassword) { toast.error(t.settings.toasts.passwordRequired); return; }
    setSaving(true);
    try {
      const body: Record<string, string> = { smtpHost, smtpPort, smtpUser, smtpPassword, imapHost, imapPort, imapUser, dailySendLimit };
      if (imapPassword) body.imapPassword = imapPassword;
      const r = await fetch('/api/settings/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) { toast.success(t.settings.toasts.saved); await fetchSettings(); }
      else { const d = await r.json(); toast.error(d.error || t.settings.toasts.saveError); }
    } catch { toast.error(t.settings.toasts.networkError); } finally { setSaving(false); }
  };
  const handleDiscard = useCallback(() => {
    setSmtpHost(originalValues.smtpHost); setSmtpPort(originalValues.smtpPort);
    setSmtpUser(originalValues.smtpUser); setSmtpPassword(originalValues.smtpPassword);
    setImapHost(originalValues.imapHost); setImapPort(originalValues.imapPort);
    setImapUser(originalValues.imapUser); setImapPassword(originalValues.imapPassword);
    setDailySendLimit(originalValues.dailySendLimit);
  }, [originalValues]);
  const handleTestConnection = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) { toast.error(t.settings.toasts.fillSmtp); return; }
    if (!smtpPassword) { toast.error(t.settings.toasts.passwordNeeded); return; }
    setTesting(true);
    try {
      const r = await fetch('/api/settings/test-smtp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smtpHost, smtpPort, smtpUser, smtpPassword }) });
      const d = await r.json();
      if (r.ok) { toast.success(d.message || t.settings.toasts.testSuccess); if (hasUnsavedChanges) await handleSave(); }
      else toast.error(d.error || t.settings.toasts.testFailed);
    } catch { toast.error(t.settings.toasts.networkError); } finally { setTesting(false); }
  };
  const handleChangePassword = async () => {
    if (!currentPassword) { toast.error(t.settings.password.currentRequired); return; }
    if (newPassword.length < 6) { toast.error(t.settings.password.tooShort); return; }
    if (newPassword !== confirmPassword) { toast.error(t.settings.password.mismatch); return; }
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('No user');
      // Verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (signInError) { toast.error(t.settings.password.currentWrong); return; }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t.settings.password.changed); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch { toast.error(t.settings.password.changeError); } finally { setChangingPassword(false); }
  };
  const fetchInvitations = async () => {
    try { const r = await apiFetch('/api/workspaces/invitations'); if (r.ok) { const d = await r.json(); setPendingInvitations(d.invitations || []); } } catch {}
  };
  useEffect(() => { if (workspace) { setWorkspaceName(workspace.name); fetchInvitations(); } }, [workspace]);
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return; setInviting(true);
    try {
      const r = await apiFetch('/api/workspaces/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail.trim() }) });
      if (r.ok) { toast.success(t.workspace.inviteSent); setInviteEmail(''); fetchInvitations(); }
      else { const d = await r.json(); toast.error(d.error || t.workspace.inviteError); }
    } catch { toast.error(t.workspace.inviteError); } finally { setInviting(false); }
  };
  const handleRemoveMember = async (id: string) => {
    try {
      const r = await apiFetch(`/api/workspaces/members/${id}`, { method: 'DELETE' });
      if (r.ok) { toast.success(t.workspace.removed); refreshWorkspace(); }
      else { const d = await r.json(); toast.error(d.error || t.workspace.removeError); }
    } catch { toast.error(t.workspace.removeError); }
  };
  const handleRenameWorkspace = async () => {
    if (!workspace || !workspaceName.trim()) return; setRenamingWorkspace(true);
    try {
      const r = await apiFetch(`/api/workspaces/${workspace.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: workspaceName.trim() }) });
      if (r.ok) { toast.success(t.workspace.renamed); refreshWorkspace(); }
      else { const d = await r.json(); toast.error(d.error || t.workspace.renameError); }
    } catch { toast.error(t.workspace.renameError); } finally { setRenamingWorkspace(false); }
  };
  const handleLanguageChange = async (lang: Language) => {
    const prev = language; setLanguage(lang);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('user_settings').update({ language: lang }).eq('user_id', user.id);
      if (error) throw error; toast.success(t.settings.toasts.languageChanged);
    } catch { setLanguage(prev); toast.error(t.settings.toasts.languageError); }
  };

  if (loading) {
    return (
      <>
        <SiteHeader title={t.settings.title} />
        <div className="page-container"><div className="flex items-center justify-center flex-1"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></div>
      </>
    );
  }

  const navItems: { key: Section; label: string; group: 'personal' | 'team' }[] = [
    { key: 'email', label: t.settings.nav.email, group: 'personal' },
    { key: 'integrations', label: t.settings.nav.integrations, group: 'personal' },
    { key: 'preferences', label: t.settings.nav.preferences, group: 'personal' },
    { key: 'security', label: t.settings.nav.security, group: 'personal' },
    { key: 'workspace', label: t.settings.nav.workspace, group: 'team' },
    { key: 'members', label: t.settings.nav.members, group: 'team' },
  ];

  return (
    <>
      <SiteHeader title={t.settings.title} />
      <div className="page-container">
        <div className="flex flex-1 min-h-0">

          {/* ── Left nav ── */}
          <nav className="w-[160px] shrink-0 border-r py-4 px-4 lg:px-6 space-y-4">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{t.settings.tabs.personal}</p>
              {navItems.filter(n => n.group === 'personal').map(n => (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  className={`block w-full text-left text-sm py-1.5 px-2 -mx-2 rounded-md transition-colors ${
                    section === n.key ? 'font-medium bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{t.settings.tabs.team}</p>
              {navItems.filter(n => n.group === 'team').map(n => (
                <button
                  key={n.key}
                  onClick={() => setSection(n.key)}
                  className={`block w-full text-left text-sm py-1.5 px-2 -mx-2 rounded-md transition-colors ${
                    section === n.key ? 'font-medium bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </nav>

          {/* ── Content ── */}
          <div className="flex-1 py-4 px-6 lg:px-10">
            <div className="grid grid-cols-[200px_1fr] gap-10 max-w-3xl">

              {/* Email */}
              {section === 'email' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">{t.settings.smtp.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.smtp.description}</p>
                    <p className="text-sm text-muted-foreground mt-3">{t.settings.imap.description}</p>
                  </div>
                  <div className="space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">SMTP</p>
                    <div className="grid grid-cols-[1fr_72px] gap-2">
                      <div><Label className="text-xs">{t.settings.smtp.server}</Label><Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} className="h-9 text-sm mt-1" /></div>
                      <div><Label className="text-xs">{t.settings.smtp.port}</Label><Input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} className="h-9 text-sm mt-1" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">{t.settings.smtp.user}</Label><Input type="email" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} className="h-9 text-sm mt-1" /></div>
                      <div><Label className="text-xs">{t.settings.smtp.password}</Label><div className="mt-1"><PwInput value={smtpPassword} onChange={setSmtpPassword} show={showSmtpPassword} onToggle={() => setShowSmtpPassword(!showSmtpPassword)} /></div></div>
                    </div>

                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-2">IMAP</p>
                    <div className="grid grid-cols-[1fr_72px] gap-2">
                      <div><Label className="text-xs">{t.settings.smtp.server}</Label><Input value={imapHost} onChange={e => setImapHost(e.target.value)} className="h-9 text-sm mt-1" /></div>
                      <div><Label className="text-xs">{t.settings.smtp.port}</Label><Input type="number" value={imapPort} onChange={e => setImapPort(e.target.value)} className="h-9 text-sm mt-1" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">{t.settings.smtp.user}</Label><Input value={imapUser} onChange={e => setImapUser(e.target.value)} className="h-9 text-sm mt-1" /></div>
                      <div><Label className="text-xs">{t.settings.smtp.password}</Label><div className="mt-1"><PwInput value={imapPassword} onChange={setImapPassword} show={showImapPassword} onToggle={() => setShowImapPassword(!showImapPassword)} /></div></div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[11px] text-muted-foreground">{t.settings.smtp.encrypted}</p>
                      <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
                        {testing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                        {t.settings.smtp.testConnection}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* Integrations */}
              {section === 'integrations' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">{t.settings.integrations.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.integrations.description}</p>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <Label className="text-xs">{t.settings.integrations.fullenrichKey}</Label>
                      <div className="mt-1">
                        <PwInput
                          value={fullenrichApiKey}
                          onChange={setFullenrichApiKey}
                          show={showFullenrichKey}
                          onToggle={() => setShowFullenrichKey(!showFullenrichKey)}
                          placeholder={fullenrichConfigured ? t.settings.integrations.configured : 'sk-...'}
                        />
                      </div>
                      {fullenrichConfigured && (
                        <p className="text-xs text-green-600 mt-1">
                          {t.settings.integrations.configured}
                          {fullenrichCredits !== null && ` — ${fullenrichCredits} ${t.settings.integrations.credits}`}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">{t.settings.integrations.linkupKey}</Label>
                      <div className="mt-1">
                        <PwInput
                          value={linkupApiKey}
                          onChange={setLinkupApiKey}
                          show={showLinkupKey}
                          onToggle={() => setShowLinkupKey(!showLinkupKey)}
                          placeholder={linkupConfigured ? t.settings.integrations.configured : 'lk-...'}
                        />
                      </div>
                      {linkupConfigured && (
                        <p className="text-xs text-green-600 mt-1">{t.settings.integrations.configured}</p>
                      )}
                    </div>
                    <Button size="sm" onClick={handleSaveIntegrations} disabled={savingIntegrations || (!fullenrichApiKey && !linkupApiKey)}>
                      {savingIntegrations && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {t.common.save}
                    </Button>
                  </div>
                </>
              )}

              {/* Preferences */}
              {section === 'preferences' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">{t.settings.nav.preferences}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.limits.description}</p>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <Label className="text-xs">{t.settings.limits.dailyLimit}</Label>
                      <Input type="number" value={dailySendLimit} onChange={e => setDailySendLimit(e.target.value)} className="h-9 text-sm w-28 mt-1" />
                      <p className="text-xs text-muted-foreground mt-1">{t.settings.limits.emailsPerDay}</p>
                    </div>
                    <div>
                      <Label className="text-xs">{t.settings.language.label}</Label>
                      <Select value={language} onValueChange={v => handleLanguageChange(v as Language)}>
                        <SelectTrigger className="h-9 text-sm w-44 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">{t.settings.language.fr}</SelectItem>
                          <SelectItem value="en">{t.settings.language.en}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Security */}
              {section === 'security' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">{t.settings.password.title}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t.settings.password.description}</p>
                  </div>
                  <div className="space-y-4 max-w-xs">
                    <div>
                      <Label className="text-xs">{t.settings.password.currentPassword}</Label>
                      <div className="mt-1"><PwInput value={currentPassword} onChange={setCurrentPassword} show={showCurrentPassword} onToggle={() => setShowCurrentPassword(!showCurrentPassword)} placeholder="••••••••" /></div>
                    </div>
                    <div>
                      <Label className="text-xs">{t.settings.password.newPassword}</Label>
                      <div className="mt-1"><PwInput value={newPassword} onChange={setNewPassword} show={showNewPassword} onToggle={() => setShowNewPassword(!showNewPassword)} placeholder="••••••••" /></div>
                    </div>
                    <div>
                      <Label className="text-xs">{t.settings.password.confirmPassword}</Label>
                      <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-9 text-sm mt-1" placeholder="••••••••" />
                    </div>
                    <Button size="sm" onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}>
                      {changingPassword && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {t.settings.password.change}
                    </Button>
                  </div>
                </>
              )}

              {/* Workspace */}
              {section === 'workspace' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">{t.workspace.name}</h2>
                  </div>
                  <div className="space-y-3 max-w-xs">
                    <div>
                      <Label className="text-xs">{t.workspace.name}</Label>
                      <Input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} className="h-9 text-sm mt-1" />
                    </div>
                    <Button size="sm" onClick={handleRenameWorkspace} disabled={renamingWorkspace || workspaceName === workspace?.name}>
                      {renamingWorkspace && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {t.common.save}
                    </Button>
                  </div>
                </>
              )}

              {/* Members */}
              {section === 'members' && (
                <>
                  <div>
                    <h2 className="text-base font-semibold">{t.workspace.members}</h2>
                    <p className="text-sm text-muted-foreground mt-1">{t.workspace.inviteDescription}</p>
                  </div>
                  <div className="space-y-5">
                    {/* Member list */}
                    <div className="space-y-0.5">
                      {members.map(m => (
                        <div key={m.id} className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{m.display_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-4">
                            <span className="text-xs text-muted-foreground">{m.role === 'admin' ? t.workspace.admin : t.workspace.member}</span>
                            {m.role !== 'admin' && (
                              <button onClick={() => handleRemoveMember(m.id)} className="text-muted-foreground hover:text-destructive transition-colors" title={t.workspace.removeMember}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Invite */}
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium mb-2">{t.workspace.inviteTitle}</p>
                      <div className="flex gap-2">
                        <Input type="email" placeholder={t.workspace.inviteEmailPlaceholder} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} className="h-9 text-sm max-w-xs" onKeyDown={e => e.key === 'Enter' && handleInvite()} />
                        <Button size="sm" onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                          {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
                          {t.workspace.inviteTitle}
                        </Button>
                      </div>
                    </div>

                    {/* Pending */}
                    {pendingInvitations.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground mb-2">{t.workspace.pendingInvitations}</p>
                        {pendingInvitations.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between py-1.5 text-sm">
                            <span className="truncate">{inv.email}</span>
                            <span className="text-xs text-muted-foreground ml-4 shrink-0">{new Date(inv.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      <StickySaveBar onSave={handleSave} saving={saving} hasChanges={hasUnsavedChanges} onDiscard={handleDiscard} />
    </>
  );
}
