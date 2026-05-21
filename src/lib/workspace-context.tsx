'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '@/lib/api';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceMember {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  members: WorkspaceMember[];
  switchWorkspace: (id: string) => void;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaces: [],
  members: [],
  switchWorkspace: () => {},
  isLoading: true,
  refresh: async () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

export function WorkspaceProvider({
  userId,
  children,
  onNoWorkspace,
}: {
  userId: string;
  children: React.ReactNode;
  onNoWorkspace?: () => void;
}) {
  const supabase = createClient();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadWorkspaces = useCallback(async () => {
    // Get all workspaces user belongs to
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      setIsLoading(false);
      onNoWorkspace?.();
      return;
    }

    const wsIds = memberships.map((m: { workspace_id: string }) => m.workspace_id);
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id, name, slug')
      .in('id', wsIds) as { data: Workspace[] | null };

    if (!ws || ws.length === 0) {
      setIsLoading(false);
      onNoWorkspace?.();
      return;
    }

    setWorkspaces(ws);

    // Determine active workspace
    const storedId = getStoredWorkspaceId();
    const active = ws.find((w: Workspace) => w.id === storedId) || ws[0];
    setWorkspace(active);
    setStoredWorkspaceId(active.id);

    // Load members for active workspace
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('id, user_id, email, display_name, role')
      .eq('workspace_id', active.id) as { data: WorkspaceMember[] | null };

    setMembers(memberData || []);
    setIsLoading(false);
  }, [userId, supabase, onNoWorkspace]);

  useEffect(() => {
    loadWorkspaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const switchWorkspace = useCallback(
    (id: string) => {
      const ws = workspaces.find((w) => w.id === id);
      if (!ws) return;
      setWorkspace(ws);
      setStoredWorkspaceId(ws.id);

      // Reload members for new workspace
      supabase
        .from('workspace_members')
        .select('id, user_id, email, display_name, role')
        .eq('workspace_id', id)
        .then(({ data }: { data: WorkspaceMember[] | null }) => {
          setMembers(data || []);
        });

      // Reload the page to refresh all data with new workspace context
      window.location.reload();
    },
    [workspaces, supabase]
  );

  return (
    <WorkspaceContext.Provider
      value={{ workspace, workspaces, members, switchWorkspace, isLoading, refresh: loadWorkspaces }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
