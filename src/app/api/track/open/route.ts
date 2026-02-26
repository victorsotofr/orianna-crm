import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'orianna-tracking-secret';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function verifyHmac(statId: string, hmac: string): boolean {
  const expected = crypto
    .createHmac('sha256', TRACKING_SECRET)
    .update(statId)
    .digest('hex')
    .substring(0, 16);
  return hmac === expected;
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

      await supabase
        .from('email_stats')
        .update({ opened_at: new Date().toISOString() })
        .eq('id', statId)
        .is('opened_at', null);
    }

    return new NextResponse(TRANSPARENT_GIF, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    console.error('Tracking pixel error:', error);
    return new NextResponse(TRANSPARENT_GIF, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  }
}
