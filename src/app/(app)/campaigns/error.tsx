'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function CampaignsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Campaigns error:', error.digest || error.message);
  }, [error]);

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <h2 className="text-xl font-semibold">Erreur de chargement des campagnes</h2>
          <p className="text-muted-foreground">Impossible de charger les campagnes.</p>
          <Button onClick={reset}>Réessayer</Button>
        </div>
      </div>
    </div>
  );
}
