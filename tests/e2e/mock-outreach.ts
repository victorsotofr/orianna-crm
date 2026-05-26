import type { Page, Route } from '@playwright/test';

type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

interface MockMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: 'running' | 'complete' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
}

interface MockEvent {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  status: 'running' | 'complete' | 'failed';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MockArtifact {
  id: string;
  kind: string;
  title: string;
  summary?: string;
  data: Record<string, unknown>;
  created_at: string;
}

interface MockSession {
  id: string;
  prompt: string;
  title: string;
  structured_brief: Record<string, unknown>;
  status: string;
  error: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  duplicated_from_session_id: string | null;
  last_message_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  messages: MockMessage[];
  events: MockEvent[];
  prospects: Array<Record<string, unknown>>;
  sequenceDraft: Record<string, unknown> | null;
}

export interface MockOutreachControls {
  failNextAgent: () => void;
  seedSession: (prompt: string) => MockSession;
}

let counter = 0;

function now() {
  return new Date(Date.now() + counter++).toISOString();
}

function id(prefix: string) {
  return `${prefix}-${counter++}`;
}

function json(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

function sse(route: Route, events: Array<{ type: string; payload: unknown }>) {
  return route.fulfill({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    headers: {
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
    body: events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`).join(''),
  });
}

function makeSession(prompt: string): MockSession {
  const timestamp = now();
  return {
    id: `thread-${counter++}`,
    prompt,
    title: prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt,
    structured_brief: {
      target: prompt,
      location: prompt.toLowerCase().includes('lyon') ? 'Lyon' : '',
      outreachAngle: 'Relevant B2B outreach',
    },
    status: 'draft',
    error: null,
    archived_at: null,
    deleted_at: null,
    duplicated_from_session_id: null,
    last_message_at: timestamp,
    metadata: {},
    created_at: timestamp,
    updated_at: timestamp,
    messages: [],
    events: [],
    prospects: [],
    sequenceDraft: null,
  };
}

function message(role: MessageRole, content: string, metadata: Record<string, unknown> = {}, status: MockMessage['status'] = 'complete'): MockMessage {
  return {
    id: id(`message-${role}`),
    role,
    content,
    status,
    metadata,
    created_at: now(),
  };
}

function event(kind: string, title: string, detail: string, status: MockEvent['status'] = 'complete', metadata: Record<string, unknown> = {}): MockEvent {
  const timestamp = now();
  return {
    id: id(`event-${kind}`),
    kind,
    title,
    detail,
    status,
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function artifact(kind: string, title: string, data: Record<string, unknown>, summary?: string): MockArtifact {
  return {
    id: id(`artifact-${kind}`),
    kind,
    title,
    summary,
    data,
    created_at: now(),
  };
}

function bundle(session: MockSession) {
  return {
    session,
    prospects: session.prospects,
    sequenceDraft: session.sequenceDraft,
    messages: session.messages,
    events: session.events,
  };
}

function prospectRows() {
  return [
    {
      id: 'prospect-1',
      first_name: 'Claire',
      last_name: 'Martin',
      company_name: 'Gestion Lyon Centre',
      company_domain: 'gestion-lyon.example',
      job_title: 'Directrice property management',
      email: null,
      email_verified_status: null,
      linkedin_url: 'https://www.linkedin.com/in/claire-martin-test',
      location: 'Lyon',
      source_url: 'https://example.com/claire',
      source_label: 'LinkedIn',
      confidence: 'high',
      reason: 'Matches role, region, and company size.',
      selected: true,
      ignored: false,
      enrichment_status: 'not_started',
      contact: null,
    },
    {
      id: 'prospect-2',
      first_name: 'Nicolas',
      last_name: 'Bernard',
      company_name: 'Regie Saone Rhone',
      company_domain: 'saone-rhone.example',
      job_title: 'Responsable gestion locative',
      email: null,
      email_verified_status: null,
      linkedin_url: 'https://www.linkedin.com/in/nicolas-bernard-test',
      location: 'Lyon',
      source_url: 'https://example.com/nicolas',
      source_label: 'Company website',
      confidence: 'medium',
      reason: 'Relevant title and local property management scope.',
      selected: true,
      ignored: false,
      enrichment_status: 'not_started',
      contact: null,
    },
  ];
}

function classify(messageText: string) {
  const lower = messageText.toLowerCase();
  if (lower.includes('zidane') || lower.includes('hadamar') || lower.includes('hadamard') || lower.includes('ça va') || lower.includes('ca va') || lower === 'hello') return 'offdomain';
  if (lower.includes('what can') || lower.includes('tu peux') || lower.includes('modèle') || lower.includes('modele') || lower.includes('model')) return 'direct';
  if (lower.includes('automation') || lower.includes('automatisation')) return 'automations';
  if (lower.includes('reply') || lower.includes('replies') || lower.includes('inbox') || lower.includes('répond')) return 'inbox';
  if (lower.includes('review') || lower.includes('blocked') || lower.includes('pipeline')) return 'pipeline';
  if (lower.includes('attention') || lower.includes('status') || lower.includes('today')) return 'status';
  if (lower.includes('find') || lower.includes('trouve') || lower.includes('property manager') || lower.includes('prospect')) return 'search';
  if (lower.includes('launch') || lower.includes('send')) return 'confirmation';
  if (lower.includes('sequence') || lower.includes('email 1')) return 'sequence';
  return 'direct';
}

export async function installMockOutreach(page: Page): Promise<MockOutreachControls> {
  const sessions = new Map<string, MockSession>();
  let failNextAgent = false;

  const controls: MockOutreachControls = {
    failNextAgent: () => {
      failNextAgent = true;
    },
    seedSession: (prompt: string) => {
      const session = makeSession(prompt);
      sessions.set(session.id, session);
      return session;
    },
  };

  controls.seedSession('Seeded active outreach');

  await page.route('**/api/outreach/activity', (route) => json(route, { events: [], sessions: [] }));
  await page.route('**/api/outreach/automations**', (route) => json(route, {
    automations: [
      {
        id: 'automation-1',
        session_id: null,
        name: 'Lyon property managers',
        prompt: 'Find property managers in Lyon every morning',
        status: 'active',
        enabled: true,
        daily_limit: 20,
        approval_required: true,
        next_run_at: new Date(Date.now() + 86_400_000).toISOString(),
        last_run_at: null,
        sequence: { id: 'seq-1', name: 'Intro sequence', status: 'active' },
      },
    ],
  }));
  await page.route('**/api/gtm/status', (route) => json(route, {
    workspace: {
      name: 'isimple',
      gtm_enabled: false,
      gtm_daily_contact_limit: 20,
      gtm_requires_approval: true,
      gtm_active_sequence_id: 'seq-1',
      gtm_last_run_status: 'paused',
    },
    metrics: {
      sourcedContacts: 20,
      addedToday: 0,
      hotSourcedLeads: 0,
      pendingReview: 20,
      readyReview: 0,
      blockedReview: 20,
      approvedReview: 0,
      queuedReview: 0,
      activeEnrollments: 0,
    },
    lastRun: null,
    sequences: [{ id: 'seq-1', name: 'Intro sequence', status: 'active' }],
  }));
  await page.route('**/api/gtm/review**', (route) => json(route, {
    counts: { total: 20, pending: 20, ready: 0, blocked: 20, approved: 0, rejected: 0, queued: 0 },
    sequence: { sequenceId: 'seq-1', sequenceName: 'Intro sequence', sequenceStatus: 'active', blocker: null },
    items: [
      {
        id: 'contact-1',
        name: 'Anne Christine Humeau',
        email: null,
        companyName: 'Foncia',
        companyDomain: 'foncia.example',
        jobTitle: 'Directrice Gestion Locative',
        linkedinUrl: 'https://www.linkedin.com/in/anne-test',
        location: 'Courbevoie / Paris',
        sourceUrl: 'https://example.com/anne',
        sourceQuery: 'property management directors France',
        icpFit: 'HOT',
        aiScore: 82,
        aiScoreLabel: 'HOT',
        aiScoreReasoning: 'Relevant senior property-management profile.',
        personalizedLine: 'Votre parcours en gestion locative couvre les principaux enjeux du secteur.',
        emailVerifiedStatus: null,
        reviewStatus: 'pending',
        sendApprovedAt: null,
        isQueued: false,
        readyForApproval: false,
        readiness: 'blocked',
        blockers: ['Email unknown'],
        warnings: [],
        preview: { subject: 'Simplifier le suivi des demandes chez Foncia', text: 'Bonjour Anne Christine,' },
        createdAt: now(),
      },
    ],
  }));

  await page.route('**/api/outreach/sessions**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split('/').filter(Boolean);
    const sessionIndex = parts.indexOf('sessions');
    const sessionId = sessionIndex >= 0 ? parts[sessionIndex + 1] : undefined;
    const action = sessionIndex >= 0 ? parts[sessionIndex + 2] : undefined;

    if (!sessionId && request.method() === 'POST') {
      const body = request.postDataJSON() as { prompt?: string };
      const session = makeSession(String(body.prompt || 'New outreach'));
      sessions.set(session.id, session);
      return json(route, { session }, 201);
    }

    if (!sessionId && request.method() === 'GET') {
      const archived = url.searchParams.get('archived');
      const deleted = url.searchParams.get('deleted');
      let rows = Array.from(sessions.values());
      if (archived === 'only') rows = rows.filter((session) => session.archived_at && !session.deleted_at);
      else if (deleted === 'only') rows = rows.filter((session) => session.deleted_at);
      else rows = rows.filter((session) => !session.archived_at && !session.deleted_at);
      return json(route, { sessions: rows });
    }

    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session) return json(route, { error: 'Outreach session not found' }, 404);

    if (!action && request.method() === 'GET') return json(route, bundle(session));

    if (!action && request.method() === 'PATCH') {
      const body = request.postDataJSON() as { title?: string; archived?: boolean; restored?: boolean };
      if (body.title) session.title = body.title;
      if (body.archived === true) session.archived_at = now();
      if (body.archived === false) session.archived_at = null;
      if (body.restored === true) session.deleted_at = null;
      session.updated_at = now();
      return json(route, { session });
    }

    if (!action && request.method() === 'DELETE') {
      session.deleted_at = now();
      session.archived_at = null;
      session.updated_at = now();
      return json(route, { session });
    }

    if (action === 'duplicate' && request.method() === 'POST') {
      const copy = makeSession(`Copy of ${session.title}`);
      copy.messages = session.messages.map((item) => ({ ...item, id: id('message-copy'), created_at: now() }));
      copy.prospects = session.prospects;
      copy.duplicated_from_session_id = session.id;
      sessions.set(copy.id, copy);
      return json(route, { session: copy });
    }

    if (action === 'agent' && request.method() === 'POST') {
      if (failNextAgent) {
        failNextAgent = false;
        return sse(route, [{ type: 'error', payload: { error: 'Mock agent failure' } }]);
      }

      const body = request.postDataJSON() as { message?: string; clientMessageId?: string; action?: string };
      const userText = String(body.message || '').trim();
      const lower = userText.toLowerCase();
      const kind = body.action || classify(userText);
      const outbound: Array<{ type: string; payload: unknown }> = [];
      const userMessage = userText
        ? message('user', userText, { clientMessageId: body.clientMessageId || null, source: 'agent' })
        : null;
      if (userMessage) {
        session.messages.push(userMessage);
        outbound.push({ type: 'message', payload: userMessage });
      }

      const routerRunning = event('agent_router', 'Routing request', 'Choosing the specialist and checking tool guardrails.', 'running');
      const routerComplete = { ...routerRunning, status: 'complete' as const, detail: `The request matches ${kind}.`, updated_at: now() };
      session.events.push(routerComplete);
      outbound.push({ type: 'event', payload: routerRunning }, { type: 'event', payload: routerComplete });

      let assistantText = 'Je peux chercher des prospects, vérifier les réponses, revoir la file outbound, préparer une séquence et gérer les automatisations.';
      if (kind === 'offdomain') {
        assistantText = 'Je suis spécialisé sur l’outreach, les prospects, les réponses, les automatisations et le CRM. Je peux lancer une recherche, vérifier l’inbox ou revoir la file outbound.';
      }
      if (kind === 'status') {
        const item = artifact('status_snapshot', 'Workspace status', {
          runningTasks: 0,
          unreadReplies: 0,
          pendingReview: 20,
          activeAutomations: 1,
        }, '0 running, 0 unread replies, 20 prospects need review.');
        session.events.push(event('status_snapshot', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'artifact', payload: item });
        assistantText = item.summary || assistantText;
      } else if (kind === 'automations') {
        const item = artifact('automation_list', 'Automations', { automations: [{ id: 'automation-1', name: 'Lyon property managers', status: 'active' }] }, '1 active automation(s), 1 total.');
        session.events.push(event('automation_list', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'artifact', payload: item });
        assistantText = item.summary || assistantText;
      } else if (kind === 'inbox') {
        const item = artifact('inbox_attention', 'Inbox attention', { threads: [{ id: 'inbox-1', subject: 'Re: Demo', unread_count: 1, snippet: 'Can we talk next week?' }] }, '1 conversation(s) need a reply.');
        session.events.push(event('inbox_attention', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'artifact', payload: item });
        assistantText = item.summary || assistantText;
      } else if (kind === 'pipeline') {
        const item = artifact('pipeline_attention', 'Pipeline attention', { pendingReview: 20, missingEmail: 20, approved: 0, activeEnrollments: 0, prospects: [] }, '20 pending, 20 missing emails, 0 active.');
        session.events.push(event('pipeline_attention', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'artifact', payload: item });
        assistantText = item.summary || assistantText;
      } else if (kind === 'search') {
        const parseEvent = event('parse_outreach_brief', 'Interpreting target', 'Reading industry, role, geography, size, and exclusions from the request.');
        const validateEvent = event('validate_search_quality', 'Validating candidates', 'Keeping only named people with role, geography, company-type fit, and usable sources.');
        const searchEvent = event('search_prospects', 'Searching prospects', 'Running Linkup, extracting named people, deduping, and saving the first list.');
        session.events.push(parseEvent, validateEvent, searchEvent);
        session.prospects = prospectRows();
        session.status = 'ready';
        const requestedLimit = Number(lower.match(/\b(\d{1,3})\b/)?.[1] || 20);
        const item = artifact('prospect_list', 'First prospect list', { prospects: session.prospects, requestedLimit, verifiedCount: session.prospects.length }, `${session.prospects.length} strict verified match(es) found out of ${requestedLimit}.`);
        session.events.push(event('prospect_list', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'event', payload: parseEvent }, { type: 'event', payload: validateEvent }, { type: 'event', payload: searchEvent }, { type: 'artifact', payload: item });
        assistantText = `I found ${session.prospects.length} strict verified match(es) out of ${requestedLimit}. I did not include weak or off-target candidates.`;
      } else if (kind === 'sequence') {
        session.sequenceDraft = {
          id: 'draft-1',
          name: 'Property manager intro',
          steps: [
            { subject: 'Simplifier votre suivi locatif', body: 'Bonjour {{first_name}},', delayDays: 0 },
            { subject: 'Suite à mon message', body: 'Bonjour {{first_name}}, je me permets de revenir vers vous.', delayDays: 3 },
            { subject: 'Dernière relance', body: 'Bonjour {{first_name}}, dernier message de ma part.', delayDays: 7 },
          ],
        };
        const item = artifact('sequence_draft', 'Sequence drafted', { draft: session.sequenceDraft }, 'The sequence draft is ready to review.');
        session.events.push(event('sequence_draft', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'artifact', payload: item });
        assistantText = item.summary || assistantText;
      } else if (kind === 'confirmation') {
        const item = artifact('confirmation_required', 'Confirmation required', { action: 'launch_sequence', reason: 'Launch can queue contacts.' }, 'Confirm before I launch sequence.');
        session.events.push(event('confirmation_required', item.title, item.summary || 'Done.', 'complete', { artifact: item }));
        outbound.push({ type: 'artifact', payload: item });
        assistantText = item.summary || assistantText;
      }

      const assistantMessage = message('assistant', assistantText, { provider: 'mock-agent', toolName: kind });
      session.messages.push(assistantMessage);
      session.last_message_at = now();
      session.updated_at = session.last_message_at;
      outbound.push({ type: 'message', payload: assistantMessage }, { type: 'bundle', payload: bundle(session) }, { type: 'done', payload: { ok: true } });
      return sse(route, outbound);
    }

    return json(route, { ok: true });
  });

  return controls;
}
