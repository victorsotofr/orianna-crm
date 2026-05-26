'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-browser';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { Loader2 } from 'lucide-react';
import { LanguageProvider, type Language } from '@/lib/i18n';
import { WorkspaceProvider } from '@/lib/workspace-context';
import { BackgroundJobProvider } from '@/lib/background-jobs';
import { BackgroundJobsPanel } from '@/components/background-jobs-panel';
import { E2E_MOCK_USER, isE2EMockMode } from '@/lib/e2e-mock';

type LayoutUser = Pick<User, 'id' | 'email' | 'user_metadata'>;

function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  useKeyboardShortcuts();
  return <>{children}</>;
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const mockMode = isE2EMockMode();
  const [user, setUser] = useState<LayoutUser | null>(() => mockMode ? E2E_MOCK_USER : null);
  const [loading, setLoading] = useState(() => !mockMode);
  const [language, setLanguage] = useState<Language>(() => mockMode ? 'en' : 'fr');
  const supabase = createClient();

  useEffect(() => {
    if (mockMode) return;

    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
      } else {
        setUser(session.user);
        // Fetch language preference
        const { data: settings } = await supabase
          .from('user_settings')
          .select('language')
          .eq('user_id', session.user.id)
          .single();
        if (settings?.language) {
          setLanguage(settings.language as Language);
        }
      }
      setLoading(false);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (!session?.user) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [mockMode, router, supabase]);

  const handleNoWorkspace = useCallback(() => {
    router.push('/create-workspace');
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <LanguageProvider initialLanguage={language}>
      <WorkspaceProvider userId={user.id} onNoWorkspace={handleNoWorkspace}>
        <BackgroundJobProvider>
          <SidebarProvider
            open={true}
            onOpenChange={() => {}}
            style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
          >
            <AppSidebar
              variant="inset"
              user={{
                name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
                email: user.email || '',
                avatar: user.user_metadata?.avatar_url,
              }}
            />
            <SidebarInset className="min-w-0">
              <KeyboardShortcutsProvider>
                {children}
              </KeyboardShortcutsProvider>
            </SidebarInset>
          </SidebarProvider>
          <BackgroundJobsPanel />
        </BackgroundJobProvider>
      </WorkspaceProvider>
    </LanguageProvider>
  );
}
