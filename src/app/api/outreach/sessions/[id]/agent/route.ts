import { NextRequest } from 'next/server';

import { runOutreachAgentGraph, type AgentRuntimeBody } from '@/lib/outreach-agent/runtime';
import { appendOutreachMessage } from '@/lib/outreach';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export const maxDuration = 300;

function sse(type: string, payload: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function localThreadMessage(input: {
  workspaceId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  status?: 'running' | 'complete' | 'failed';
  metadata?: Record<string, unknown>;
}) {
  return {
    id: `local-${input.role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    workspace_id: input.workspaceId,
    session_id: input.sessionId,
    role: input.role,
    content: input.content,
    status: input.status || 'complete',
    metadata: input.metadata || {},
    created_at: new Date().toISOString(),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const encoder = new TextEncoder();

  return new Response(new ReadableStream({
    async start(controller) {
      const send = (type: string, payload: unknown) => {
        controller.enqueue(encoder.encode(sse(type, payload)));
      };

      try {
        const { id } = await params;
        const { supabase, error: clientError } = await createServerClient();
        if (!supabase || clientError) throw new Error('Unauthorized');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Unauthorized');

        const wsId = request.headers.get('x-workspace-id');
        const ctx = await getWorkspaceContext(supabase, user.id, wsId);
        if (!ctx) throw new Error('No workspace');

        const body = await request.json().catch(() => ({})) as AgentRuntimeBody;
        const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';

        if (cleanMessage && !body.skipUserMessage) {
          const userMessage = await appendOutreachMessage(supabase, {
            workspaceId: ctx.workspaceId,
            sessionId: id,
            role: 'user',
            content: cleanMessage,
            metadata: { source: 'agent', clientMessageId: body.clientMessageId || null },
          });
          send('message', userMessage || localThreadMessage({
            workspaceId: ctx.workspaceId,
            sessionId: id,
            role: 'user',
            content: cleanMessage,
            metadata: { source: 'agent', clientMessageId: body.clientMessageId || null, persisted: false },
          }));
        }

        await runOutreachAgentGraph({
          db: supabase,
          workspaceId: ctx.workspaceId,
          userId: user.id,
          sessionId: id,
          requestUrl: request.url,
          cookie: request.headers.get('cookie') || '',
          workspaceHeader: wsId || ctx.workspaceId,
          body,
          emit: send,
        });

        send('done', { ok: true });
      } catch (error) {
        send('error', { error: error instanceof Error ? error.message : 'Agent failed' });
      } finally {
        controller.close();
      }
    },
  }), {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
