import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { encrypt } from '@/lib/encryption';
import { testSmtpConnection, sendEmail } from '@/lib/email-sender';

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized - Please log in again' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized - Invalid session' }, { status: 401 });
    }

    const body = await request.json();
    const { smtpHost, smtpPort, smtpUser, smtpPassword } = body;

    // Validate required fields
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      return NextResponse.json(
        { error: 'SMTP configuration is incomplete' },
        { status: 400 }
      );
    }

    const encryptedPassword = encrypt(smtpPassword);

    // Test SMTP connection
    const testResult = await testSmtpConnection({
      host: smtpHost,
      port: parseInt(smtpPort),
      user: smtpUser,
      passwordEncrypted: encryptedPassword,
    });

    if (!testResult.success) {
      return NextResponse.json(
        { error: `Connection failed: ${testResult.error}` },
        { status: 400 }
      );
    }

    // Send a simple test email to the SMTP user (campaign email address)
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
      return NextResponse.json(
        { error: `Test email failed: ${emailResult.error}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Configuration valide! Un email de test a été envoyé à ${smtpUser}`,
    });
  } catch (error: any) {
    console.error('SMTP test error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to test SMTP connection' },
      { status: 500 }
    );
  }
}

