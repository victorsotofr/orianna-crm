import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for browser/client-side operations
 * Uses @supabase/ssr for cookie-based session management
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // During build/SSG, env vars may not be available.
    // Return a dummy client that will be replaced at runtime.
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }

  return createBrowserClient(url, key);
}
