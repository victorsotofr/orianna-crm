'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SiteHeader } from '@/components/site-header';
import { RichTextEditor } from '@/components/rich-text-editor';
import { IndustrySelector } from '@/components/industry-selector';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { extractTemplateVariables } from '@/lib/template-renderer';

export default function NewTemplatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [industry, setIndustry] = useState('');
  const [htmlContent, setHtmlContent] = useState('');

  const variables = extractTemplateVariables(htmlContent + ' ' + subject);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    if (!subject.trim()) {
      toast.error("Le sujet de l'email est obligatoire");
      return;
    }
    if (!industry) {
      toast.error("L'industrie est obligatoire");
      return;
    }
    if (!htmlContent.trim() || htmlContent === '<p></p>') {
      toast.error("Le contenu de l'email est obligatoire");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          subject: subject.trim(),
          industry,
          html_content: htmlContent,
        }),
      });

      if (response.ok) {
        const { template } = await response.json();
        toast.success('Template créé');
        router.push(`/templates/${template.id}`);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Erreur lors de la création');
      }
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SiteHeader title="Nouveau template" />
      <div className="page-container">
        <div className="page-content">
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/templates')}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Retour
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Créer le template
            </Button>
          </div>

          {/* Metadata bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs border rounded-lg px-4 py-2.5 bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Label className="text-muted-foreground shrink-0">Nom:</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Prospection Immobilier"
                className="h-7 text-xs w-52"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-muted-foreground shrink-0">Industrie:</Label>
              <IndustrySelector value={industry} onValueChange={setIndustry} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Variables: </span>
              {variables.length > 0 ? variables.map((v) => (
                <Badge key={v} variant="secondary" className="font-mono text-[10px]">{`{{ ${v} }}`}</Badge>
              )) : (
                <span className="text-muted-foreground">aucune</span>
              )}
            </div>
          </div>

          {/* Email chrome */}
          <div className="border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
            {/* Email header */}
            <div className="bg-muted/50 border-b px-5 py-3 space-y-1 shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">De:</span>
                <span>vous@orianna.fr</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">À:</span>
                <span>jean.dupont@example.com</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-xs text-muted-foreground shrink-0">Objet:</span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Sujet de l'email..."
                  className="h-7 text-sm font-medium"
                />
              </div>
            </div>
            {/* Email body */}
            <div className="flex-1 min-h-0 bg-white dark:bg-card flex flex-col">
              <RichTextEditor
                value={htmlContent}
                onChange={setHtmlContent}
                placeholder="Rédigez votre email ici... Utilisez {{ first_name }}, {{ company_name }} pour personnaliser."
                className="border-0 rounded-none h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
