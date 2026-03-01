import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { scoreContact } from '@/lib/ai-scoring';
import { getLinkupCreditBalance } from '@/lib/linkup';


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
    // Use service role for writes to bypass RLS (user is already authenticated)
    const serviceSupabase = getServiceSupabase();

    // Fetch Linkup API key + custom prompts from the first contact's workspace
    let linkupApiKey: string | undefined;
    let customPrompts: { scoringPrompt?: string; linkupCompanyQuery?: string } | undefined;
    const { data: firstContact } = await supabase
      .from('contacts')
      .select('workspace_id')
      .eq('id', ids[0])
      .single();

    if (firstContact?.workspace_id) {
      const { data: workspace } = await serviceSupabase
        .from('workspaces')
        .select('linkup_api_key_encrypted, ai_scoring_prompt, linkup_company_query')
        .eq('id', firstContact.workspace_id)
        .single();

      if (workspace) {
        if (workspace.ai_scoring_prompt || workspace.linkup_company_query) {
          customPrompts = {
            scoringPrompt: workspace.ai_scoring_prompt || undefined,
            linkupCompanyQuery: workspace.linkup_company_query || undefined,
          };
        }

        if (workspace.linkup_api_key_encrypted) {
          // Verify Linkup credits before using it
          try {
            const credits = await getLinkupCreditBalance(workspace.linkup_api_key_encrypted);
            if (credits <= 0) {
              console.warn(`[Linkup] No credits remaining for workspace ${firstContact.workspace_id}. Falling back to web_search.`);
            } else {
              linkupApiKey = workspace.linkup_api_key_encrypted;
              console.log(`[Linkup] Credits available: ${credits} for workspace ${firstContact.workspace_id}`);
            }
          } catch (creditErr: any) {
            console.warn(`[Linkup] Could not verify credits for workspace ${firstContact.workspace_id}:`, creditErr.message, '— falling back to web_search');
          }
        }
      }
    }

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

        const contactWorkspaceId = contact.workspace_id;

        // Score via AI (with Linkup if available)
        const result = await scoreContact(contact, linkupApiKey, customPrompts);

        // Update contact in DB
        await serviceSupabase
          .from('contacts')
          .update({
            ai_score: result.score,
            ai_score_label: result.label,
            ai_score_reasoning: result.reasoning,
            ai_scored_at: new Date().toISOString(),
          })
          .eq('id', id);

        // Insert timeline event
        await serviceSupabase.from('contact_timeline').insert({
          contact_id: id,
          event_type: 'ai_scored',
          title: `Score IA : ${result.score}/100 (${result.label})`,
          description: result.reasoning,
          created_by: auth.userId === 'service' ? null : auth.userId,
          workspace_id: contactWorkspaceId,
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
    Sentry.captureException(error);
    return NextResponse.json({ error: error.message || 'Scoring failed' }, { status: 500 });
  }
}
