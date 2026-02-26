'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { TemplateForm } from '@/components/template-form';
import { ArrowLeft } from 'lucide-react';

export default function NewTemplatePage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/templates');
  };

  return (
    <>
      <SiteHeader title="Nouveau template" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-3 px-4 lg:px-6 max-w-3xl">
          <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push('/templates')}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Retour
          </Button>

          <div>
            <h2 className="text-lg font-semibold">Créer un nouveau template</h2>
            <p className="text-sm text-muted-foreground">
              Créez un template d&apos;email pour vos séquences de prospection
            </p>
          </div>

          <TemplateForm onSuccess={handleSuccess} />
        </div>
      </div>
    </>
  );
}
