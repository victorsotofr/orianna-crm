import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { encrypt } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      console.error('🔴 Failed to create Supabase client:', clientError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('🔴 Auth error:', authError);
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
      signatureHtml,
      dailySendLimit,
    } = body;

    // Validate required fields (password is optional if already saved)
    if (!smtpHost || !smtpPort || !smtpUser) {
      return NextResponse.json(
        { error: 'SMTP configuration is incomplete' },
        { status: 400 }
      );
    }

    // Validate signature (REQUIRED)
    if (!signatureHtml || signatureHtml.trim() === '') {
      return NextResponse.json(
        { error: 'La signature email est obligatoire pour personnaliser vos emails' },
        { status: 400 }
      );
    }

    // Prepare upsert data
    const upsertData: any = {
      user_id: user.id,
      user_email: user.email,
      smtp_host: smtpHost,
      smtp_port: parseInt(smtpPort),
      smtp_user: smtpUser,
      imap_host: imapHost,
      imap_port: parseInt(imapPort) || 993,
      signature_html: signatureHtml,
      daily_send_limit: parseInt(dailySendLimit) || 50,
    };

    // Only update password if a new one is provided
    if (smtpPassword) {
      const encryptedPassword = encrypt(smtpPassword);
      upsertData.smtp_password_encrypted = encryptedPassword;
      console.log('🔑 Password encrypted and will be updated');
    } else {
      console.log('ℹ️ Password not provided, keeping existing password');
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

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error: any) {
    console.error('Settings save error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}

// GET endpoint to fetch current settings
export async function GET(request: Request) {
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

    // Don't return the encrypted password, but indicate if it exists
    if (settings) {
      const { smtp_password_encrypted, ...safeSettings } = settings;
      return NextResponse.json({ 
        settings: {
          ...safeSettings,
          has_password: !!smtp_password_encrypted, // Indicate if password is saved
        }
      });
    }

    return NextResponse.json({ settings: null });
  } catch (error: any) {
    console.error('Settings fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

