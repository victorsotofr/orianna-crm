import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { personalizeContact } from '@/lib/ai-personalization';

export const maxDuration = 300;

async function getAuthenticatedSupabase(request: NextRequest) {
  const serviceKey = request.headers.get('x-service-key');
  if (serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { supabase: getServiceSupabase(), userId: 'service' };
  }

  const { supabase, error } = await createServerClient();
  if (error || !supabase) return null;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  return { supabase, userId: user.id };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedSupabase(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, contactIds } = body;

    const ids: string[] = contactIds || (contactId ? [contactId] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'contactId or contactIds required' }, { status: 400 });
    }

    const supabase = auth.supabase;
    // Use service role for writes to bypass RLS (user is already authenticated)
    const serviceSupabase = getServiceSupabase();
    const results: Array<{ contactId: string; line: string; error?: string }> = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      try {
        const { data: contact, error: fetchError } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError || !contact) {
          results.push({ contactId: id, line: '', error: 'Contact non trouvé' });
          continue;
        }

        const contactWorkspaceId = contact.workspace_id;

        const result = await personalizeContact(contact);

        await serviceSupabase
          .from('contacts')
          .update({
            ai_personalized_line: result.line,
            ai_personalized_at: new Date().toISOString(),
          })
          .eq('id', id);

        await serviceSupabase.from('contact_timeline').insert({
          contact_id: id,
          event_type: 'ai_personalized',
          title: 'Personnalisation IA générée',
          description: result.line,
          created_by: auth.userId === 'service' ? null : auth.userId,
          workspace_id: contactWorkspaceId,
        });

        results.push({ contactId: id, line: result.line });
      } catch (err: any) {
        console.error(`AI personalization error for contact ${id}:`, err);
        results.push({ contactId: id, line: '', error: err.message || 'Personalization failed' });
      }

      // 1s delay between contacts in batch mode
      if (ids.length > 1 && i < ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('AI personalization error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Personalization failed' }, { status: 500 });
  }
}
