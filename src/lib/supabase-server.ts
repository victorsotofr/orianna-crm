import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a Supabase client for server-side operations.
 * Uses @supabase/ssr for automatic token refresh.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return { supabase: null, error: 'Missing Supabase environment variables' };
  }

  try {
    const supabase = createSSRServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — safe to ignore
            // when middleware is refreshing sessions
          }
        },
      },
    });

    return { supabase, error: null };
  } catch (error) {
    console.error('[Supabase Server] Error creating client:', error);
    return { supabase: null, error: 'Failed to create Supabase client' };
  }
}
