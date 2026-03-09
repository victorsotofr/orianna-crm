import { NextResponse } from 'next/server';

import { anthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

import { stripQuotedReplyHistory } from '@/lib/email-content';
import { getGoogleCalendarConnection } from '@/lib/google-oauth';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const { data: thread } = await supabase
      .from('mailbox_threads')
      .select(`
        id,
        subject,
        contact_id,
        contacts (
          first_name,
          last_name,
          email,
          company_name
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const contact = Array.isArray(thread.contacts) ? thread.contacts[0] : thread.contacts;

    const { data: messages } = await supabase
      .from('mailbox_messages')
      .select('direction, from_email, subject, text_body, message_at')
      .eq('thread_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .order('message_at', { ascending: true });

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages' }, { status: 400 });
    }

    const gcalConnection = await getGoogleCalendarConnection(user.id);
    const tz = gcalConnection?.google_calendar_default_timezone || 'Europe/Paris';

    const lastMessages = messages.slice(-6).map((m) => {
      const role = m.direction === 'outbound' ? 'Nous' : m.from_email || 'Contact';
      const rawBody = (m.text_body || '').trim();
      const body = m.direction === 'inbound' ? stripQuotedReplyHistory(rawBody) : rawBody;
      return `[${new Date(m.message_at).toISOString()}] ${role}\n${body.slice(0, 2000)}`;
    }).join('\n\n---\n\n');

    const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ');
    const todayFull = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });

    // Build a reference of upcoming days so the AI doesn't confuse day-of-week
    const dayRef: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dayRef.push(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }) + ' = ' + d.toISOString().split('T')[0]);
    }

    const result = await generateObject({
      model: anthropic('claude-sonnet-4-5-20250929'),
      schema: z.object({
        summary: z.string().describe('A short meeting title, e.g. "Call Victor Soto - Orianna"'),
        date: z.string().describe('The meeting date in YYYY-MM-DD format'),
        startTime: z.string().describe('Start time in HH:MM format (24h)'),
        endTime: z.string().describe('End time in HH:MM format (24h)'),
      }),
      system: `Tu extrais les informations de rendez-vous d'une conversation email.
Aujourd'hui: ${todayFull}. Timezone: ${tz}.

Calendrier de reference (jour = date):
${dayRef.join('\n')}

Renvoie le titre du meeting, la date, l'heure de debut et l'heure de fin.
Utilise UNIQUEMENT le calendrier de reference ci-dessus pour convertir les jours en dates. Ne devine jamais une date sans verifier.
Si la duree n'est pas mentionnee, utilise 30 minutes par defaut.
Si aucun creneau n'est clairement confirme, utilise le dernier creneau mentionne ou propose.`,
      prompt: `Contact: ${contactName || 'Inconnu'}${contact?.company_name ? ` (${contact.company_name})` : ''}${contact?.email ? ` <${contact.email}>` : ''}
Sujet: ${thread.subject || 'Sans objet'}

Conversation:
${lastMessages}`,
    });

    return NextResponse.json({
      summary: result.object.summary,
      date: result.object.date,
      startTime: result.object.startTime,
      endTime: result.object.endTime,
      contactEmail: contact?.email || null,
      contactName: contactName || null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to extract meeting details';
    console.error('Extract meeting error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
