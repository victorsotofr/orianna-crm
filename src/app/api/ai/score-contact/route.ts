import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { scoreContact } from '@/lib/ai-scoring';

export const maxDuration = 300;

async function getAuthenticatedSupabase(request: NextRequest) {
  // Check for service key (edge function / internal calls)
  const serviceKey = request.headers.get('x-service-key');
  if (serviceKey && serviceKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { supabase: getServiceSupabase(), userId: 'service' };
  }

  // Cookie-based auth
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
    const scores: Array<{ contactId: string; score: number; label: string; reasoning: string; error?: string }> = [];

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      try {
        // Fetch contact
        const { data: contact, error: fetchError } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchError || !contact) {
          scores.push({ contactId: id, score: 0, label: 'COLD', reasoning: '', error: 'Contact non trouvé' });
          continue;
        }

        // Score via AI
        const result = await scoreContact(contact);

        // Update contact in DB
        await supabase
          .from('contacts')
          .update({
            ai_score: result.score,
            ai_score_label: result.label,
            ai_score_reasoning: result.reasoning,
            ai_scored_at: new Date().toISOString(),
          })
          .eq('id', id);

        // Insert timeline event
        await supabase.from('contact_timeline').insert({
          contact_id: id,
          event_type: 'ai_scored',
          title: `Score IA : ${result.score}/100 (${result.label})`,
          description: result.reasoning,
          created_by: auth.userId === 'service' ? null : auth.userId,
        });

        scores.push({
          contactId: id,
          score: result.score,
          label: result.label,
          reasoning: result.reasoning,
        });
      } catch (err: any) {
        console.error(`AI scoring error for contact ${id}:`, err);
        scores.push({
          contactId: id,
          score: 0,
          label: 'COLD',
          reasoning: '',
          error: err.message || 'Scoring failed',
        });
      }

      // 1s delay between contacts in batch mode
      if (ids.length > 1 && i < ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({ scores });
  } catch (error: any) {
    console.error('AI scoring error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Scoring failed' }, { status: 500 });
  }
}
