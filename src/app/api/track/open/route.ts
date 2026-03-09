import { NextResponse } from 'next/server';
import crypto from 'crypto';

import { getServiceSupabase } from '@/lib/supabase';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function getTrackingSecret(): string {
  const secret = process.env.TRACKING_SECRET;
  if (!secret) {
    throw new Error('TRACKING_SECRET environment variable is required');
  }
  return secret;
}

function verifyHmac(statId: string, hmac: string): boolean {
  const expected = crypto
    .createHmac('sha256', getTrackingSecret())
    .update(statId)
    .digest('hex')
    .substring(0, 16);
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statId = searchParams.get('id');
    const hmac = searchParams.get('h');

    if (!statId || !hmac || !verifyHmac(statId, hmac)) {
      return new NextResponse(TRANSPARENT_GIF, {
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      });
    }

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getServiceSupabase();
      const now = new Date().toISOString();
      const { data: emailRecord } = await supabase
        .from('emails_sent')
        .select('id, status, opened_at, workspace_id, enrollment_id, step_id')
        .eq('id', statId)
        .maybeSingle();

      const wasAlreadyOpened = Boolean(emailRecord?.opened_at);

      if (emailRecord && !wasAlreadyOpened) {
        await supabase
          .from('emails_sent')
          .update({ opened_at: now })
          .eq('id', statId)
          .is('opened_at', null);

      }

      if (emailRecord?.status === 'sent') {
        await supabase
          .from('emails_sent')
          .update({ status: 'opened' })
          .eq('id', statId)
          .eq('status', 'sent');
      }
    }

    return new NextResponse(TRANSPARENT_GIF, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    console.error('Tracking pixel error:', error instanceof Error ? error.message : error);
    return new NextResponse(TRANSPARENT_GIF, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  }
}
