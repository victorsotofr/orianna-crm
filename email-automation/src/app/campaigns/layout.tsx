import AuthLayout from '@/components/auth-layout';

export default function CampaignsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayout>{children}</AuthLayout>;
}

