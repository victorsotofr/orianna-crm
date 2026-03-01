import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Extract contact result from webhook payload
    const email = payload.email || null;
    const phone = payload.phone || null;
    const emailStatus = payload.email_status || null;
    const custom = payload.custom || {};

    const contactId = custom.contact_id;
    const workspaceId = custom.workspace_id;

    if (!contactId || !workspaceId) {
      return NextResponse.json({ error: 'Missing custom.contact_id or custom.workspace_id' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Fetch existing contact
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('id, email, phone, email_verified_status')
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .single();

    if (fetchError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Build update object
    const update: Record<string, unknown> = {
      email_verified_status: emailStatus,
      enriched_at: new Date().toISOString(),
      enrichment_source: 'fullenrich',
    };

    // Update email if FullEnrich found one:
    // - Always overwrite if contact had no email
    // - Always overwrite if existing email was never verified (e.g. from AI prospecting)
    // - Always overwrite if FullEnrich says DELIVERABLE
    if (email) {
      const existingUnverified = !contact.email_verified_status;
      if (!contact.email || existingUnverified || emailStatus === 'DELIVERABLE') {
        update.email = email;
      }
    }

    // Update phone if found and contact had none
    if (phone && !contact.phone) {
      update.phone = phone;
    }

    await supabase
      .from('contacts')
      .update(update)
      .eq('id', contactId);

    // Create timeline entry
    const timelineDescription = [
      email ? `Email: ${email} (${emailStatus || 'unknown'})` : null,
      phone ? `Phone: ${phone}` : null,
    ].filter(Boolean).join(', ');

    await supabase.from('contact_timeline').insert({
      contact_id: contactId,
      event_type: 'enriched',
      title: 'Contact enrichi via FullEnrich',
      description: timelineDescription || 'Aucune donnée trouvée',
      workspace_id: workspaceId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('FullEnrich webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
