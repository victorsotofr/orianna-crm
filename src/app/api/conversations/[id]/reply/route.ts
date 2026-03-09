import { NextResponse } from 'next/server';

import { textToHtml } from '@/lib/email-content';
import { buildTrackingPixelHtml } from '@/lib/email-tracking';
import { sendEmail } from '@/lib/email-sender';
import { formatMessageId } from '@/lib/mailbox-utils';
import { finalizeSentEmail } from '@/lib/outbound-email';
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

    const { subject, body } = await request.json();
    const trimmedBody = typeof body === 'string' ? body.trim() : '';
    const trimmedSubject = typeof subject === 'string' ? subject.trim() : '';

    if (!trimmedBody) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 });
    }

    const { data: thread, error: threadError } = await supabase
      .from('mailbox_threads')
      .select(`
        id,
        workspace_id,
        contact_id,
        subject,
        contacts (
          id,
          email,
          first_name,
          last_name
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
    if (!thread.contact_id) {
      return NextResponse.json({ error: 'Conversation is not linked to a contact' }, { status: 400 });
    }
    const contact = Array.isArray(thread.contacts) ? thread.contacts[0] : thread.contacts;

    const { data: messages, error: messagesError } = await supabase
      .from('mailbox_messages')
      .select('id, internet_message_id, from_email, direction, message_at')
      .eq('thread_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .eq('user_id', user.id)
      .order('message_at', { ascending: true });

    if (messagesError) throw messagesError;
    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Conversation has no messages' }, { status: 400 });
    }

    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings?.smtp_host || !settings.smtp_user || !settings.smtp_password_encrypted) {
      return NextResponse.json(
        { error: 'SMTP settings not configured. Configure them in Settings.' },
        { status: 400 }
      );
    }

    const latestMessage = messages[messages.length - 1];
    const lastInbound = [...messages].reverse().find((message) => message.direction === 'inbound');
    const recipient = lastInbound?.from_email || contact?.email;

    if (!recipient) {
      return NextResponse.json({ error: 'Recipient email not found' }, { status: 400 });
    }

    const { data: emailRecord, error: insertError } = await supabase
      .from('emails_sent')
      .insert({
        workspace_id: ctx.workspaceId,
        contact_id: thread.contact_id,
        sent_by: user.id,
        sent_by_email: user.email,
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !emailRecord) {
      throw new Error(insertError?.message || 'Failed to create email record');
    }

    const htmlBody = textToHtml(trimmedBody);
    const trackingPixel = buildTrackingPixelHtml(emailRecord.id);
    const finalHtml = `${htmlBody}\n${trackingPixel}`;
    const referenceIds = messages
      .map((message) => message.internet_message_id)
      .filter(Boolean)
      .slice(-20);

    const result = await sendEmail(
      {
        host: settings.smtp_host,
        port: settings.smtp_port,
        user: settings.smtp_user,
        passwordEncrypted: settings.smtp_password_encrypted,
        bccEnabled: settings.bcc_enabled !== false,
      },
      {
        to: recipient,
        subject: trimmedSubject || thread.subject || 'Re: Conversation',
        html: finalHtml,
        text: trimmedBody,
        from: user.user_metadata?.full_name || settings.user_email || user.email || 'Orianna CRM',
        inReplyTo: formatMessageId(latestMessage.internet_message_id),
        references: referenceIds.map((messageId) => formatMessageId(messageId)).filter((value): value is string => Boolean(value)),
      }
    );

    if (!result.success) {
      await supabase
        .from('emails_sent')
        .update({ status: 'failed', error_message: result.error || 'Failed to send reply' })
        .eq('id', emailRecord.id);

      return NextResponse.json({ error: result.error || 'Failed to send reply' }, { status: 500 });
    }

    const persisted = await finalizeSentEmail({
      supabase,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      contactId: thread.contact_id,
      emailSentId: emailRecord.id,
      rawMessageId: result.messageId!,
      subject: trimmedSubject || thread.subject || 'Re: Conversation',
      htmlBody,
      textBody: trimmedBody,
      to: recipient,
      from: {
        email: settings.smtp_user,
        name: user.user_metadata?.full_name || settings.user_email || user.email || 'Orianna CRM',
      },
      threadId: thread.id,
      inReplyTo: latestMessage.internet_message_id,
      references: referenceIds,
      metadata: {
        conversation_id: thread.id,
        direct_reply: true,
      },
    });

    if (thread.contact_id) {
      await supabase.from('contacts').update({ last_contacted_at: new Date().toISOString() }).eq('id', thread.contact_id);
      await supabase.from('contact_timeline').insert({
        contact_id: thread.contact_id,
        workspace_id: ctx.workspaceId,
        event_type: 'reply_sent',
        title: 'Réponse envoyée',
        description: trimmedSubject || thread.subject || 'Réponse',
        metadata: {
          thread_id: thread.id,
          mailbox_message_id: persisted.messageId,
          emails_sent_id: emailRecord.id,
        },
        created_by: user.id,
      });
    }

    return NextResponse.json({ success: true, threadId: persisted.threadId, mailboxMessageId: persisted.messageId });
  } catch (error: any) {
    console.error('Conversation reply error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to send reply' }, { status: 500 });
  }
}
