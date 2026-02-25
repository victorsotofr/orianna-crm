import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Create a Supabase client for browser/client-side operations.
 * Uses a singleton to avoid creating multiple GoTrue instances.
 */
export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // During build/SSG, env vars may not be available
    console.warn('[Supabase Browser] Missing env vars — returning placeholder client');
    return createBrowserClient(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }

  client = createBrowserClient(url, key);
  return client;
}
