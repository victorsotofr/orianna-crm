// Supabase Edge Function: process-sequences
// Runs every 5 minutes via pg_cron to process active sequence enrollments
// Sends emails for auto steps, flags manual steps for review

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TRACKING_SECRET = Deno.env.get('TRACKING_SECRET') || 'orianna-tracking-secret'

async function generateTrackingHmac(statId: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(TRACKING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(statId))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
}

async function injectTrackingPixel(html: string, statId: string, appUrl: string): Promise<string> {
  const hmac = await generateTrackingHmac(statId)
  const pixelUrl = `${appUrl}/api/track/open?id=${statId}&h=${hmac}`
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`
  // Insert before closing body tag, or append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`)
  }
  return html + pixel
}

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

    // Find enrollments ready for next action
    const { data: pending, error: fetchError } = await supabase
      .from('sequence_enrollments')
      .select('*, contacts(*), sequences(*)')
      .eq('status', 'active')
      .lte('next_action_at', new Date().toISOString())
      .limit(50)

    if (fetchError) {
      throw fetchError
    }

    let processed = 0
    let errors = 0

    for (const enrollment of pending || []) {
      try {
        // Get the next step (current_step_order + 1)
        const nextStepOrder = enrollment.current_step_order + 1

        const { data: step } = await supabase
          .from('sequence_steps')
          .select('*, templates(*)')
          .eq('sequence_id', enrollment.sequence_id)
          .eq('step_order', nextStepOrder)
          .single()

        if (!step) {
          // No more steps — complete enrollment
          await supabase
            .from('sequence_enrollments')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', enrollment.id)

          // Add timeline entry
          await supabase.from('contact_timeline').insert({
            contact_id: enrollment.contact_id,
            event_type: 'completed',
            title: 'Séquence terminée',
            metadata: { sequence_id: enrollment.sequence_id },
          })

          processed++
          continue
        }

        if (step.step_type === 'email' && step.templates) {
          // Get user settings for the sequence creator
          const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', enrollment.sequences?.created_by)
            .single()

          if (!settings || !settings.smtp_password_encrypted) {
            console.error(`No SMTP settings for user ${enrollment.sequences?.created_by}`)
            errors++
            continue
          }

          // A/B variant selection
          let selectedTemplate = step.templates
          let variant: 'A' | 'B' = 'A'

          if (step.template_b_id && step.ab_split_pct != null) {
            const rand = Math.random() * 100
            if (rand >= step.ab_split_pct) {
              variant = 'B'
              // Fetch template B
              const { data: templateB } = await supabase
                .from('templates')
                .select('*')
                .eq('id', step.template_b_id)
                .single()
              if (templateB) selectedTemplate = templateB
            }
          }

          // Insert email_stats record
          const appUrl = Deno.env.get('APP_URL') || `https://${Deno.env.get('VERCEL_URL') || 'localhost:3000'}`
          const { data: emailStat } = await supabase
            .from('email_stats')
            .insert({
              enrollment_id: enrollment.id,
              step_id: step.id,
              contact_id: enrollment.contact_id,
              template_id: selectedTemplate.id,
              variant,
            })
            .select('id')
            .single()

          // Call send email function via Next.js API route
          const sendRes = await fetch(`${appUrl}/api/sequences/send-email`, {
            method: 'POST',
            headers: {
              'x-service-key': serviceRoleKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              enrollment_id: enrollment.id,
              contact: enrollment.contacts,
              template: selectedTemplate,
              user_settings: settings,
              sequence_id: enrollment.sequence_id,
              step_order: nextStepOrder,
              variant,
              // Inject tracking pixel into HTML content
              html_override: emailStat?.id
                ? await injectTrackingPixel(selectedTemplate.html_content, emailStat.id, appUrl)
                : undefined,
            }),
          }).catch(() => null)

          // Calculate next action time
          const { data: nextStepAfter } = await supabase
            .from('sequence_steps')
            .select('delay_days')
            .eq('sequence_id', enrollment.sequence_id)
            .eq('step_order', nextStepOrder + 1)
            .single()

          const nextActionAt = nextStepAfter
            ? new Date(Date.now() + (nextStepAfter.delay_days || 0) * 24 * 60 * 60 * 1000)
            : null

          await supabase
            .from('sequence_enrollments')
            .update({
              current_step_order: nextStepOrder,
              next_action_at: nextActionAt?.toISOString() || null,
              ...(nextActionAt ? {} : { status: 'completed', completed_at: new Date().toISOString() }),
            })
            .eq('id', enrollment.id)

          // Update contact last_contacted_at
          await supabase
            .from('contacts')
            .update({ last_contacted_at: new Date().toISOString(), status: 'contacted' })
            .eq('id', enrollment.contact_id)

          // Add timeline entry
          await supabase.from('contact_timeline').insert({
            contact_id: enrollment.contact_id,
            event_type: 'email_sent',
            title: `Email envoyé: ${selectedTemplate.name}${variant === 'B' ? ' (B)' : ''}`,
            metadata: {
              sequence_id: enrollment.sequence_id,
              step_order: nextStepOrder,
              template_id: selectedTemplate.id,
              variant,
              email_stat_id: emailStat?.id,
            },
            created_by: enrollment.sequences?.created_by,
          })

          processed++
        } else if (step.step_type === 'manual_task') {
          // Manual step — just flag it, don't advance
          // The user needs to manually complete this step via the UI
          // We don't auto-advance manual steps
          console.log(`Enrollment ${enrollment.id} waiting on manual step ${nextStepOrder}`)
          processed++
        } else if (step.step_type === 'wait') {
          // Wait step — auto-advance
          const { data: nextStepAfter } = await supabase
            .from('sequence_steps')
            .select('delay_days')
            .eq('sequence_id', enrollment.sequence_id)
            .eq('step_order', nextStepOrder + 1)
            .single()

          const nextActionAt = nextStepAfter
            ? new Date(Date.now() + (nextStepAfter.delay_days || 0) * 24 * 60 * 60 * 1000)
            : null

          await supabase
            .from('sequence_enrollments')
            .update({
              current_step_order: nextStepOrder,
              next_action_at: nextActionAt?.toISOString() || null,
              ...(nextActionAt ? {} : { status: 'completed', completed_at: new Date().toISOString() }),
            })
            .eq('id', enrollment.id)

          processed++
        }
      } catch (error) {
        console.error(`Failed to process enrollment ${enrollment.id}:`, error)
        errors++
      }
    }

    return new Response(
      JSON.stringify({ processed, errors, pending: pending?.length || 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('process-sequences error:', error)
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
