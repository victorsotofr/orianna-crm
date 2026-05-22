import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { encrypt, decrypt } from '@/lib/encryption';
import { upsertLegacyImapMailAccount } from '@/lib/mail-accounts';

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      imapHost,
      imapPort,
      imapUser,
      imapPassword,
      signatureHtml,
      dailySendLimit,
      bccEnabled,
    } = body;

    // Validate required fields (password is optional if already saved)
    if (!smtpHost || !smtpPort || !smtpUser) {
      return NextResponse.json(
        { error: 'SMTP configuration is incomplete' },
        { status: 400 }
      );
    }

    // Prepare upsert data
    const upsertData: Record<string, string | number | boolean | null> = {
      user_id: user.id,
      user_email: user.email || null,
      smtp_host: smtpHost,
      smtp_port: parseInt(smtpPort),
      smtp_user: smtpUser,
      imap_host: imapHost,
      imap_port: parseInt(imapPort) || 993,
      imap_user: imapUser || null,
      daily_send_limit: parseInt(dailySendLimit) || 50,
      bcc_enabled: bccEnabled !== undefined ? bccEnabled : true,
    };

    // Only update signature if provided
    if (signatureHtml !== undefined) {
      upsertData.signature_html = signatureHtml || null;
    }

    // Only update SMTP password if a new one is provided
    if (smtpPassword) {
      const encryptedPassword = encrypt(smtpPassword);
      upsertData.smtp_password_encrypted = encryptedPassword;
    }

    // Only update IMAP password if a new one is provided
    if (imapPassword) {
      const encryptedImapPassword = encrypt(imapPassword);
      upsertData.imap_password_encrypted = encryptedImapPassword;
    }

    // Upsert user settings
    const { error: upsertError } = await supabase
      .from('user_settings')
      .upsert(upsertData, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      throw upsertError;
    }

    const { data: savedSettings, error: savedSettingsError } = await supabase
      .from('user_settings')
      .select('user_id, user_email, smtp_host, smtp_port, smtp_user, smtp_password_encrypted, imap_host, imap_port, imap_user, imap_password_encrypted, bcc_enabled')
      .eq('user_id', user.id)
      .single();

    if (savedSettingsError) throw savedSettingsError;
    await upsertLegacyImapMailAccount(supabase, savedSettings);

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error: unknown) {
    console.error('Settings save error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save settings' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch current settings
export async function GET() {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned"
      throw error;
    }

    // Return decrypted passwords for the authenticated user
    if (settings) {
      const { smtp_password_encrypted, imap_password_encrypted, ...safeSettings } = settings;
      return NextResponse.json({
        settings: {
          ...safeSettings,
          smtp_password: smtp_password_encrypted ? decrypt(smtp_password_encrypted) : '',
          imap_password: imap_password_encrypted ? decrypt(imap_password_encrypted) : '',
        }
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error: unknown) {
    console.error('Settings fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
