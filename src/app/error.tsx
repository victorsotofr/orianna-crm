'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LanguageProvider, useTranslation } from '@/lib/i18n';

function ErrorContent({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error('Application error:', error.digest || error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">{t.errors.pageError}</h2>
        <p className="text-muted-foreground">
          {t.errors.pageErrorDescription}
        </p>
        <Button onClick={reset}>{t.errors.retry}</Button>
      </div>
    </div>
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <LanguageProvider>
      <ErrorContent error={error} reset={reset} />
    </LanguageProvider>
  );
}
