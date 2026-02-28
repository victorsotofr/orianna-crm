'use client';

import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AIPersonalizationCardProps {
  contactId: string;
  line: string | null;
  personalizedAt: string | null;
  onUpdated: () => void;
}

export function AIPersonalizationCard({ contactId, line, personalizedAt, onUpdated }: AIPersonalizationCardProps) {
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/personalize-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      if (res.ok) {
        const { results } = await res.json();
        if (results[0]?.error) {
          toast.error(results[0].error);
        } else {
          toast.success('Personnalisation générée');
          onUpdated();
        }
      } else {
        toast.error('Erreur lors de la personnalisation');
      }
    } catch {
      toast.error('Erreur lors de la personnalisation');
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_personalized_line: null, ai_personalized_at: null }),
      });
      if (res.ok) {
        toast.success('Personnalisation supprimée');
        onUpdated();
      }
    } catch {
      toast.error('Erreur');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium">Personnalisation IA</span>
        </div>
        <div className="flex items-center gap-1">
          {line && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : line ? (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                Régénérer
              </>
            ) : (
              'Générer'
            )}
          </Button>
        </div>
      </div>

      {line ? (
        <>
          <p className="text-sm leading-relaxed italic text-purple-900 dark:text-purple-200">
            &ldquo;{line}&rdquo;
          </p>
          {personalizedAt && (
            <p className="text-xs text-muted-foreground mt-1.5 opacity-60">
              Généré {formatDistanceToNow(new Date(personalizedAt), { addSuffix: true, locale: fr })}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            Utilisez <code className="bg-muted px-1 rounded font-mono">{'{{ai_personalized_line}}'}</code> dans vos templates
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucune personnalisation. Cliquez sur &quot;Générer&quot; pour créer une phrase d&apos;accroche personnalisée avec l&apos;IA.
        </p>
      )}
    </div>
  );
}
