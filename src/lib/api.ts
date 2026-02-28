'use client';

const WORKSPACE_KEY = 'orianna_workspace_id';

export function getStoredWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(WORKSPACE_KEY);
}

export function setStoredWorkspaceId(id: string) {
  localStorage.setItem(WORKSPACE_KEY, id);
}

/**
 * Fetch wrapper that automatically injects the X-Workspace-Id header.
 */
export function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const workspaceId = getStoredWorkspaceId();
  const headers = new Headers(options?.headers);
  if (workspaceId) {
    headers.set('X-Workspace-Id', workspaceId);
  }
  return fetch(url, { ...options, headers });
}
