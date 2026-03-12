import { NextRequest, NextResponse } from 'next/server';

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

import { getServiceSupabase } from '@/lib/supabase';
import { sendMessage, isTelegramConfigured } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Proactive Telegram notifications cron job.
 * Sends: smart daily digest, follow-up reminders, engagement alerts, deal risk alerts.
 * Intended to run once daily (e.g. 8am).
 */
export async function GET(request: NextRequest) {
  // Auth: service key or Vercel cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = request.headers.get('x-vercel-cron');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret && authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isTelegramConfigured()) {
    return NextResponse.json({ message: 'Telegram not configured' });
  }

  const db = getServiceSupabase();

  // Find all users with Telegram connected and digest enabled
  const { data: users } = await db
    .from('user_settings')
    .select('user_id, telegram_chat_id')
    .not('telegram_chat_id', 'is', null)
    .eq('telegram_notifications_enabled', true);

  if (!users?.length) {
    return NextResponse.json({ message: 'No users with Telegram', processed: 0 });
  }

  let processed = 0;

  for (const user of users) {
    try {
      // Get user's workspace
      const { data: membership } = await db
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.user_id)
        .limit(1)
        .single();

      if (!membership) continue;
      const wsId = membership.workspace_id;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

      // Parallel data fetch
      const [
        sentYesterday, repliesYesterday,
        needFollowUp, staleEngaged,
        openedNotReplied, recentBounces,
        hotLeads
      ] = await Promise.all([
        // Yesterday's activity
        db.from('emails_sent').select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId).gte('sent_at', new Date(Date.now() - 86400000).toISOString())
          .lt('sent_at', todayISO).eq('status', 'sent'),
        db.from('email_stats').select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId).eq('event_type', 'reply')
          .gte('created_at', new Date(Date.now() - 86400000).toISOString()).lt('created_at', todayISO),

        // Follow-up reminders: contacted > 3 days ago, no reply
        db.from('contacts').select('first_name, last_name, company_name, ai_score_label')
          .eq('workspace_id', wsId).eq('status', 'contacted')
          .lt('updated_at', threeDaysAgo)
          .order('ai_score', { ascending: false }).limit(5),

        // Deal risk: engaged contacts inactive > 2 weeks
        db.from('contacts').select('first_name, last_name, company_name')
          .eq('workspace_id', wsId).eq('status', 'engaged')
          .lt('updated_at', twoWeeksAgo).limit(5),

        // Engagement alerts: opened but didn't reply (last 3 days)
        db.from('emails_sent').select('contact_id, subject, contacts(first_name, last_name)')
          .eq('workspace_id', wsId).eq('status', 'sent')
          .not('opened_at', 'is', null)
          .is('replied_at', null)
          .gte('sent_at', threeDaysAgo).limit(5),

        // Recent bounces
        db.from('contacts').select('first_name, last_name, email')
          .eq('workspace_id', wsId).eq('email_bounced', true)
          .gte('bounced_at', weekAgo).limit(5),

        // Hot leads count
        db.from('contacts').select('id', { count: 'exact', head: true })
          .eq('workspace_id', wsId).eq('ai_score_label', 'HOT'),
      ]);

      const alerts: string[] = [];

      // Follow-up reminders
      if (needFollowUp.data?.length) {
        const names = needFollowUp.data.map(c => {
          const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
          const hot = c.ai_score_label === 'HOT' ? ' 🔥' : '';
          return `  · ${name}${c.company_name ? ` @ ${c.company_name}` : ''}${hot}`;
        });
        alerts.push(`<b>Follow-up needed</b> (no reply in 3+ days)\n${names.join('\n')}`);
      }

      // Engagement alerts
      if (openedNotReplied.data?.length) {
        const items = openedNotReplied.data.map(e => {
          const c = e.contacts as unknown as { first_name: string; last_name: string } | null;
          const name = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'Unknown';
          return `  · ${name} opened "${e.subject}"`;
        });
        alerts.push(`<b>Opened but no reply</b>\n${items.join('\n')}`);
      }

      // Deal risk
      if (staleEngaged.data?.length) {
        const names = staleEngaged.data.map(c =>
          `  · ${[c.first_name, c.last_name].filter(Boolean).join(' ')}${c.company_name ? ` @ ${c.company_name}` : ''}`
        );
        alerts.push(`<b>At risk</b> (engaged but inactive 2+ weeks)\n${names.join('\n')}`);
      }

      // Bounces
      if (recentBounces.data?.length) {
        alerts.push(`<b>Recent bounces</b> (${recentBounces.data.length})\n${recentBounces.data.map(c => `  · ${[c.first_name, c.last_name].filter(Boolean).join(' ')} (${c.email})`).join('\n')}`);
      }

      // Build the digest message
      const lines = [
        '<b>☀️ Morning Digest</b>',
        '',
        `Yesterday: ${sentYesterday.count ?? 0} emails sent, ${repliesYesterday.count ?? 0} replies`,
        `Hot leads: ${hotLeads.count ?? 0}`,
      ];

      if (alerts.length) {
        lines.push('', '─── Action needed ───', ...alerts);
      } else {
        lines.push('', 'No urgent actions today. Keep it up!');
      }

      await sendMessage(user.telegram_chat_id!, lines.join('\n'));
      processed++;
    } catch (err) {
      console.error(`Telegram digest error for user ${user.user_id}:`, err);
    }
  }

  return NextResponse.json({ message: 'Digest sent', processed });
}
