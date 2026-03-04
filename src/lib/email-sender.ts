// This file should only be used on the server
import 'server-only';
import nodemailer from 'nodemailer';
import { decrypt } from './encryption';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  passwordEncrypted: string;
  bccEnabled?: boolean;
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  from: string;
}

export async function sendEmail(config: EmailConfig, emailData: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const password = decrypt(config.passwordEncrypted);

    if (!password) {
      throw new Error('Failed to decrypt SMTP password');
    }

    const transportConfig: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: password,
      },
    };

    // For port 587, explicitly require STARTTLS
    if (config.port === 587) {
      transportConfig.requireTLS = true;
      transportConfig.tls = {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      };
    }

    const transporter = nodemailer.createTransport(transportConfig as nodemailer.TransportOptions);

    const mailOptions: Record<string, unknown> = {
      from: `"${emailData.from}" <${config.user}>`,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
    };
    if (config.bccEnabled !== false) {
      mailOptions.bcc = config.user;
    }

    const info = await transporter.sendMail(mailOptions as nodemailer.SendMailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: message,
    };
  }
}

export async function testSmtpConnection(config: EmailConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const password = decrypt(config.passwordEncrypted);

    if (!password) {
      throw new Error('Failed to decrypt SMTP password');
    }

    const transportConfig: Record<string, unknown> = {
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: password,
      },
    };

    // For port 587, explicitly require STARTTLS
    if (config.port === 587) {
      transportConfig.requireTLS = true;
      transportConfig.tls = {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
      };
    }

    const transporter = nodemailer.createTransport(transportConfig as nodemailer.TransportOptions);

    await transporter.verify();

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return {
      success: false,
      error: message,
    };
  }
}
