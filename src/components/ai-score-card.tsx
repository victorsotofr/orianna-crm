'use client';

import { useState } from 'react';
import { Brain, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';

interface AIScoreCardProps {
  contactId: string;
  score: number | null;
  label: 'HOT' | 'WARM' | 'COLD' | null;
  reasoning: string | null;
  scoredAt: string | null;
  onScored: () => void;
}

export function AIScoreCard({ contactId, score, label, reasoning, scoredAt, onScored }: AIScoreCardProps) {
  const { t, dateFnsLocale } = useTranslation();
  const [scoring, setScoring] = useState(false);

  const labelConfig = {
    HOT: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', label: t.ai.score.hot },
    WARM: { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', label: t.ai.score.warm },
    COLD: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', label: t.ai.score.cold },
  };

  const handleScore = async () => {
    setScoring(true);
    try {
      const res = await apiFetch('/api/ai/score-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId }),
      });
      if (res.ok) {
        onScored();
      }
    } catch {
      // Error handled silently, UI will show stale data
    } finally {
      setScoring(false);
    }
  };

  const hasScore = score != null && label != null;
  const config = label ? labelConfig[label] : null;

  return (
    <div className={`border rounded-lg p-3 ${config ? `${config.bg} ${config.border}` : 'bg-card'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Brain className={`h-4 w-4 ${config ? config.text : 'text-muted-foreground'}`} />
          <span className="text-sm font-medium">{t.ai.score.title}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={handleScore}
          disabled={scoring}
        >
          {scoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasScore ? (
            <>
              <RefreshCw className="mr-1 h-3 w-3" />
              {t.ai.score.rescore}
            </>
          ) : (
            t.ai.score.score
          )}
        </Button>
      </div>

      {hasScore && config ? (
        <>
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className={`text-2xl font-bold ${config.text}`}>{score}</span>
            <span className={`text-xs font-medium ${config.text}`}>/ 100 · {config.label}</span>
          </div>
          {reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed">{reasoning}</p>
          )}
          {scoredAt && (
            <p className="text-xs text-muted-foreground mt-1.5 opacity-60">
              {t.ai.score.analyzed(formatDistanceToNow(new Date(scoredAt), { addSuffix: true, locale: dateFnsLocale }))}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t.ai.score.emptyState}
        </p>
      )}
    </div>
  );
}
