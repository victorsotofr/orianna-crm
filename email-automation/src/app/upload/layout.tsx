import AuthLayout from '@/components/auth-layout';

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthLayout>{children}</AuthLayout>;
}

