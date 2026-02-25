import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { encrypt } from '@/lib/encryption';
import { testSmtpConnection, sendEmail } from '@/lib/email-sender';

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      console.error('🔴 Failed to create Supabase client:', clientError);
      return NextResponse.json({ error: 'Unauthorized - Please log in again' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('🔴 Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized - Invalid session' }, { status: 401 });
    }

    console.log('✅ User authenticated:', user.email);

    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPassword, useSavedPassword } = body;

    // Validate required fields
    if (!smtpHost || !smtpPort || !smtpUser) {
      return NextResponse.json(
        { error: 'SMTP configuration is incomplete' },
        { status: 400 }
      );
    }

    let encryptedPassword: string;

    // If using saved password, fetch it from database
    if (useSavedPassword) {
      console.log('🔐 Using saved password from database...');
      const { data: settings, error: settingsError } = await supabase
        .from('user_settings')
        .select('smtp_password_encrypted')
        .eq('user_id', user.id)
        .single();

      if (settingsError || !settings?.smtp_password_encrypted) {
        return NextResponse.json(
          { error: 'No saved password found. Please enter your password.' },
          { status: 400 }
        );
      }

      encryptedPassword = settings.smtp_password_encrypted;
      console.log('✅ Retrieved saved encrypted password');
    } else {
      // Validate password is provided
      if (!smtpPassword) {
        return NextResponse.json(
          { error: 'SMTP password is required' },
          { status: 400 }
        );
      }

      console.log('🔧 SMTP Config:', {
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        passwordLength: smtpPassword.length,
      });

      // Encrypt the password (for testing purposes)
      encryptedPassword = encrypt(smtpPassword);
      console.log('🔑 Password encrypted successfully');
    }

    // Test SMTP connection
    console.log('📧 Testing SMTP connection...');
    const testResult = await testSmtpConnection({
      host: smtpHost,
      port: parseInt(smtpPort),
      user: smtpUser,
      passwordEncrypted: encryptedPassword,
    });

    console.log('🔍 Test result:', testResult);

    if (!testResult.success) {
      console.error('❌ SMTP connection failed:', testResult.error);
      return NextResponse.json(
        { error: `Connection failed: ${testResult.error}` },
        { status: 400 }
      );
    }

    console.log('✅ SMTP connection successful, sending test email...');

    // Send a simple test email to the SMTP user (campaign email address)
    console.log('📧 Sending simple test email to:', smtpUser);
    const emailResult = await sendEmail(
      {
        host: smtpHost,
        port: parseInt(smtpPort),
        user: smtpUser,
        passwordEncrypted: encryptedPassword,
      },
      {
        to: smtpUser, // Send to the campaign email address (the SMTP user)
        subject: 'Test',
        html: `<p>test</p>`,
        from: 'Email Automation Platform',
      }
    );

    if (!emailResult.success) {
      console.error('❌ Email send failed:', emailResult.error);
      return NextResponse.json(
        { error: `Test email failed: ${emailResult.error}` },
        { status: 400 }
      );
    }

    console.log('✅ Test email sent successfully!');

    return NextResponse.json({
      success: true,
      message: `Configuration valide! Un email de test a été envoyé à ${smtpUser}`,
    });
  } catch (error: any) {
    console.error('❌ SMTP test error:', error.message, error.code);
    return NextResponse.json(
      { error: error.message || 'Failed to test SMTP connection' },
      { status: 500 }
    );
  }
}

