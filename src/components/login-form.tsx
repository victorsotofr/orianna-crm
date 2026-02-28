'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LanguageProvider, useTranslation } from '@/lib/i18n';

function LoginFormContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user && data.session) {
        router.push('/dashboard');
        router.refresh(); // Refresh to update middleware
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full !gap-0">
      <CardHeader className="pb-4">
        <CardTitle>{t.login.title}</CardTitle>
        <CardDescription>
          {t.login.description}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin}>
        <CardContent className="pt-0 pb-0">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">{t.login.labels.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t.login.placeholders.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">{t.login.labels.password}</Label>
                <a
                  href="#"
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  {t.login.labels.forgotPassword}
                </a>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2 pt-6 pb-0">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.login.loading : t.login.button}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function LoginForm() {
  return (
    <LanguageProvider>
      <LoginFormContent />
    </LanguageProvider>
  );
}
