import AuthLayout from '@/components/auth-layout';

export const dynamic = 'force-dynamic';

export default function SequencesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayout>{children}</AuthLayout>;
}
