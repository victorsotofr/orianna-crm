import { NextRequest, NextResponse } from 'next/server';

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

import { getServiceSupabase } from '@/lib/supabase';
import { sendMessage, isTelegramConfigured, inlineKeyboard } from '@/lib/telegram';
import { scoreContact } from '@/lib/ai-scoring';
import { sendEmail, type EmailConfig, type EmailData } from '@/lib/email-sender';
import { decrypt } from '@/lib/encryption';
import { createGoogleCalendarEvent, listGoogleCalendarEvents } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ─── Types ──────────────────────────────────────────────

interface UserContext {
  user_id: string;
  telegram_pending_action: Record<string, unknown> | null;
}

// ─── Webhook Entry Point ────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  try {
    const update = await request.json();

    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message?.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    // Route commands
    if (text.startsWith('/start ')) {
      await handleStart(chatId, text.slice(7).trim());
    } else if (text === '/start' || text === '/help') {
      await handleHelp(chatId);
    } else if (text === '/status') {
      await handleStatus(chatId);
    } else if (text === '/contacts') {
      await handleContacts(chatId);
    } else if (text === '/hot') {
      await handleHotLeads(chatId);
    } else if (text === '/digest') {
      await handleDigest(chatId);
    } else if (text === '/summarize') {
      await handleSummarize(chatId);
    } else if (text.startsWith('/brief ')) {
      await handleBrief(chatId, text.slice(7).trim());
    } else if (text.startsWith('/score ')) {
      await handleScore(chatId, text.slice(7).trim());
    } else if (text.startsWith('/draft ')) {
      await handleDraft(chatId, text.slice(7).trim());
    } else if (text.startsWith('/reply ')) {
      await handleReply(chatId, text.slice(7).trim());
    } else if (text.startsWith('/send ')) {
      await handleSend(chatId, text.slice(6).trim());
    } else if (text.startsWith('/schedule ')) {
      await handleSchedule(chatId, text.slice(10).trim());
    } else if (text.startsWith('/ask ')) {
      await handleAsk(chatId, text.slice(5).trim());
    } else if (text === '/disconnect') {
      await handleDisconnect(chatId);
    } else {
      await handlePendingOrFreeform(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    return NextResponse.json({ ok: true });
  }
}

// ─── Shared Helpers ─────────────────────────────────────

const supabase = () => getServiceSupabase();

async function getUserByChatId(chatId: number): Promise<UserContext | null> {
  const { data } = await supabase()
    .from('user_settings')
    .select('user_id, telegram_pending_action')
    .eq('telegram_chat_id', chatId)
    .single();
  return data;
}

async function requireUser(chatId: number): Promise<UserContext | null> {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendMessage(chatId, 'Not connected. Link your account from Settings > Integrations.'); return null; }
  return user;
}

async function getWorkspaceForUser(userId: string): Promise<string | null> {
  const { data } = await supabase()
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  return data?.workspace_id ?? null;
}

async function requireWorkspace(chatId: number, userId: string): Promise<string | null> {
  const wsId = await getWorkspaceForUser(userId);
  if (!wsId) { await sendMessage(chatId, 'No workspace found.'); return null; }
  return wsId;
}

async function findContact(wsId: string, query: string) {
  const db = supabase();
  // Try exact email match first
  if (query.includes('@')) {
    const { data } = await db.from('contacts').select('*').eq('workspace_id', wsId).ilike('email', query).limit(1).single();
    if (data) return data;
  }
  // Fuzzy name search — split query into parts and search
  const parts = query.toLowerCase().split(/\s+/);
  const { data: contacts } = await db
    .from('contacts')
    .select('*')
    .eq('workspace_id', wsId)
    .or(parts.map(p => `first_name.ilike.%${p}%,last_name.ilike.%${p}%,company_name.ilike.%${p}%`).join(','))
    .limit(5);

  if (!contacts?.length) return null;
  // Score matches — prefer exact name matches
  const scored = contacts.map(c => {
    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
    const exact = name.includes(query.toLowerCase()) ? 10 : 0;
    const partMatches = parts.filter(p => name.includes(p)).length;
    return { contact: c, score: exact + partMatches };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].contact;
}

function contactName(c: { first_name?: string | null; last_name?: string | null }) {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
}

async function setPending(userId: string, action: Record<string, unknown>) {
  await supabase().from('user_settings').update({ telegram_pending_action: action }).eq('user_id', userId);
}

async function clearPending(userId: string) {
  await supabase().from('user_settings').update({ telegram_pending_action: null }).eq('user_id', userId);
}

async function getBusinessContext(wsId: string) {
  const { data } = await supabase()
    .from('workspaces')
    .select('ai_company_description, ai_target_industry, ai_target_roles, ai_geographic_focus')
    .eq('id', wsId)
    .single();
  return data;
}

async function getUserSmtpConfig(userId: string): Promise<EmailConfig | null> {
  const { data } = await supabase()
    .from('user_settings')
    .select('smtp_host, smtp_port, smtp_user, smtp_password')
    .eq('user_id', userId)
    .single();
  if (!data?.smtp_host || !data?.smtp_password) return null;
  return {
    host: data.smtp_host,
    port: data.smtp_port || 587,
    user: data.smtp_user || '',
    passwordEncrypted: data.smtp_password,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Basic Commands ─────────────────────────────────────

async function handleStart(chatId: number, token: string) {
  const db = supabase();
  const { data: settings } = await db
    .from('user_settings')
    .select('user_id, telegram_link_token_expires_at')
    .eq('telegram_link_token', token)
    .single();

  if (!settings) {
    await sendMessage(chatId, 'Invalid or expired link code. Generate a new one from Settings.');
    return;
  }

  if (settings.telegram_link_token_expires_at && new Date(settings.telegram_link_token_expires_at) < new Date()) {
    await sendMessage(chatId, 'This link code has expired. Generate a new one from Settings.');
    return;
  }

  await db.from('user_settings').update({
    telegram_chat_id: chatId,
    telegram_connected_at: new Date().toISOString(),
    telegram_link_token: null,
    telegram_link_token_expires_at: null,
    telegram_notifications_enabled: true,
  }).eq('user_id', settings.user_id);

  await sendMessage(chatId, [
    '<b>Account linked successfully!</b>',
    '',
    'Type /help to see all available commands.',
  ].join('\n'));
}

async function handleHelp(chatId: number) {
  await sendMessage(chatId, [
    '<b>Orianna CRM Bot</b>',
    '',
    '<b>Data</b>',
    '/contacts — Recent contacts',
    '/hot — Hot leads',
    '/digest — Daily stats',
    '/summarize — AI daily summary with insights',
    '',
    '<b>AI Actions</b>',
    '/ask &lt;question&gt; — Ask anything about your CRM',
    '/brief &lt;name&gt; — AI meeting prep brief',
    '/score &lt;name&gt; — AI lead scoring',
    '/draft &lt;name&gt; — AI outreach email draft',
    '/reply &lt;name&gt; — AI reply to last conversation',
    '',
    '<b>Actions</b>',
    '/send &lt;name&gt; &lt;message&gt; — Send email',
    '/schedule &lt;name&gt; &lt;date&gt; &lt;time&gt; — Create meeting',
    '',
    '<b>Settings</b>',
    '/status — Connection status',
    '/disconnect — Unlink account',
  ].join('\n'));
}

async function handleStatus(chatId: number) {
  const user = await requireUser(chatId);
  if (!user) return;

  const { data: settings } = await supabase()
    .from('user_settings')
    .select('telegram_connected_at, telegram_notifications_enabled, telegram_notify_replies, telegram_notify_bounces, telegram_notify_meetings')
    .eq('user_id', user.user_id)
    .single();

  if (!settings) { await sendMessage(chatId, 'Settings not found.'); return; }

  const on = (v: boolean | null) => v !== false ? 'ON' : 'OFF';
  await sendMessage(chatId, [
    '<b>Connection Status</b>',
    '',
    `Connected since: ${settings.telegram_connected_at ? new Date(settings.telegram_connected_at).toLocaleDateString() : 'Unknown'}`,
    `Notifications: ${on(settings.telegram_notifications_enabled)}`,
    `  Replies: ${on(settings.telegram_notify_replies)}`,
    `  Bounces: ${on(settings.telegram_notify_bounces)}`,
    `  Meetings: ${on(settings.telegram_notify_meetings)}`,
  ].join('\n'));
}

async function handleContacts(chatId: number) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  const { data: contacts } = await supabase()
    .from('contacts')
    .select('first_name, last_name, company_name, status, email')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!contacts?.length) { await sendMessage(chatId, 'No contacts found.'); return; }

  const lines = contacts.map((c, i) => {
    const name = contactName(c);
    const company = c.company_name ? ` @ ${c.company_name}` : '';
    return `${i + 1}. <b>${esc(name)}</b>${esc(company)}\n   ${c.status || 'new'} · ${c.email || 'no email'}`;
  });

  await sendMessage(chatId, `<b>Recent Contacts (${contacts.length})</b>\n\n${lines.join('\n\n')}`);
}

async function handleHotLeads(chatId: number) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  const { data: contacts } = await supabase()
    .from('contacts')
    .select('first_name, last_name, company_name, ai_score, email, status')
    .eq('workspace_id', wsId)
    .eq('ai_score_label', 'HOT')
    .order('ai_score', { ascending: false })
    .limit(10);

  if (!contacts?.length) { await sendMessage(chatId, 'No hot leads found.'); return; }

  const lines = contacts.map((c, i) => {
    const name = contactName(c);
    return `${i + 1}. <b>${esc(name)}</b> — ${c.ai_score}/100\n   ${c.company_name || ''} · ${c.status || 'new'}`;
  });

  await sendMessage(chatId, `<b>Hot Leads (${contacts.length})</b>\n\n${lines.join('\n\n')}`);
}

async function handleDigest(chatId: number) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const [sentResult, repliesResult, hotResult, contactsResult] = await Promise.all([
    supabase().from('emails_sent').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).gte('sent_at', todayISO).eq('status', 'sent'),
    supabase().from('email_stats').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).eq('event_type', 'reply').gte('created_at', todayISO),
    supabase().from('contacts').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId).eq('ai_score_label', 'HOT'),
    supabase().from('contacts').select('id', { count: 'exact', head: true })
      .eq('workspace_id', wsId),
  ]);

  await sendMessage(chatId, [
    '<b>Daily Digest</b>',
    '',
    `Emails sent today: ${sentResult.count ?? 0}`,
    `Replies today: ${repliesResult.count ?? 0}`,
    `Hot leads: ${hotResult.count ?? 0}`,
    `Total contacts: ${contactsResult.count ?? 0}`,
  ].join('\n'));
}

// ─── AI Commands ────────────────────────────────────────

async function handleSummarize(chatId: number) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  await sendMessage(chatId, 'Analyzing your day...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const db = supabase();

  const [sent, replies, bounces, hotLeads, recentTimeline, newContacts] = await Promise.all([
    db.from('emails_sent').select('contact_id, status, sent_at').eq('workspace_id', wsId).gte('sent_at', todayISO).eq('status', 'sent'),
    db.from('email_stats').select('contact_id, created_at').eq('workspace_id', wsId).eq('event_type', 'reply').gte('created_at', todayISO),
    db.from('contacts').select('first_name, last_name, email, bounced_at').eq('workspace_id', wsId).eq('email_bounced', true).gte('bounced_at', weekAgo),
    db.from('contacts').select('first_name, last_name, company_name, ai_score, status').eq('workspace_id', wsId).eq('ai_score_label', 'HOT').order('ai_score', { ascending: false }).limit(5),
    db.from('contact_timeline').select('contact_id, event_type, title, description, created_at').eq('workspace_id', wsId).gte('created_at', todayISO).order('created_at', { ascending: false }).limit(20),
    db.from('contacts').select('first_name, last_name, company_name').eq('workspace_id', wsId).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(10),
  ]);

  // Contacts needing follow-up (contacted > 3 days ago, no reply)
  const { data: needFollowUp } = await db
    .from('contacts')
    .select('first_name, last_name, company_name, status')
    .eq('workspace_id', wsId)
    .eq('status', 'contacted')
    .lt('updated_at', new Date(Date.now() - 3 * 86400000).toISOString())
    .limit(10);

  const dataForAI = {
    emailsSentToday: sent.data?.length ?? 0,
    repliesToday: replies.data?.length ?? 0,
    bouncesThisWeek: bounces.data?.map(c => contactName(c)) ?? [],
    hotLeads: hotLeads.data?.map(c => ({ name: contactName(c), company: c.company_name, score: c.ai_score, status: c.status })) ?? [],
    recentActivity: recentTimeline.data?.map(e => ({ type: e.event_type, title: e.title })) ?? [],
    newContactsThisWeek: newContacts.data?.length ?? 0,
    needFollowUp: needFollowUp?.map(c => ({ name: contactName(c), company: c.company_name })) ?? [],
  };

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are a sales assistant analyzing CRM data for a daily briefing. Be concise, actionable, and insightful. Use plain text (no markdown). Structure your response with clear sections. Highlight what needs attention TODAY. Keep it under 1500 characters.`,
      prompt: `Here's today's CRM data:\n${JSON.stringify(dataForAI, null, 2)}\n\nGive me a smart daily summary: what happened today, what needs my attention, which contacts to prioritize, and any risks I should know about.`,
    });

    await sendMessage(chatId, `<b>AI Daily Summary</b>\n\n${esc(text)}`);
  } catch (err) {
    console.error('Summarize error:', err);
    await sendMessage(chatId, 'Failed to generate summary. Try again later.');
  }
}

async function handleAsk(chatId: number, question: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  if (!question) { await sendMessage(chatId, 'Usage: /ask &lt;your question&gt;'); return; }

  await sendMessage(chatId, 'Thinking...');

  const db = supabase();

  // Gather broad CRM context for Claude to answer from
  const [contactStats, hotLeads, recentReplies, recentSent, topCompanies] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', wsId),
    db.from('contacts').select('first_name, last_name, company_name, ai_score, ai_score_label, status, email, location, job_title')
      .eq('workspace_id', wsId).eq('ai_score_label', 'HOT').order('ai_score', { ascending: false }).limit(20),
    db.from('email_stats').select('contact_id, created_at').eq('workspace_id', wsId).eq('event_type', 'reply')
      .order('created_at', { ascending: false }).limit(20),
    db.from('emails_sent').select('contact_id, sent_at, status').eq('workspace_id', wsId)
      .order('sent_at', { ascending: false }).limit(30),
    db.from('contacts').select('company_name').eq('workspace_id', wsId).not('company_name', 'is', null)
      .order('created_at', { ascending: false }).limit(100),
  ]);

  // Get company frequency
  const companyFreq: Record<string, number> = {};
  topCompanies.data?.forEach((c: { company_name: string }) => {
    if (c.company_name) companyFreq[c.company_name] = (companyFreq[c.company_name] || 0) + 1;
  });
  const topCompaniesList = Object.entries(companyFreq).sort((a, b) => b[1] - a[1]).slice(0, 15);

  // If question mentions a specific contact, try to find them
  let specificContact = null;
  const nameMatch = question.match(/about\s+(.+?)(?:\?|$)/i) || question.match(/for\s+(.+?)(?:\?|$)/i);
  if (nameMatch) {
    specificContact = await findContact(wsId, nameMatch[1].trim());
  }

  const crmData = {
    totalContacts: contactStats.count ?? 0,
    hotLeads: hotLeads.data?.map((c: Record<string, unknown>) => ({ name: contactName(c as { first_name?: string | null; last_name?: string | null }), company: c.company_name, score: c.ai_score, status: c.status, email: c.email, location: c.location, title: c.job_title })) ?? [],
    recentReplies: recentReplies.data?.length ?? 0,
    recentEmailsSent: recentSent.data?.length ?? 0,
    topCompanies: topCompaniesList,
    ...(specificContact && { matchedContact: {
      name: contactName(specificContact),
      email: specificContact.email,
      company: specificContact.company_name,
      status: specificContact.status,
      score: specificContact.ai_score,
      label: specificContact.ai_score_label,
      title: specificContact.job_title,
      location: specificContact.location,
      personalizedLine: specificContact.ai_personalized_line,
      bounced: specificContact.email_bounced,
    }}),
  };

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are an AI assistant for a B2B sales CRM called Orianna. Answer the user's question based on the CRM data provided. Be concise and direct. Use plain text (no markdown). If you can't answer precisely, say so and suggest what data might help. Keep responses under 1500 characters.`,
      prompt: `CRM Data:\n${JSON.stringify(crmData, null, 2)}\n\nQuestion: ${question}`,
    });

    await sendMessage(chatId, esc(text));
  } catch (err) {
    console.error('Ask error:', err);
    await sendMessage(chatId, 'Failed to process your question. Try again.');
  }
}

async function handleBrief(chatId: number, nameQuery: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  if (!nameQuery) { await sendMessage(chatId, 'Usage: /brief &lt;contact name&gt;'); return; }

  const contact = await findContact(wsId, nameQuery);
  if (!contact) { await sendMessage(chatId, `No contact found matching "${esc(nameQuery)}".`); return; }

  await sendMessage(chatId, `Preparing brief for <b>${esc(contactName(contact))}</b>...`);

  const db = supabase();
  const name = contactName(contact);

  // Gather engagement data
  const [emailsSent, timeline, threads] = await Promise.all([
    db.from('emails_sent').select('subject, sent_at, status, opened_at, replied_at')
      .eq('contact_id', contact.id).order('sent_at', { ascending: false }).limit(10),
    db.from('contact_timeline').select('event_type, title, description, created_at')
      .eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(15),
    db.from('mailbox_messages').select('subject, from_address, body_text, received_at')
      .eq('workspace_id', wsId).ilike('from_address', `%${contact.email || ''}%`)
      .order('received_at', { ascending: false }).limit(10),
  ]);

  const bizCtx = await getBusinessContext(wsId);
  const crmParts = [
    `Name: ${name}`, contact.job_title && `Title: ${contact.job_title}`,
    contact.company_name && `Company: ${contact.company_name}`,
    contact.email && `Email: ${contact.email}`, contact.location && `Location: ${contact.location}`,
    contact.ai_score && `Score: ${contact.ai_score}/100 (${contact.ai_score_label})`,
    contact.status && `Status: ${contact.status}`,
  ].filter(Boolean).join('\n');

  const engagementParts = emailsSent.data?.map(e =>
    `${e.subject} (${e.status}${e.opened_at ? ', opened' : ''}${e.replied_at ? ', replied' : ''})`
  ) ?? [];

  const convParts = threads.data?.map(m =>
    `[${new Date(m.received_at).toLocaleDateString()}] ${m.subject}: ${(m.body_text || '').slice(0, 100)}`
  ) ?? [];

  const businessParts: string[] = [];
  if (bizCtx?.ai_company_description) businessParts.push(`Our company: ${bizCtx.ai_company_description}`);
  if (bizCtx?.ai_target_industry) businessParts.push(`Target industry: ${bizCtx.ai_target_industry}`);

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are a sales assistant preparing a meeting brief. Be concise and actionable. Use plain text (no markdown). Structure: Company Summary, Contact Role, Engagement Recap, Talking Points, Suggested Questions. Keep under 2000 characters.`,
      prompt: `CRM DATA:\n${crmParts}\n\n${engagementParts.length ? `EMAILS:\n${engagementParts.join('\n')}\n\n` : ''}${convParts.length ? `CONVERSATIONS:\n${convParts.join('\n')}\n\n` : ''}${businessParts.length ? `OUR BUSINESS:\n${businessParts.join('\n')}\n\n` : ''}Generate a concise meeting prep brief for ${name}.`,
    });

    await sendMessage(chatId, `<b>Meeting Brief — ${esc(name)}</b>\n\n${esc(text)}`);
  } catch (err) {
    console.error('Brief error:', err);
    await sendMessage(chatId, 'Failed to generate brief. Try again.');
  }
}

async function handleScore(chatId: number, nameQuery: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  if (!nameQuery) { await sendMessage(chatId, 'Usage: /score &lt;contact name&gt;'); return; }

  const contact = await findContact(wsId, nameQuery);
  if (!contact) { await sendMessage(chatId, `No contact found matching "${esc(nameQuery)}".`); return; }

  await sendMessage(chatId, `Scoring <b>${esc(contactName(contact))}</b>...`);

  try {
    // Get Linkup API key if available
    const { data: userSettings } = await supabase()
      .from('user_settings')
      .select('linkup_api_key_encrypted')
      .eq('user_id', user.user_id)
      .single();

    const linkupKey = userSettings?.linkup_api_key_encrypted ? decrypt(userSettings.linkup_api_key_encrypted) : undefined;
    const bizCtx = await getBusinessContext(wsId);

    const result = await scoreContact(contact, linkupKey, undefined, bizCtx ? {
      companyDescription: bizCtx.ai_company_description || '',
      targetIndustry: bizCtx.ai_target_industry || '',
      targetRoles: bizCtx.ai_target_roles || '',
      geographicFocus: bizCtx.ai_geographic_focus || '',
    } : undefined);

    // Save score to DB
    await supabase().from('contacts').update({
      ai_score: result.score,
      ai_score_label: result.label,
      ai_scoring_reasoning: result.reasoning,
      ai_scored_at: new Date().toISOString(),
    }).eq('id', contact.id);

    const emoji = result.label === 'HOT' ? '🔥' : result.label === 'WARM' ? '🟡' : '🔵';
    await sendMessage(chatId, [
      `<b>${esc(contactName(contact))}</b> — ${emoji} ${result.score}/100 (${result.label})`,
      '',
      esc(result.reasoning),
    ].join('\n'));
  } catch (err) {
    console.error('Score error:', err);
    await sendMessage(chatId, 'Failed to score contact. Try again.');
  }
}

async function handleDraft(chatId: number, nameQuery: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  if (!nameQuery) { await sendMessage(chatId, 'Usage: /draft &lt;contact name&gt;'); return; }

  const contact = await findContact(wsId, nameQuery);
  if (!contact) { await sendMessage(chatId, `No contact found matching "${esc(nameQuery)}".`); return; }

  await sendMessage(chatId, `Drafting email for <b>${esc(contactName(contact))}</b>...`);

  const bizCtx = await getBusinessContext(wsId);
  const name = contactName(contact);

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are a B2B sales email copywriter. Write a short, personalized cold outreach email. Rules:
- Plain text only, no markdown
- First line is the subject (prefixed with "Subject: ")
- Then a blank line, then the email body
- Keep it under 150 words
- Professional but warm tone
- Include a clear CTA
- Use the contact's first name`,
      prompt: `Contact: ${name}\nTitle: ${contact.job_title || 'Unknown'}\nCompany: ${contact.company_name || 'Unknown'}\nLocation: ${contact.location || 'Unknown'}\n${contact.ai_personalized_line ? `Personalized hook: ${contact.ai_personalized_line}\n` : ''}${bizCtx?.ai_company_description ? `Our company: ${bizCtx.ai_company_description}\n` : ''}${bizCtx?.ai_target_industry ? `Target industry: ${bizCtx.ai_target_industry}\n` : ''}\nWrite a personalized cold outreach email.`,
    });

    // Store as pending for confirmation
    await setPending(user.user_id, {
      type: 'send_draft',
      contactId: contact.id,
      contactEmail: contact.email,
      contactName: name,
      draft: text,
    });

    await sendMessage(chatId, [
      `<b>Draft for ${esc(name)}</b>`,
      '',
      esc(text),
      '',
      contact.email ? 'Send this email? Reply <b>yes</b> to send, or <b>no</b> to cancel.' : '⚠️ No email address on file for this contact.',
    ].join('\n'));
  } catch (err) {
    console.error('Draft error:', err);
    await sendMessage(chatId, 'Failed to generate draft. Try again.');
  }
}

async function handleReply(chatId: number, nameQuery: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  if (!nameQuery) { await sendMessage(chatId, 'Usage: /reply &lt;contact name&gt;'); return; }

  const contact = await findContact(wsId, nameQuery);
  if (!contact) { await sendMessage(chatId, `No contact found matching "${esc(nameQuery)}".`); return; }

  if (!contact.email) { await sendMessage(chatId, 'This contact has no email address.'); return; }

  await sendMessage(chatId, `Generating reply for <b>${esc(contactName(contact))}</b>...`);

  const db = supabase();
  // Find the latest conversation thread with this contact
  const { data: messages } = await db
    .from('mailbox_messages')
    .select('subject, from_address, to_address, body_text, received_at, message_id')
    .eq('workspace_id', wsId)
    .or(`from_address.ilike.%${contact.email}%,to_address.ilike.%${contact.email}%`)
    .order('received_at', { ascending: false })
    .limit(8);

  if (!messages?.length) {
    await sendMessage(chatId, `No conversation history found with ${esc(contactName(contact))}. Use /draft instead.`);
    return;
  }

  const threadContext = messages.reverse().map(m => {
    const from = m.from_address?.includes(contact.email!) ? contactName(contact) : 'Me';
    return `[${from}] ${m.subject}: ${(m.body_text || '').slice(0, 200)}`;
  }).join('\n\n');

  const lastInbound = messages.filter(m => m.from_address?.toLowerCase().includes(contact.email!.toLowerCase())).pop();

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `You are writing a professional email reply. Rules:
- Plain text only, no markdown
- Match the language of the conversation
- Be natural and human-sounding
- Keep it concise (under 100 words)
- Don't include a subject line`,
      prompt: `Conversation thread:\n${threadContext}\n\nWrite a reply to the last message from ${contactName(contact)}.`,
    });

    await setPending(user.user_id, {
      type: 'send_reply',
      contactId: contact.id,
      contactEmail: contact.email,
      contactName: contactName(contact),
      subject: lastInbound?.subject ? `Re: ${lastInbound.subject.replace(/^Re:\s*/i, '')}` : 'Re:',
      inReplyTo: lastInbound?.message_id || null,
      draft: text,
    });

    await sendMessage(chatId, [
      `<b>Reply draft for ${esc(contactName(contact))}</b>`,
      '',
      esc(text),
      '',
      'Send this reply? Reply <b>yes</b> to send, or <b>no</b> to cancel.',
    ].join('\n'));
  } catch (err) {
    console.error('Reply error:', err);
    await sendMessage(chatId, 'Failed to generate reply. Try again.');
  }
}

// ─── Action Commands ────────────────────────────────────

async function handleSend(chatId: number, input: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  // Parse: /send ContactName message goes here
  const firstSpace = input.indexOf(' ');
  if (firstSpace === -1) {
    await sendMessage(chatId, 'Usage: /send &lt;contact name&gt; &lt;message&gt;\nExample: /send Jean Dupont Quick follow-up on our call');
    return;
  }

  // Try progressively longer name matches
  let contact = null;
  let messageText = '';
  const words = input.split(/\s+/);

  for (let nameWords = Math.min(3, words.length - 1); nameWords >= 1; nameWords--) {
    const namePart = words.slice(0, nameWords).join(' ');
    const msgPart = words.slice(nameWords).join(' ');
    const found = await findContact(wsId, namePart);
    if (found) {
      contact = found;
      messageText = msgPart;
      break;
    }
  }

  if (!contact) { await sendMessage(chatId, `No contact found. Check the name and try again.`); return; }
  if (!contact.email) { await sendMessage(chatId, `${esc(contactName(contact))} has no email address.`); return; }
  if (!messageText) { await sendMessage(chatId, 'Please include a message after the contact name.'); return; }

  await setPending(user.user_id, {
    type: 'send_quick',
    contactId: contact.id,
    contactEmail: contact.email,
    contactName: contactName(contact),
    subject: `Message from Orianna`,
    body: messageText,
  });

  await sendMessage(chatId, [
    `<b>Send email to ${esc(contactName(contact))}</b>`,
    `To: ${esc(contact.email)}`,
    '',
    esc(messageText),
    '',
    'Send? Reply <b>yes</b> to confirm, or <b>no</b> to cancel.',
  ].join('\n'));
}

async function handleSchedule(chatId: number, input: string) {
  const user = await requireUser(chatId);
  if (!user) return;
  const wsId = await requireWorkspace(chatId, user.user_id);
  if (!wsId) return;

  if (!input) {
    await sendMessage(chatId, 'Usage: /schedule &lt;name&gt; &lt;date&gt; &lt;time&gt;\nExample: /schedule Jean Dupont tomorrow 14:00');
    return;
  }

  await sendMessage(chatId, 'Parsing your meeting request...');

  // Use Claude to parse the natural language input
  try {
    const { text: parsed } = await generateText({
      model: anthropic('claude-sonnet-4-5-20250929'),
      system: `Parse this meeting request and extract: contact name, date, time, and optional description.
Return JSON only: {"name": "...", "date": "YYYY-MM-DD", "time": "HH:MM", "duration_minutes": 30, "description": "..."}
Today is ${new Date().toISOString().split('T')[0]}. Interpret relative dates (tomorrow, next Monday, etc.) accordingly.
If time is missing, default to 10:00. Duration defaults to 30 minutes.`,
      prompt: input,
    });

    const meeting = JSON.parse(parsed.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    const contact = await findContact(wsId, meeting.name);

    if (!contact) { await sendMessage(chatId, `No contact found matching "${esc(meeting.name)}".`); return; }

    const startISO = `${meeting.date}T${meeting.time}:00`;
    const endDate = new Date(startISO);
    endDate.setMinutes(endDate.getMinutes() + (meeting.duration_minutes || 30));
    const endISO = endDate.toISOString().replace('Z', '');

    await setPending(user.user_id, {
      type: 'create_meeting',
      contactId: contact.id,
      contactEmail: contact.email,
      contactName: contactName(contact),
      summary: `Meeting with ${contactName(contact)}`,
      start: startISO,
      end: endISO,
      description: meeting.description || '',
    });

    await sendMessage(chatId, [
      `<b>Create meeting?</b>`,
      '',
      `With: ${esc(contactName(contact))}`,
      `Date: ${meeting.date} at ${meeting.time}`,
      `Duration: ${meeting.duration_minutes || 30} min`,
      meeting.description ? `Note: ${esc(meeting.description)}` : '',
      '',
      'Confirm? Reply <b>yes</b> or <b>no</b>.',
    ].filter(Boolean).join('\n'));
  } catch (err) {
    console.error('Schedule parse error:', err);
    await sendMessage(chatId, 'Could not parse your meeting request. Try: /schedule Jean Dupont 2025-03-15 14:00');
  }
}

// ─── Pending Action Handler ─────────────────────────────

async function handlePendingOrFreeform(chatId: number, text: string) {
  const user = await getUserByChatId(chatId);
  if (!user) {
    await sendMessage(chatId, 'Not connected. Link your account from Settings.\nType /help for commands.');
    return;
  }

  const pending = user.telegram_pending_action as Record<string, unknown> | null;
  if (!pending) {
    // No pending action — treat as freeform /ask
    await handleAsk(chatId, text);
    return;
  }

  const answer = text.toLowerCase().trim();
  await clearPending(user.user_id);

  if (answer === 'no' || answer === 'cancel' || answer === 'non') {
    await sendMessage(chatId, 'Cancelled.');
    return;
  }

  if (answer !== 'yes' && answer !== 'oui' && answer !== 'y') {
    await sendMessage(chatId, 'Cancelled. Type /help for commands.');
    return;
  }

  const type = pending.type as string;

  if (type === 'send_draft' || type === 'send_reply' || type === 'send_quick') {
    await executeSendEmail(chatId, user.user_id, pending);
  } else if (type === 'create_meeting') {
    await executeCreateMeeting(chatId, user.user_id, pending);
  } else {
    await sendMessage(chatId, 'Unknown action. Cancelled.');
  }
}

async function executeSendEmail(chatId: number, userId: string, pending: Record<string, unknown>) {
  const config = await getUserSmtpConfig(userId);
  if (!config) {
    await sendMessage(chatId, 'SMTP not configured. Set up your email in Settings first.');
    return;
  }

  const contactEmail = pending.contactEmail as string;
  const cName = pending.contactName as string;

  let subject: string;
  let body: string;

  if (pending.type === 'send_draft') {
    // Parse subject from draft text
    const draft = pending.draft as string;
    const subjectMatch = draft.match(/^Subject:\s*(.+)$/im);
    subject = subjectMatch ? subjectMatch[1] : `Message for ${cName}`;
    body = draft.replace(/^Subject:\s*.+\n\n?/im, '');
  } else if (pending.type === 'send_reply') {
    subject = pending.subject as string;
    body = pending.draft as string;
  } else {
    subject = pending.subject as string;
    body = pending.body as string;
  }

  try {
    const emailData: EmailData = {
      to: contactEmail,
      subject,
      html: `<div>${body.replace(/\n/g, '<br>')}</div>`,
      text: body,
      from: config.user,
      ...(pending.inReplyTo ? { inReplyTo: pending.inReplyTo as string } : {}),
    };

    const result = await sendEmail(config, emailData);

    if (result.success) {
      // Record in emails_sent
      const wsId = await getWorkspaceForUser(userId);
      if (wsId) {
        await supabase().from('emails_sent').insert({
          workspace_id: wsId,
          contact_id: pending.contactId as string,
          user_id: userId,
          to_email: contactEmail,
          subject,
          html_content: emailData.html,
          status: 'sent',
          sent_at: new Date().toISOString(),
          message_id: result.messageId,
        });
      }
      await sendMessage(chatId, `Email sent to <b>${esc(cName)}</b> (${esc(contactEmail)})`);
    } else {
      await sendMessage(chatId, `Failed to send: ${esc(result.error || 'Unknown error')}`);
    }
  } catch (err) {
    console.error('Send email error:', err);
    await sendMessage(chatId, 'Failed to send email. Check your SMTP settings.');
  }
}

async function executeCreateMeeting(chatId: number, userId: string, pending: Record<string, unknown>) {
  try {
    const event = await createGoogleCalendarEvent(userId, {
      summary: pending.summary as string,
      start: pending.start as string,
      end: pending.end as string,
      description: pending.description as string || '',
      attendees: pending.contactEmail ? [pending.contactEmail as string] : undefined,
      createMeet: true,
      sendUpdates: 'all',
    });

    const meetUrl = event.meetUrl ? `\nGoogle Meet: ${event.meetUrl}` : '';
    await sendMessage(chatId, `Meeting created with <b>${esc(pending.contactName as string)}</b>${meetUrl}`);
  } catch (err) {
    console.error('Create meeting error:', err);
    await sendMessage(chatId, 'Failed to create meeting. Make sure Google Calendar is connected in Settings.');
  }
}

// ─── Disconnect ─────────────────────────────────────────

async function handleDisconnect(chatId: number) {
  const user = await getUserByChatId(chatId);
  if (!user) { await sendMessage(chatId, 'Not connected.'); return; }

  await sendMessage(chatId, 'Disconnect from Orianna CRM?', {
    replyMarkup: inlineKeyboard([[
      { text: 'Yes, disconnect', callback_data: 'disconnect_confirm' },
      { text: 'Cancel', callback_data: 'disconnect_cancel' },
    ]]),
  });
}

async function handleCallbackQuery(query: { id: string; message?: { chat: { id: number } }; data?: string }) {
  const chatId = query.message?.chat?.id;
  if (!chatId || !query.data) return;

  if (query.data === 'disconnect_confirm') {
    await supabase().from('user_settings').update({
      telegram_chat_id: null, telegram_connected_at: null, telegram_notifications_enabled: true, telegram_pending_action: null,
    }).eq('telegram_chat_id', chatId);
    await sendMessage(chatId, 'Disconnected. Reconnect anytime from Settings.');
  } else if (query.data === 'disconnect_cancel') {
    await sendMessage(chatId, 'Cancelled.');
  }
}
