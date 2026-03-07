import { NextResponse } from 'next/server';

import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { stripQuotedReplyHistory } from '@/lib/email-content';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  queryGoogleCalendarFreeBusy,
} from '@/lib/google-calendar';
import { getGoogleCalendarConnection } from '@/lib/google-oauth';
import { ensureReplySubject } from '@/lib/mailbox-utils';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

function formatMessageForPrompt(message: {
  direction: string;
  from_email: string | null;
  subject: string | null;
  text_body: string | null;
  message_at: string;
}) {
  const role = message.direction === 'outbound' ? 'Nous' : message.from_email || 'Contact';
  const rawBody = (message.text_body || '').trim();
  const visibleBody = message.direction === 'inbound' ? stripQuotedReplyHistory(rawBody) : rawBody;
  const body = visibleBody.slice(0, 3000);
  return `[${new Date(message.message_at).toISOString()}] ${role}\nSujet: ${message.subject || 'Sans objet'}\n${body}`;
}

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

    const { data: thread, error: threadError } = await supabase
      .from('mailbox_threads')
      .select(`
        id,
        subject,
        contact_id,
        contacts (
          first_name,
          last_name,
          email,
          company_name,
          job_title
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (threadError) throw threadError;
    if (!thread) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    const contact = Array.isArray(thread.contacts) ? thread.contacts[0] : thread.contacts;

    const { data: messages, error: messagesError } = await supabase
      .from('mailbox_messages')
      .select('direction, from_email, subject, text_body, message_at')
      .eq('thread_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .order('message_at', { ascending: true });

    if (messagesError) throw messagesError;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Conversation has no messages' }, { status: 400 });
    }

    const promptMessages = messages.slice(-8).map(formatMessageForPrompt).join('\n\n---\n\n');
    const contactName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ');

    // Check if user has Google Calendar connected
    const gcalConnection = await getGoogleCalendarConnection(user.id);
    const hasCalendar = !!gcalConnection?.google_calendar_refresh_token_encrypted;

    // Capture closure vars for tool execute functions
    const userId = user.id;
    const workspaceId = ctx.workspaceId;
    const contactId = thread.contact_id;
    const threadId = thread.id;
    const tz = gcalConnection?.google_calendar_default_timezone || 'Europe/Paris';
    const calId = gcalConnection?.google_calendar_default_calendar_id || 'primary';

    // Build a day-of-week reference so the AI doesn't confuse dates
    const dayRef: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dayRef.push(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }) + ' = ' + d.toISOString().split('T')[0]);
    }

    // Define tools inline so TypeScript can infer the full generic type
    const calendarCheckAvailability = tool({
      description:
        'Check the user\'s Google Calendar availability for a given date range. Use this when the prospect asks about scheduling a meeting or when you want to suggest available times.',
      inputSchema: z.object({
        timeMin: z.string().describe('Start of time range in ISO 8601 format (e.g. 2026-03-10T08:00:00+01:00)'),
        timeMax: z.string().describe('End of time range in ISO 8601 format (e.g. 2026-03-10T18:00:00+01:00)'),
      }),
      execute: async ({ timeMin, timeMax }) => {
        const result = await queryGoogleCalendarFreeBusy(userId, { timeMin, timeMax, timeZone: tz });
        const busy = result.calendars?.[calId]?.busy || [];
        return {
          busy,
          timeZone: tz,
          message: busy.length === 0
            ? 'No busy slots — the user is free during this entire period.'
            : `Found ${busy.length} busy slot(s).`,
        };
      },
    });

    const calendarListEvents = tool({
      description: 'List upcoming events on the user\'s Google Calendar.',
      inputSchema: z.object({
        timeMin: z.string().describe('Start of time range in ISO 8601 format'),
        timeMax: z.string().describe('End of time range in ISO 8601 format'),
        maxResults: z.number().optional().describe('Max events to return (default 10)'),
      }),
      execute: async ({ timeMin, timeMax, maxResults }) => {
        const events = await listGoogleCalendarEvents(userId, { timeMin, timeMax, maxResults: maxResults || 10 });
        return events.map((e) => ({
          id: e.id,
          summary: e.summary,
          start: e.start,
          end: e.end,
        }));
      },
    });

    const calendarCreateMeeting = tool({
      description:
        'Create a Google Calendar event with a Google Meet link. Always check availability first before creating.',
      inputSchema: z.object({
        summary: z.string().describe('Meeting title (e.g. "Call with Jean Dupont - Orianna")'),
        start: z.string().describe('Start time in ISO 8601 format (e.g. 2026-03-10T14:00:00+01:00)'),
        end: z.string().describe('End time in ISO 8601 format (e.g. 2026-03-10T14:30:00+01:00)'),
        description: z.string().optional().describe('Optional meeting description'),
        attendeeEmail: z.string().optional().describe("The prospect's email to invite"),
      }),
      execute: async ({ summary, start, end, description, attendeeEmail }) => {
        const attendees = attendeeEmail ? [attendeeEmail] : [];
        const event = await createGoogleCalendarEvent(userId, {
          summary,
          start,
          end,
          description,
          timeZone: tz,
          attendees,
          createMeet: true,
          sendUpdates: attendeeEmail ? 'all' : 'none',
          metadata: {
            source: 'orianna',
            workspace_id: workspaceId,
            ...(contactId ? { contact_id: contactId } : {}),
            thread_id: threadId,
          },
        });

        if (contactId) {
          await supabase.from('calendar_events').upsert(
            {
              user_id: userId,
              workspace_id: workspaceId,
              contact_id: contactId,
              thread_id: threadId,
              google_event_id: event.id,
              calendar_id: event.calendarId,
              summary,
              description: description || null,
              starts_at: event.start.dateTime || start,
              ends_at: event.end.dateTime || end,
              meet_url: event.meetUrl,
              google_event_url: event.htmlLink || null,
              status: 'confirmed',
              metadata: { attendees, time_zone: tz },
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,google_event_id' }
          );

          await supabase.from('contact_timeline').insert({
            contact_id: contactId,
            workspace_id: workspaceId,
            event_type: 'meeting_scheduled',
            title: 'RDV Google Meet créé',
            description: summary,
            metadata: {
              google_event_id: event.id,
              calendar_id: event.calendarId,
              meet_url: event.meetUrl,
              google_event_url: event.htmlLink || null,
              thread_id: threadId,
            },
            created_by: userId,
          });

          await supabase
            .from('contacts')
            .update({ status: 'meeting_scheduled', updated_at: new Date().toISOString() })
            .eq('id', contactId)
            .eq('workspace_id', workspaceId)
            .in('status', ['new', 'contacted', 'engaged', 'qualified']);
        }

        return {
          eventId: event.id,
          meetUrl: event.meetUrl,
          htmlLink: event.htmlLink,
          summary,
          start: event.start,
          end: event.end,
          message: `Meeting "${summary}" created. Meet link: ${event.meetUrl || 'N/A'}`,
        };
      },
    });

    const calendarDeleteMeeting = tool({
      description: 'Delete a Google Calendar event created by Orianna.',
      inputSchema: z.object({
        eventId: z.string().describe('The Google Calendar event ID to delete'),
      }),
      execute: async ({ eventId }) => {
        const { data: localEvent } = await supabase
          .from('calendar_events')
          .select('id, contact_id, workspace_id, summary, calendar_id')
          .eq('user_id', userId)
          .eq('google_event_id', eventId)
          .maybeSingle();

        if (!localEvent) {
          return { success: false, message: 'Event not found in Orianna records.' };
        }

        await deleteGoogleCalendarEvent(userId, {
          eventId,
          calendarId: localEvent.calendar_id || undefined,
          sendUpdates: 'all',
        });

        await supabase
          .from('calendar_events')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', localEvent.id);

        if (localEvent.contact_id && localEvent.workspace_id) {
          await supabase.from('contact_timeline').insert({
            contact_id: localEvent.contact_id,
            workspace_id: localEvent.workspace_id,
            event_type: 'meeting_deleted',
            title: 'RDV Google Meet supprimé',
            description: localEvent.summary,
            metadata: { google_event_id: eventId, calendar_id: localEvent.calendar_id },
            created_by: userId,
          });
        }

        return { success: true, eventId, message: 'Meeting deleted.' };
      },
    });

    const calendarInstruction = hasCalendar
      ? `\n\nTu as accès au Google Calendar de l'utilisateur via des outils. Si le prospect mentionne un rendez-vous, un call, une disponibilité ou veut planifier un meeting :
1. Utilise calendar_check_availability pour vérifier les disponibilités
2. Propose des créneaux libres dans ta réponse
3. Si le prospect confirme un créneau ou si tu peux inférer un créneau clair, utilise calendar_create_meeting pour le booker
4. Inclus toujours le lien Google Meet dans ta réponse quand un meeting est créé
5. La timezone de l'utilisateur est ${tz}
6. Aujourd'hui c'est ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz })}.

Calendrier de reference (utilise UNIQUEMENT cette table pour convertir jours en dates, ne devine jamais) :
${dayRef.join('\n')}`
      : '';

    const toolsConfig = hasCalendar
      ? {
          calendar_check_availability: calendarCheckAvailability,
          calendar_list_events: calendarListEvents,
          calendar_create_meeting: calendarCreateMeeting,
          calendar_delete_meeting: calendarDeleteMeeting,
        }
      : undefined;

    const result = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      tools: toolsConfig,
      stopWhen: stepCountIs(5),
      system: `Tu aides un commercial à répondre manuellement à un prospect.
Rédige un brouillon de réponse concis, humain et professionnel.
Respecte ces règles :
- Réponds dans la même langue que le dernier message entrant. Si ce n'est pas clair, réponds en français.
- Ne promets rien qui n'apparaisse pas dans le thread.
- Garde un ton naturel, pas robotique.
- Ne mets pas d'objet dans ta réponse.
- Réponds uniquement avec le corps de l'email, prêt à être édité.${calendarInstruction}`,
      prompt: `Conversation avec ${contactName || 'le contact'}${contact?.company_name ? ` (${contact.company_name})` : ''}${contact?.email ? ` <${contact.email}>` : ''}.
Sujet: ${thread.subject || 'Sans objet'}

Historique:
${promptMessages}`,
    });

    // Extract any meeting created from tool results
    let meetingCreated: Record<string, unknown> | null = null;
    for (const step of result.steps) {
      for (const tc of step.toolResults) {
        if (
          tc.toolName === 'calendar_create_meeting' &&
          'output' in tc &&
          typeof tc.output === 'object' &&
          tc.output !== null &&
          'eventId' in tc.output
        ) {
          meetingCreated = tc.output as Record<string, unknown>;
        }
      }
    }

    return NextResponse.json({
      draft: result.text.trim(),
      subject: ensureReplySubject(thread.subject),
      ...(meetingCreated ? { meetingCreated } : {}),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to suggest a reply';
    console.error('Suggest reply error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
