import 'server-only';
import crypto from 'crypto';

function getTrackingSecret(): string {
  const secret = process.env.TRACKING_SECRET;
  if (!secret) {
    throw new Error('TRACKING_SECRET environment variable is required');
  }
  return secret;
}

export function generateTrackingHmac(emailSentId: string): string {
  return crypto
    .createHmac('sha256', getTrackingSecret())
    .update(emailSentId)
    .digest('hex')
    .substring(0, 16);
}

export function buildTrackingPixelHtml(emailSentId: string): string {
  const hmac = generateTrackingHmac(emailSentId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const trackingUrl = `${baseUrl}/api/track/open?id=${encodeURIComponent(emailSentId)}&h=${encodeURIComponent(hmac)}`;
  return `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:none" />`;
}
