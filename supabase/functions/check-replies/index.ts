// Supabase Edge Function: check-replies
// Thin proxy that delegates to the Next.js API route for IMAP-based reply detection.
// Runs every 15 minutes via pg_cron.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const appUrl = Deno.env.get('APP_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!appUrl) {
      throw new Error('APP_URL environment variable is required')
    }

    const res = await fetch(`${appUrl}/api/emails/check-replies`, {
      method: 'POST',
      headers: {
        'x-service-key': serviceRoleKey,
        'Content-Type': 'application/json',
      },
    })

    const data = await res.json()

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('check-replies proxy error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
