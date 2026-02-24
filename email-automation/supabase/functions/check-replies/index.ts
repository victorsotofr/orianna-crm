// Supabase Edge Function: check-replies
// Runs every 15 minutes via pg_cron to check for email replies via IMAP
// Marks enrollments as "replied" and updates contact status

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Get all team members with IMAP credentials configured
    const { data: usersWithImap, error } = await supabase
      .from('user_settings')
      .select('user_id, user_email, imap_host, imap_port, imap_user, imap_password_encrypted')
      .not('imap_user', 'is', null)
      .not('imap_password_encrypted', 'is', null)

    if (error) throw error

    let totalReplies = 0

    for (const userSettings of usersWithImap || []) {
      try {
        // NOTE: In Deno Edge Functions, we can't use Node.js imapflow directly.
        // For IMAP checking in production, you would:
        // 1. Use a Deno-compatible IMAP library, OR
        // 2. Call an external service/webhook, OR
        // 3. Run this as a Node.js script via pg_cron calling a Next.js API route
        //
        // For now, this function checks the emails_sent table for any replies
        // that were manually marked or detected through other means.

        // Get contacts with active enrollments for this user
        const { data: activeEnrollments } = await supabase
          .from('sequence_enrollments')
          .select(`
            id,
            contact_id,
            sequence_id,
            contacts (email)
          `)
          .eq('status', 'active')

        if (!activeEnrollments) continue

        // Check if any enrolled contact emails have replied
        // Look in emails_sent for status = 'replied'
        for (const enrollment of activeEnrollments) {
          const { data: repliedEmails } = await supabase
            .from('emails_sent')
            .select('id')
            .eq('contact_id', enrollment.contact_id)
            .eq('status', 'replied')
            .limit(1)

          if (repliedEmails && repliedEmails.length > 0) {
            // Mark enrollment as replied
            await supabase
              .from('sequence_enrollments')
              .update({
                status: 'replied',
                completed_at: new Date().toISOString(),
              })
              .eq('id', enrollment.id)

            // Update contact
            await supabase
              .from('contacts')
              .update({
                status: 'replied',
                replied_at: new Date().toISOString(),
              })
              .eq('id', enrollment.contact_id)

            // Add timeline entry
            await supabase.from('contact_timeline').insert({
              contact_id: enrollment.contact_id,
              event_type: 'replied',
              title: 'Réponse détectée',
              description: 'Le contact a répondu - séquence arrêtée',
              metadata: { sequence_id: enrollment.sequence_id },
            })

            totalReplies++
          }
        }
      } catch (userError) {
        console.error(`Error checking replies for user ${userSettings.user_email}:`, userError)
      }
    }

    return new Response(
      JSON.stringify({ repliesDetected: totalReplies }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('check-replies error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
