import { SupabaseClient } from '@supabase/supabase-js';

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: string;
}

/**
 * Resolve workspace context for the current user.
 * - If requestedWorkspaceId is provided, verify membership
 * - Otherwise, fall back to user's first workspace
 * - Returns null if user has no workspace (triggers onboarding)
 */
export async function getWorkspaceContext(
  supabase: SupabaseClient,
  userId: string,
  requestedWorkspaceId?: string | null
): Promise<WorkspaceContext | null> {
  if (requestedWorkspaceId) {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('workspace_id', requestedWorkspaceId)
      .eq('user_id', userId)
      .single();

    if (member) {
      return {
        workspaceId: member.workspace_id,
        userId,
        role: member.role,
      };
    }
  }

  // Fallback: user's first workspace
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
    .single();

  if (!membership) return null;

  return {
    workspaceId: membership.workspace_id,
    userId,
    role: membership.role,
  };
}
