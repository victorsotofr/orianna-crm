'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const [smtpHost, setSmtpHost] = useState('webmail.polytechnique.fr');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [imapHost, setImapHost] = useState('imap.polytechnique.edu');
  const [imapPort, setImapPort] = useState('993');
  const [signatureHtml, setSignatureHtml] = useState('');
  const [dailySendLimit, setDailySendLimit] = useState('50');

  // Track original values to detect changes
  const [originalValues, setOriginalValues] = useState({
    smtpHost: 'webmail.polytechnique.fr',
    smtpPort: '587',
    smtpUser: '',
    smtpPassword: '',
    imapHost: 'imap.polytechnique.edu',
    imapPort: '993',
    signatureHtml: '',
    dailySendLimit: '50',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  // Detect unsaved changes
  useEffect(() => {
    const hasChanges = 
      smtpHost !== originalValues.smtpHost ||
      smtpPort !== originalValues.smtpPort ||
      smtpUser !== originalValues.smtpUser ||
      smtpPassword !== originalValues.smtpPassword ||
      imapHost !== originalValues.imapHost ||
      imapPort !== originalValues.imapPort ||
      signatureHtml !== originalValues.signatureHtml ||
      dailySendLimit !== originalValues.dailySendLimit;
    
    setHasUnsavedChanges(hasChanges);
  }, [smtpHost, smtpPort, smtpUser, smtpPassword, imapHost, imapPort, signatureHtml, dailySendLimit, originalValues]);

  // Warn before leaving page with unsaved changes
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
          const host = settings.smtp_host || 'webmail.polytechnique.fr';
          const port = String(settings.smtp_port || '587');
          const user = settings.smtp_user || '';
          const password = settings.has_password ? '••••••••' : '';
          const imapH = settings.imap_host || 'imap.polytechnique.edu';
          const imapP = String(settings.imap_port || '993');
          const signature = settings.signature_html || '';
          const limit = String(settings.daily_send_limit || '50');

          setSmtpHost(host);
          setSmtpPort(port);
          setSmtpUser(user);
          setSmtpPassword(password);
          setImapHost(imapH);
          setImapPort(imapP);
          setSignatureHtml(signature);
          setDailySendLimit(limit);

          // Store original values
          setOriginalValues({
            smtpHost: host,
            smtpPort: port,
            smtpUser: user,
            smtpPassword: password,
            imapHost: imapH,
            imapPort: imapP,
            signatureHtml: signature,
            dailySendLimit: limit,
          });

          setHasUnsavedChanges(false);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) {
      toast.error('Veuillez remplir tous les champs SMTP requis');
      return;
    }

    // Check if password is the placeholder (already saved)
    const isPlaceholderPassword = smtpPassword === '••••••••';
    
    if (!smtpPassword && !isPlaceholderPassword) {
      toast.error('Veuillez entrer un mot de passe SMTP');
      return;
    }

    // Check if signature is provided (REQUIRED)
    if (!signatureHtml || signatureHtml.trim() === '') {
      toast.error('La signature email est obligatoire', {
        description: 'Ajoutez votre signature pour personnaliser vos emails',
        duration: 5000,
      });
      return;
    }

    setSaving(true);
    const loadingToast = toast.loading('Enregistrement des paramètres...');
    
    try {
      const requestBody: any = {
        smtpHost,
        smtpPort,
        smtpUser,
        imapHost,
        imapPort,
        signatureHtml,
        dailySendLimit,
      };

      // Only include password if it's not the placeholder
      if (!isPlaceholderPassword) {
        requestBody.smtpPassword = smtpPassword;
      }

      const response = await fetch('/api/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      toast.dismiss(loadingToast);

      if (response.ok) {
        toast.success('Paramètres enregistrés avec succès', {
          description: 'Vos identifiants SMTP ont été chiffrés et sauvegardés.',
          duration: 4000,
        });
        
        // Update original values after successful save
        setOriginalValues({
          smtpHost,
          smtpPort,
          smtpUser,
          smtpPassword: smtpPassword || originalValues.smtpPassword,
          imapHost,
          imapPort,
          signatureHtml,
          dailySendLimit,
        });
        setHasUnsavedChanges(false);

        // Refresh settings from DB to get has_password flag
        await fetchSettings();
      } else {
        toast.error(data.error || 'Erreur lors de l\'enregistrement', {
          description: 'Veuillez réessayer ou contacter le support.',
          duration: 5000,
        });
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Save settings error:', error);
      toast.error('Erreur réseau lors de l\'enregistrement', {
        description: error.message || 'Vérifiez votre connexion internet.',
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!smtpHost || !smtpPort || !smtpUser) {
      toast.error('Veuillez remplir tous les champs SMTP requis');
      return;
    }

    // Check if password is the placeholder (use saved password from DB)
    const isPlaceholderPassword = smtpPassword === '••••••••';
    
    if (!smtpPassword && !isPlaceholderPassword) {
      toast.error('Veuillez entrer un mot de passe SMTP');
      return;
    }

    setTesting(true);
    // Show loading toast
    const loadingToast = toast.loading('Test de connexion SMTP en cours...');
    
    try {
      const requestBody: any = {
        smtpHost,
        smtpPort,
        smtpUser,
        useSavedPassword: isPlaceholderPassword, // Flag to use saved password
      };

      // Only include password if it's not the placeholder
      if (!isPlaceholderPassword) {
        requestBody.smtpPassword = smtpPassword;
      }

      const response = await fetch('/api/settings/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (response.ok) {
        toast.success(data.message || 'Test de connexion réussi! Vérifiez votre boîte mail.', {
          duration: 5000,
        });

        // Auto-save settings after successful test
        if (hasUnsavedChanges) {
          toast.loading('Sauvegarde automatique des paramètres...', { id: 'auto-save' });
          await handleSave();
          toast.dismiss('auto-save');
        }
      } else {
        toast.error(data.error || 'Échec du test de connexion', {
          description: 'Vérifiez vos identifiants et réessayez.',
          duration: 6000,
        });
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Test connection error:', error);
      toast.error('Erreur réseau lors du test de connexion', {
        description: error.message || 'Vérifiez votre connexion internet.',
        duration: 5000,
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <>
        <SiteHeader title="Paramètres" />
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
      <SiteHeader title="Paramètres" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">

          {/* Unsaved changes warning */}
          {hasUnsavedChanges && (
            <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900">
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                ⚠️ Vous avez des modifications non sauvegardées. Cliquez sur &quot;Enregistrer les paramètres&quot; en bas de page pour les conserver.
              </AlertDescription>
            </Alert>
          )}

      <Card>
        <CardHeader>
          <CardTitle>Configuration SMTP</CardTitle>
          <CardDescription>
            Paramètres pour l&apos;envoi d&apos;emails. Vos identifiants seront chiffrés avant stockage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtpHost">Serveur SMTP</Label>
              <Input
                id="smtpHost"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="webmail.polytechnique.fr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtpPort">Port SMTP</Label>
              <Input
                id="smtpPort"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                placeholder="587"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpUser">Email / Nom d&apos;utilisateur</Label>
            <Input
              id="smtpUser"
              type="email"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="vous@polytechnique.edu"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpPassword">Mot de passe SMTP</Label>
            <Input
              id="smtpPassword"
              type="password"
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder="••••••••"
            />
            <p className="text-xs text-muted-foreground">
              {smtpPassword === '••••••••' 
                ? 'Un mot de passe est déjà sauvegardé. Laissez ce champ tel quel pour le conserver, ou entrez un nouveau mot de passe pour le remplacer.'
                : 'Votre mot de passe sera chiffré avant d\'être stocké'
              }
            </p>
          </div>

          <Button
            onClick={handleTestConnection}
            disabled={testing}
            variant="outline"
            className="w-full md:w-auto"
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Test en cours...
              </>
            ) : (
              'Tester la connexion'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration IMAP (Optionnel)</CardTitle>
          <CardDescription>
            Pour la détection automatique des réponses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imapHost">Serveur IMAP</Label>
              <Input
                id="imapHost"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                placeholder="imap.polytechnique.edu"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imapPort">Port IMAP</Label>
              <Input
                id="imapPort"
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(e.target.value)}
                placeholder="993"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signature Email <span className="text-red-500">*</span></CardTitle>
          <CardDescription>
            Signature ajoutée automatiquement à la fin de chaque email. <strong>Obligatoire</strong> - elle remplacera toute signature présente dans vos templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signature">Signature (HTML)</Label>
            <Textarea
              id="signature"
              value={signatureHtml}
              onChange={(e) => setSignatureHtml(e.target.value)}
              placeholder="<p>Cordialement,<br><b>Victor Soto</b><br>École polytechnique</p>"
              rows={8}
              required
              className={!signatureHtml ? 'border-red-500' : ''}
            />
            <p className="text-xs text-muted-foreground">
              <strong>Important :</strong> Créez vos templates <strong>sans signature à la fin</strong>. Cette signature sera automatiquement ajoutée lors de l&apos;envoi.
            </p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              ⚠️ Exemple : N&apos;incluez pas &quot;Cordialement, XXXX&quot; dans votre template, ajoutez uniquement votre vrai nom ici.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limites d&apos;envoi</CardTitle>
          <CardDescription>
            Configurez le nombre maximum d&apos;emails envoyés par jour
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dailyLimit">Limite quotidienne</Label>
            <Input
              id="dailyLimit"
              type="number"
              value={dailySendLimit}
              onChange={(e) => setDailySendLimit(e.target.value)}
              placeholder="50"
            />
            <p className="text-xs text-gray-500">
              Nombre maximum d&apos;emails que vous pouvez envoyer par jour
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        {hasUnsavedChanges && (
          <div className="flex items-center text-sm text-yellow-600 dark:text-yellow-400">
            <span className="mr-2">●</span>
            Modifications non sauvegardées
          </div>
        )}
        <Button 
          onClick={handleSave} 
          disabled={saving || !hasUnsavedChanges} 
          size="lg"
          variant={hasUnsavedChanges ? "default" : "secondary"}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enregistrement...
            </>
          ) : hasUnsavedChanges ? (
            'Enregistrer les paramètres'
          ) : (
            '✓ Paramètres sauvegardés'
          )}
        </Button>
      </div>
        </div>
      </div>
    </>
  );
}

