import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { getServiceSupabase } from '@/lib/supabase';
import { decrypt } from '@/lib/encryption';

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    // Verify service key
    const serviceKey = request.headers.get('x-service-key');
    if (serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    // Get all users with IMAP credentials configured
    const { data: usersWithImap, error } = await supabase
      .from('user_settings')
      .select('user_id, user_email, imap_host, imap_port, imap_user, imap_password_encrypted')
      .not('imap_host', 'is', null)
      .not('imap_user', 'is', null)
      .not('imap_password_encrypted', 'is', null);

    if (error) throw error;

    let totalReplies = 0;
    const userErrors: string[] = [];

    for (const userSettings of usersWithImap || []) {
      let client: ImapFlow | null = null;

      try {
        const imapPassword = decrypt(userSettings.imap_password_encrypted);
        if (!imapPassword) {
          userErrors.push(`${userSettings.user_email}: failed to decrypt IMAP password`);
          continue;
        }

        // Get all message_ids for emails sent by this user that haven't been replied to
        const { data: sentEmails } = await supabase
          .from('emails_sent')
          .select('id, message_id, contact_id')
          .eq('sent_by', userSettings.user_id)
          .not('message_id', 'is', null)
          .is('replied_at', null)
          .in('status', ['sent', 'opened']);

        if (!sentEmails || sentEmails.length === 0) continue;

        // Build lookup map: message_id → email record
        const messageIdMap = new Map<string, { id: string; contactId: string }>();
        for (const email of sentEmails) {
          if (email.message_id) {
            // Store both with and without angle brackets for matching
            const cleanId = email.message_id.replace(/^<|>$/g, '');
            messageIdMap.set(cleanId, { id: email.id, contactId: email.contact_id });
            messageIdMap.set(email.message_id, { id: email.id, contactId: email.contact_id });
          }
        }

        // Connect to IMAP
        client = new ImapFlow({
          host: userSettings.imap_host,
          port: userSettings.imap_port || 993,
          secure: true,
          auth: {
            user: userSettings.imap_user,
            pass: imapPassword,
          },
          logger: false,
        });

        await client.connect();

        // Open INBOX
        await client.mailboxOpen('INBOX');

        // Search for recent emails (last 24 hours)
        const since = new Date();
        since.setHours(since.getHours() - 24);

        const messages = client.fetch(
          { since },
          { envelope: true, headers: ['in-reply-to', 'references'] }
        );

        for await (const msg of messages) {
          // Parse raw headers buffer into individual header values
          const headerText = msg.headers?.toString() || '';
          const inReplyToMatch = headerText.match(/^in-reply-to:\s*(.+)$/mi);
          const referencesMatch = headerText.match(/^references:\s*(.+)$/mi);
          const inReplyTo = inReplyToMatch?.[1]?.trim();
          const references = referencesMatch?.[1]?.trim();

          const referencedIds: string[] = [];
          if (inReplyTo) referencedIds.push(inReplyTo.replace(/^<|>$/g, ''), inReplyTo);
          if (references) {
            for (const ref of references.split(/\s+/)) {
              referencedIds.push(ref.replace(/^<|>$/g, ''), ref);
            }
          }

          for (const refId of referencedIds) {
            const match = messageIdMap.get(refId);
            if (!match) continue;

            const now = new Date().toISOString();

            // Update emails_sent
            await supabase
              .from('emails_sent')
              .update({ status: 'replied', replied_at: now })
              .eq('id', match.id)
              .is('replied_at', null);

            // Update contact status (only if still in early funnel stages)
            await supabase
              .from('contacts')
              .update({ status: 'engaged', replied_at: now })
              .eq('id', match.contactId)
              .in('status', ['new', 'contacted']);

            // Add timeline entry
            await supabase.from('contact_timeline').insert({
              contact_id: match.contactId,
              event_type: 'replied',
              title: 'Réponse détectée',
              description: 'Le contact a répondu à un email',
              metadata: { emails_sent_id: match.id },
            });

            // Remove from map to avoid duplicate processing
            messageIdMap.delete(refId);
            totalReplies++;
            break;
          }
        }

        await client.logout();
        client = null;
      } catch (userError) {
        console.error(
          `Error checking replies for ${userSettings.user_email}:`,
          userError instanceof Error ? userError.message : userError
        );
        userErrors.push(`${userSettings.user_email}: ${userError instanceof Error ? userError.message : 'Unknown error'}`);

        if (client) {
          try { await client.logout(); } catch { /* ignore */ }
        }
      }
    }

    return NextResponse.json({
      repliesDetected: totalReplies,
      usersChecked: usersWithImap?.length || 0,
      errors: userErrors.length > 0 ? userErrors : undefined,
    });
  } catch (error) {
    console.error('check-replies error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
