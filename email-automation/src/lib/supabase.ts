import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createBrowserClient } from './supabase-browser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client using @supabase/ssr for cookie-based auth
export const supabase = typeof window !== 'undefined'
  ? createBrowserClient()
  : (() => {
      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('[Supabase] Missing env vars during server-side initialization — using placeholder client');
        return createSupabaseClient(
          'https://placeholder.supabase.co',
          'placeholder-key'
        );
      }
      return createSupabaseClient(supabaseUrl, supabaseAnonKey);
    })();

// Server-side Supabase client with service role (for admin operations)
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Server configuration error: missing Supabase credentials');
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
