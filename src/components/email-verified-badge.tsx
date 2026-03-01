'use client';

import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n';

type EmailVerifiedStatus = 'DELIVERABLE' | 'HIGH_PROBABILITY' | 'CATCH_ALL' | 'INVALID' | null | undefined;

interface EmailVerifiedBadgeProps {
  status: EmailVerifiedStatus;
}

const STATUS_CONFIG: Record<string, { className: string; key: string }> = {
  DELIVERABLE: { className: 'bg-green-100 text-green-700 border-green-200', key: 'valid' },
  HIGH_PROBABILITY: { className: 'bg-yellow-100 text-yellow-700 border-yellow-200', key: 'probable' },
  CATCH_ALL: { className: 'bg-orange-100 text-orange-700 border-orange-200', key: 'catchAll' },
  INVALID: { className: 'bg-red-100 text-red-700 border-red-200', key: 'invalid' },
};

export function EmailVerifiedBadge({ status }: EmailVerifiedBadgeProps) {
  const { t } = useTranslation();

  if (!status) {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-muted text-muted-foreground">
        {t.contacts.emailStatus.notVerified}
      </Badge>
    );
  }

  const config = STATUS_CONFIG[status];
  if (!config) return null;

  const labels: Record<string, string> = {
    valid: t.contacts.emailStatus.valid,
    probable: t.contacts.emailStatus.probable,
    catchAll: t.contacts.emailStatus.catchAll,
    invalid: t.contacts.emailStatus.invalid,
  };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${config.className}`}>
      {labels[config.key]}
    </Badge>
  );
}
