'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { Loader2 } from 'lucide-react';
import { LanguageProvider, type Language } from '@/lib/i18n';

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
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>('fr');
  const supabase = createClient();

  useEffect(() => {
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (!session?.user) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [router, supabase]);

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
    </LanguageProvider>
  );
}
