import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type MailProvider = 'imap' | 'gmail' | 'outlook';

export interface MailAccount {
  id: string;
  user_id: string;
  provider: MailProvider;
  email: string;
  display_name: string | null;
  status: 'active' | 'paused' | 'error';
  sync_enabled: boolean;
  send_enabled: boolean;
  is_default_send: boolean;
  provider_account_id: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_scopes: string[] | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_password_encrypted: string | null;
  bcc_enabled: boolean | null;
  last_synced_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface LegacyMailSettings {
  user_id: string;
  user_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_password_encrypted: string | null;
  bcc_enabled?: boolean | null;
}

export function isGmailConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isMicrosoftMailConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export async function listMailAccounts(supabase: SupabaseClient, userId: string): Promise<MailAccount[]> {
  const { data, error } = await supabase
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_default_send', { ascending: false })
    .order('created_at', { ascending: true });

  if (error && error.code !== '42P01') throw error;
  return (data || []) as MailAccount[];
}

export async function getMailAccount(supabase: SupabaseClient, userId: string, accountId: string): Promise<MailAccount | null> {
  const { data, error } = await supabase
    .from('mail_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error && error.code !== '42P01') throw error;
  return (data as MailAccount | null) || null;
}

export async function getDefaultSendMailAccount(supabase: SupabaseClient, userId: string): Promise<MailAccount | null> {
  const { data, error } = await supabase
    .from('mail_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('send_enabled', true)
    .eq('status', 'active')
    .order('is_default_send', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== '42P01') throw error;
  return (data as MailAccount | null) || null;
}

export async function getThreadMailAccount(
  supabase: SupabaseClient,
  userId: string,
  threadId: string
): Promise<MailAccount | null> {
  const { data: thread, error: threadError } = await supabase
    .from('mailbox_threads')
    .select('mail_account_id')
    .eq('id', threadId)
    .eq('user_id', userId)
    .maybeSingle();

  if (threadError) throw threadError;
  if (!thread?.mail_account_id) return null;
  return getMailAccount(supabase, userId, thread.mail_account_id);
}

export async function setDefaultMailAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  await supabase.from('mail_accounts').update({ is_default_send: false }).eq('user_id', userId);
  const { error } = await supabase
    .from('mail_accounts')
    .update({ is_default_send: true, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deleteMailAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  const { error } = await supabase
    .from('mail_accounts')
    .delete()
    .eq('id', accountId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function upsertLegacyImapMailAccount(
  supabase: SupabaseClient,
  settings: LegacyMailSettings
): Promise<MailAccount | null> {
  const email = settings.smtp_user || settings.imap_user || settings.user_email;
  if (!email) return null;

  const { data: existing, error: existingError } = await supabase
    .from('mail_accounts')
    .select('id, is_default_send')
    .eq('user_id', settings.user_id)
    .eq('provider', 'imap')
    .ilike('email', email)
    .maybeSingle();

  if (existingError && existingError.code !== '42P01') throw existingError;

  const payload = {
    user_id: settings.user_id,
    provider: 'imap',
    email,
    display_name: settings.user_email || email,
    status: 'active',
    sync_enabled: Boolean(settings.imap_host && settings.imap_user && settings.imap_password_encrypted),
    send_enabled: Boolean(settings.smtp_host && settings.smtp_user && settings.smtp_password_encrypted),
    is_default_send: existing?.is_default_send ?? true,
    smtp_host: settings.smtp_host,
    smtp_port: settings.smtp_port || 587,
    smtp_user: settings.smtp_user,
    smtp_password_encrypted: settings.smtp_password_encrypted,
    imap_host: settings.imap_host,
    imap_port: settings.imap_port || 993,
    imap_user: settings.imap_user,
    imap_password_encrypted: settings.imap_password_encrypted,
    bcc_enabled: settings.bcc_enabled !== false,
    updated_at: new Date().toISOString(),
  };

  const query = existing?.id
    ? supabase.from('mail_accounts').update(payload).eq('id', existing.id).select('*').single()
    : supabase.from('mail_accounts').insert(payload).select('*').single();

  const { data, error } = await query;
  if (error && error.code !== '42P01') throw error;
  return (data as MailAccount | null) || null;
}
