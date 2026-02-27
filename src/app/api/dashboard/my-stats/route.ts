import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // My contacts
    const { count: myContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', user.id);

    // My emails today
    const { count: myEmailsToday } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true })
      .eq('sent_by', user.id)
      .gte('sent_at', today.toISOString());

    // My total emails
    const { count: myTotalEmails } = await supabase
      .from('emails_sent')
      .select('*', { count: 'exact', head: true })
      .eq('sent_by', user.id);

    // My replied contacts
    const { count: myReplies } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', user.id)
      .eq('status', 'replied');

    // My contacted contacts (any status except 'new')
    const { count: myContactedContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_to', user.id)
      .neq('status', 'new');

    // My active enrollments (sequences I created)
    const { data: mySequences } = await supabase
      .from('sequences')
      .select('id')
      .eq('created_by', user.id);

    let myActiveEnrollments = 0;
    if (mySequences && mySequences.length > 0) {
      const seqIds = mySequences.map(s => s.id);
      const { count } = await supabase
        .from('sequence_enrollments')
        .select('*', { count: 'exact', head: true })
        .in('sequence_id', seqIds)
        .eq('status', 'active');
      myActiveEnrollments = count || 0;
    }

    // My recent sends
    const { data: myRecentSends } = await supabase
      .from('emails_sent')
      .select(`
        id, contact_id, sent_at, status, sent_by_email,
        contacts (id, email, first_name, last_name, company_name, status),
        templates (id, name)
      `)
      .eq('sent_by', user.id)
      .order('sent_at', { ascending: false })
      .limit(20);

    const myReplyRate = myContactedContacts && myContactedContacts > 0
      ? Math.round(((myReplies || 0) / myContactedContacts) * 100)
      : 0;

    return NextResponse.json({
      myContacts: myContacts || 0,
      myEmailsToday: myEmailsToday || 0,
      myTotalEmails: myTotalEmails || 0,
      myReplyRate,
      myActiveEnrollments,
      myRecentSends: myRecentSends || [],
    });
  } catch (error: any) {
    console.error('My stats error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch my stats' }, { status: 500 });
  }
}
