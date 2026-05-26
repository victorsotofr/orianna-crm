import { describe, expect, it } from 'vitest';

import { parseOutreachSseChunk } from './stream';

describe('parseOutreachSseChunk', () => {
  it('parses message, event, artifact, bundle, and done events', () => {
    const stream = [
      'event: message',
      'data: {"id":"m1","role":"user","content":"ça va ?"}',
      '',
      'event: event',
      'data: {"id":"e1","kind":"agent_router","status":"running"}',
      '',
      'event: artifact',
      'data: {"id":"a1","kind":"status_snapshot","title":"Workspace status","data":{}}',
      '',
      'event: bundle',
      'data: {"session":{"id":"s1"},"messages":[],"events":[],"prospects":[],"sequenceDraft":null}',
      '',
      'event: done',
      'data: {"ok":true}',
      '',
    ].join('\n') + '\n';

    const result = parseOutreachSseChunk(stream);

    expect(result.buffer).toBe('');
    expect(result.events.map((event) => event.type)).toEqual(['message', 'event', 'artifact', 'bundle', 'done']);
  });

  it('keeps incomplete chunks in the buffer', () => {
    const first = parseOutreachSseChunk('event: message\ndata: {"id":"m1"');
    expect(first.events).toHaveLength(0);
    expect(first.buffer).toBe('event: message\ndata: {"id":"m1"');

    const second = parseOutreachSseChunk(`${first.buffer} }\n\n`);
    expect(second.events).toHaveLength(1);
    expect(second.events[0].type).toBe('message');
  });

  it('turns malformed JSON into an error event instead of throwing', () => {
    const result = parseOutreachSseChunk('event: message\ndata: {bad-json}\n\n');

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('error');
    expect(result.events[0].payload).toEqual({ error: 'Malformed stream payload for message' });
  });

  it('supports multi-line data payloads', () => {
    const result = parseOutreachSseChunk('event: message\ndata: {"content":\ndata: "hello"}\n\n');
    expect(result.events[0]).toEqual({ type: 'message', payload: { content: 'hello' } });
  });
});
