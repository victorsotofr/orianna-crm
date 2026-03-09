import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

// GET /api/sequences/[id] - Get single sequence with steps, templates, and contact progress
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    // Fetch sequence with steps
    const { data: sequenceData, error } = await supabase
      .from('campaign_sequences')
      .select(`
        *,
        steps:campaign_sequence_steps(
          id,
          template_id,
          step_order,
          delay_days
        )
      `)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (error || !sequenceData) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Sort steps by step_order
    const sortedSteps = sequenceData.steps?.sort((a: any, b: any) => a.step_order - b.step_order) || [];

    // Fetch all templates used in the sequence
    const templateIds = sortedSteps.map((step: any) => step.template_id);
    const templatesMap: Record<string, any> = {};

    if (templateIds.length > 0) {
      const { data: templates } = await supabase
        .from('templates')
        .select('id, name, subject')
        .in('id', templateIds)
        .eq('workspace_id', ctx.workspaceId);

      if (templates) {
        templates.forEach(tmpl => {
          templatesMap[tmpl.id] = tmpl;
        });
      }
    }

    // Fetch email send stats for each step
    const stepStatsMap: Record<string, { sent: number; scheduled: number; nextSendDate: string | null }> = {};

    for (const step of sortedSteps) {
      // Count emails already sent for this step
      const { count: sentCount } = await supabase
        .from('emails_sent')
        .select('*', { count: 'exact', head: true })
        .eq('step_id', step.id)
        .eq('workspace_id', ctx.workspaceId);

      // Count enrollments scheduled for this step or later
      const { data: scheduledEnrollments } = await supabase
        .from('campaign_enrollments')
        .select('next_send_at, current_step_id')
        .eq('sequence_id', id)
        .eq('workspace_id', ctx.workspaceId)
        .eq('status', 'active');

      // Find the earliest scheduled send date for this step
      let scheduledCount = 0;
      let earliestDate: string | null = null;

      if (scheduledEnrollments) {
        for (const enrollment of scheduledEnrollments) {
          const enrollmentStepIndex = sortedSteps.findIndex((s: any) => s.id === enrollment.current_step_id);
          const currentStepIndex = sortedSteps.findIndex((s: any) => s.id === step.id);

          // Count if this step is the current step (exact match)
          if (enrollmentStepIndex === currentStepIndex && enrollment.next_send_at) {
            scheduledCount++;
            if (!earliestDate || enrollment.next_send_at < earliestDate) {
              earliestDate = enrollment.next_send_at;
            }
          }
        }
      }

      stepStatsMap[step.id] = {
        sent: sentCount || 0,
        scheduled: scheduledCount,
        nextSendDate: earliestDate,
      };
    }

    // Fetch contact progress (enrollments)
    const { data: enrollments, error: enrollmentsError } = await supabase
      .from('campaign_enrollments')
      .select(`
        contact_id,
        current_step_id,
        next_send_at,
        status,
        completed_at,
        enrolled_at,
        contact:contacts(
          first_name,
          last_name,
          email,
          company_name
        )
      `)
      .eq('sequence_id', id)
      .eq('workspace_id', ctx.workspaceId)
      .order('enrolled_at', { ascending: false });

    if (enrollmentsError) {
      console.error('[Sequence] Error fetching enrollments:', enrollmentsError);
    }

    console.log(`[Sequence ${id}] Raw enrollments data:`, JSON.stringify(enrollments, null, 2));

    // Map enrollments to contact progress format
    const contactProgress = (enrollments || [])
      .filter((enrollment: any) => enrollment.contact) // Filter out enrollments with deleted contacts
      .map((enrollment: any) => {
        // Find current step number
        const currentStepIndex = sortedSteps.findIndex((step: any) => step.id === enrollment.current_step_id);
        const currentStep = currentStepIndex >= 0 ? currentStepIndex : 0;

        return {
          contact_id: enrollment.contact_id,
          current_step: currentStep,
          next_send_date: enrollment.next_send_at,
          is_paused: enrollment.status === 'paused',
          is_completed: enrollment.status === 'completed',
          created_at: enrollment.enrolled_at,
          contact: enrollment.contact,
        };
      });

    // Count total contacts enrolled
    const contactCount = enrollments?.length || 0;

    console.log(`[Sequence ${id}] Found ${contactCount} enrollments for workspace ${ctx.workspaceId}`);
    console.log('[Sequence] Contact progress:', contactProgress.length);

    // Transform to match expected format
    const campaign = {
      id: sequenceData.id,
      workspace_id: sequenceData.workspace_id,
      name: sequenceData.name,
      description: null,
      created_at: sequenceData.created_at,
      created_by: sequenceData.created_by,
      is_sequence: true,
      is_active: sequenceData.status === 'active',
      contact_count: contactCount,
    };

    const sequence = {
      steps: sortedSteps.map((step: any) => ({
        ...step,
        stats: stepStatsMap[step.id] || { sent: 0, scheduled: 0, nextSendDate: null },
      })),
      is_active: sequenceData.status === 'active',
      created_at: sequenceData.created_at,
      updated_at: sequenceData.updated_at,
    };

    return NextResponse.json({
      campaign,
      sequence,
      templates: templatesMap,
      contactProgress,
    });
  } catch (error: any) {
    console.error('Sequence fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sequence' },
      { status: 500 }
    );
  }
}

// PATCH /api/sequences/[id] - Update sequence metadata
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    const body = await request.json();
    const { name, template_variables, status } = body;

    // Verify sequence exists and belongs to workspace
    const { data: existingSequence, error: fetchError } = await supabase
      .from('campaign_sequences')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (fetchError || !existingSequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Build update object with only provided fields
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (template_variables !== undefined) updates.template_variables = template_variables;
    if (status !== undefined) {
      const validStatuses = ['draft', 'active', 'paused', 'archived'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    // Update sequence
    const { data: sequence, error: updateError } = await supabase
      .from('campaign_sequences')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .select(`
        *,
        steps:campaign_sequence_steps(
          id,
          template_id,
          step_order,
          delay_days,
          template:templates(id, name, subject)
        )
      `)
      .single();

    if (updateError) {
      throw updateError;
    }

    // Sort steps by step_order
    const sequenceWithSortedSteps = {
      ...sequence,
      steps: sequence.steps?.sort((a: any, b: any) => a.step_order - b.step_order) || [],
    };

    return NextResponse.json({ sequence: sequenceWithSortedSteps });
  } catch (error: any) {
    console.error('Sequence update error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to update sequence' },
      { status: 500 }
    );
  }
}

// DELETE /api/sequences/[id] - Delete sequence and all steps
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { supabase, error: clientError } = await createServerClient();
    if (!supabase || clientError) {
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = request.headers.get('x-workspace-id');
    const ctx = await getWorkspaceContext(supabase, user.id, wsId);
    if (!ctx) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

    // Verify sequence exists and belongs to workspace
    const { data: sequence, error: fetchError } = await supabase
      .from('campaign_sequences')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId)
      .single();

    if (fetchError || !sequence) {
      return NextResponse.json({ error: 'Sequence not found' }, { status: 404 });
    }

    // Delete sequence (cascade will delete steps and enrollments)
    const { error: deleteError } = await supabase
      .from('campaign_sequences')
      .delete()
      .eq('id', id)
      .eq('workspace_id', ctx.workspaceId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Sequence deletion error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete sequence' },
      { status: 500 }
    );
  }
}
