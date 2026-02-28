'use client';

import { Brain } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AIScoreBadgeProps {
  score: number | null;
  label: 'HOT' | 'WARM' | 'COLD' | null;
  reasoning?: string | null;
  compact?: boolean;
}

const labelConfig = {
  HOT: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800' },
  WARM: { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800' },
  COLD: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' },
};

export function AIScoreBadge({ score, label, reasoning, compact }: AIScoreBadgeProps) {
  if (score == null || !label) {
    return compact ? <span className="text-xs text-muted-foreground">—</span> : null;
  }

  const config = labelConfig[label];

  const badge = (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text} ${config.border}`}>
      <Brain className="h-3 w-3" />
      {compact ? score : `${score} · ${label}`}
    </span>
  );

  if (!reasoning) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {reasoning}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
