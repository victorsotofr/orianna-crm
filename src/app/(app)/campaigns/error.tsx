'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error('Campaigns error:', error.digest || error.message);
  }, [error]);

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <h2 className="text-xl font-semibold">{t.errors.campaigns.title}</h2>
          <p className="text-muted-foreground">{t.errors.campaigns.description}</p>
          <Button onClick={reset}>{t.errors.retry}</Button>
        </div>
      </div>
    </div>
  );
}
