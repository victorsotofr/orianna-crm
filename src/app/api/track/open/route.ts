import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

    // Use service role to update (no auth needed for pixel tracking)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const now = new Date().toISOString();

      // Set opened_at only if not already opened
      await supabase
        .from('emails_sent')
        .update({ opened_at: now })
        .eq('id', statId)
        .is('opened_at', null);

      // Update status to 'opened' only if still 'sent' (don't downgrade 'replied')
      await supabase
        .from('emails_sent')
        .update({ status: 'opened' })
        .eq('id', statId)
        .eq('status', 'sent');
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
