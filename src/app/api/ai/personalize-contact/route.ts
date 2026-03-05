import { NextRequest, NextResponse } from 'next/server';
// import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase-server';
import { getServiceSupabase } from '@/lib/supabase';
import { personalizeContact } from '@/lib/ai-personalization';
import { getLinkupCreditBalance } from '@/lib/linkup';
import type { BusinessContext } from '@/lib/ai-business-context';


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

    // Fetch custom prompts from the first contact's workspace
    let linkupApiKey: string | undefined;
    let customPrompts: { personalizationPrompt?: string; linkupCompanyQuery?: string; linkupContactQuery?: string } | undefined;
    let businessContext: BusinessContext | undefined;
    const { data: firstContact } = await supabase
      .from('contacts')
      .select('workspace_id')
      .eq('id', ids[0])
      .single();

    if (firstContact?.workspace_id) {
      const { data: workspace } = await serviceSupabase
        .from('workspaces')
        .select('ai_personalization_prompt, linkup_company_query, linkup_contact_query, ai_company_description, ai_target_industry, ai_target_roles, ai_geographic_focus')
        .eq('id', firstContact.workspace_id)
        .single();

      if (workspace) {
        if (workspace.ai_personalization_prompt || workspace.linkup_company_query || workspace.linkup_contact_query) {
          customPrompts = {
            personalizationPrompt: workspace.ai_personalization_prompt || undefined,
            linkupCompanyQuery: workspace.linkup_company_query || undefined,
            linkupContactQuery: workspace.linkup_contact_query || undefined,
          };
        }
        if (workspace.ai_company_description || workspace.ai_target_industry || workspace.ai_target_roles || workspace.ai_geographic_focus) {
          businessContext = {
            companyDescription: workspace.ai_company_description || undefined,
            targetIndustry: workspace.ai_target_industry || undefined,
            targetRoles: workspace.ai_target_roles || undefined,
            geographicFocus: workspace.ai_geographic_focus || undefined,
          };
        }
      }
    }

    // Fetch Linkup API key from user settings
    if (auth.userId !== 'service') {
      const { data: userSettings } = await serviceSupabase
        .from('user_settings')
        .select('linkup_api_key_encrypted')
        .eq('user_id', auth.userId)
        .single();

      if (userSettings?.linkup_api_key_encrypted) {
        try {
          const credits = await getLinkupCreditBalance(userSettings.linkup_api_key_encrypted);
          if (credits <= 0) {
            console.warn(`[Linkup] No credits remaining for user ${auth.userId}. Falling back to web_search.`);
          } else {
            linkupApiKey = userSettings.linkup_api_key_encrypted;
            console.log(`[Linkup] Credits available: ${credits} for user ${auth.userId}`);
          }
        } catch (creditErr: any) {
          console.warn(`[Linkup] Could not verify credits for user ${auth.userId}:`, creditErr.message, '— falling back to web_search');
        }
      }
    }

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

        const result = await personalizeContact(contact, linkupApiKey, customPrompts, businessContext);

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
    // Sentry.captureException(error);
    return NextResponse.json({ error: error.message || 'Personalization failed' }, { status: 500 });
  }
}
