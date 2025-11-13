import AuthLayout from '@/components/auth-layout';

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayout>{children}</AuthLayout>;
}

