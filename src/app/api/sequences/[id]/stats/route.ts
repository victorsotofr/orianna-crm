import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get steps for this sequence
    const { data: steps } = await supabase
      .from('sequence_steps')
      .select('id, step_order, step_type, template_id, template_b_id')
      .eq('sequence_id', id)
      .order('step_order', { ascending: true });

    if (!steps || steps.length === 0) {
      return NextResponse.json({ stats: [] });
    }

    const stepIds = steps.map(s => s.id);

    // Get email stats aggregated by step and variant
    const { data: emailStats } = await supabase
      .from('email_stats')
      .select('step_id, variant, sent_at, opened_at, replied_at, bounced_at')
      .in('step_id', stepIds);

    // Aggregate stats per step
    const statsMap = new Map<string, {
      step_id: string;
      step_order: number;
      step_type: string;
      total_sent: number;
      total_opened: number;
      total_replied: number;
      total_bounced: number;
      variant_a: { sent: number; opened: number; replied: number; bounced: number };
      variant_b: { sent: number; opened: number; replied: number; bounced: number };
    }>();

    for (const step of steps) {
      statsMap.set(step.id, {
        step_id: step.id,
        step_order: step.step_order,
        step_type: step.step_type,
        total_sent: 0,
        total_opened: 0,
        total_replied: 0,
        total_bounced: 0,
        variant_a: { sent: 0, opened: 0, replied: 0, bounced: 0 },
        variant_b: { sent: 0, opened: 0, replied: 0, bounced: 0 },
      });
    }

    for (const stat of (emailStats || [])) {
      const entry = statsMap.get(stat.step_id);
      if (!entry) continue;

      entry.total_sent++;
      if (stat.opened_at) entry.total_opened++;
      if (stat.replied_at) entry.total_replied++;
      if (stat.bounced_at) entry.total_bounced++;

      const variant = stat.variant === 'B' ? entry.variant_b : entry.variant_a;
      variant.sent++;
      if (stat.opened_at) variant.opened++;
      if (stat.replied_at) variant.replied++;
      if (stat.bounced_at) variant.bounced++;
    }

    return NextResponse.json({
      stats: Array.from(statsMap.values()).sort((a, b) => a.step_order - b.step_order),
    });
  } catch (error: any) {
    console.error('Sequence stats error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch stats' }, { status: 500 });
  }
}
