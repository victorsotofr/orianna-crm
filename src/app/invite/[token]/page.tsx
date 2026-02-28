'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, GalleryVerticalEnd } from 'lucide-react';
import { setStoredWorkspaceId } from '@/lib/api';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      // Check auth
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
      }

      // Fetch invitation details (public — no auth required to view)
      const { data, error: fetchError } = await supabase
        .from('workspace_invitations')
        .select('*, workspaces(name)')
        .eq('token', token)
        .single();

      if (fetchError || !data) {
        setError('Invitation introuvable');
      } else if (data.status !== 'pending') {
        setError(data.status === 'expired' ? 'Cette invitation a expiré' : 'Cette invitation a déjà été utilisée');
      } else if (new Date(data.expires_at) < new Date()) {
        setError('Cette invitation a expiré');
      } else {
        setInvitation(data);
      }

      setLoading(false);
    };

    init();
  }, [token, supabase]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (res.ok) {
        setStoredWorkspaceId(data.workspace_id);
        router.push('/dashboard');
      } else {
        setError(data.error || "Erreur lors de l'acceptation");
      }
    } catch {
      setError("Erreur lors de l'acceptation");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GalleryVerticalEnd className="size-6" />
            </div>
          </div>
          <CardTitle>
            {error ? 'Erreur' : `Rejoindre ${invitation?.workspaces?.name || 'l\'espace de travail'}`}
          </CardTitle>
          {!error && invitation && (
            <CardDescription>
              Vous avez été invité à rejoindre l&apos;espace de travail <strong>{invitation.workspaces?.name}</strong>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                Retour au tableau de bord
              </Button>
            </div>
          ) : user ? (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Connecté en tant que <strong>{user.email}</strong>
              </p>
              {user.email?.toLowerCase() !== invitation?.email?.toLowerCase() && (
                <p className="text-sm text-center text-destructive">
                  Cette invitation est destinée à <strong>{invitation?.email}</strong>. Connectez-vous avec ce compte.
                </p>
              )}
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={accepting || user.email?.toLowerCase() !== invitation?.email?.toLowerCase()}
              >
                {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Accepter l&apos;invitation
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Connectez-vous pour accepter cette invitation.
              </p>
              <Button className="w-full" onClick={() => router.push(`/login?redirect=/invite/${token}`)}>
                Se connecter
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
