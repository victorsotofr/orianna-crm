import nodemailer from 'nodemailer';
import { decrypt } from './encryption';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  passwordEncrypted: string;
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  from: string;
}

export async function sendEmail(config: EmailConfig, emailData: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    console.log('🔓 Decrypting password...');
    const password = decrypt(config.passwordEncrypted);
    
    if (!password) {
      throw new Error('Failed to decrypt SMTP password');
    }

    console.log('🔑 Password decrypted successfully, length:', password.length);

    // Create transporter with explicit STARTTLS for port 587
    const transportConfig: any = {
      host: config.host,
      port: config.port,
      secure: config.port === 465, // true for 465, false for other ports (587, 25)
      auth: {
        user: config.user,
        pass: password,
      },
      // Enable debugging
      debug: true,
      logger: true,
    };

    // For port 587, explicitly require STARTTLS
    if (config.port === 587) {
      transportConfig.requireTLS = true;
      transportConfig.tls = {
        ciphers: 'SSLv3',
        rejectUnauthorized: false, // For development, set to true in production
      };
    }

    console.log('🔧 Creating transporter with config:', {
      host: config.host,
      port: config.port,
      secure: transportConfig.secure,
      requireTLS: transportConfig.requireTLS,
      user: config.user,
    });

    const transporter = nodemailer.createTransport(transportConfig);

    // Send email
    console.log('📧 Sending email to:', emailData.to);
    const info = await transporter.sendMail({
      from: `"${emailData.from}" <${config.user}>`,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      bcc: config.user, // Keep track of sent emails
    });

    console.log('✅ Email sent successfully! MessageID:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: any) {
    console.error('❌ Email sending error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error response:', error.response);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

export async function testSmtpConnection(config: EmailConfig): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔓 Decrypting password for connection test...');
    const password = decrypt(config.passwordEncrypted);
    
    if (!password) {
      throw new Error('Failed to decrypt SMTP password');
    }

    console.log('🔑 Password decrypted, length:', password.length);

    const transportConfig: any = {
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: password,
      },
      debug: true,
      logger: true,
    };

    // For port 587, explicitly require STARTTLS
    if (config.port === 587) {
      transportConfig.requireTLS = true;
      transportConfig.tls = {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      };
    }

    console.log('🔧 Testing connection with:', {
      host: config.host,
      port: config.port,
      secure: transportConfig.secure,
      requireTLS: transportConfig.requireTLS,
    });

    const transporter = nodemailer.createTransport(transportConfig);

    // Verify connection
    console.log('🔍 Verifying SMTP connection...');
    await transporter.verify();

    console.log('✅ SMTP connection verified successfully!');

    return { success: true };
  } catch (error: any) {
    console.error('❌ SMTP connection error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error command:', error.command);
    return {
      success: false,
      error: error.message || 'Connection failed',
    };
  }
}

