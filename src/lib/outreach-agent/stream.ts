export interface OutreachStreamEvent {
  type: string;
  payload: unknown;
}

export interface OutreachStreamParseResult {
  events: OutreachStreamEvent[];
  buffer: string;
}

export function parseOutreachSseChunk(input: string): OutreachStreamParseResult {
  let buffer = input;
  const events: OutreachStreamEvent[] = [];
  let boundary = buffer.indexOf('\n\n');

  while (boundary >= 0) {
    const raw = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    boundary = buffer.indexOf('\n\n');

    const lines = raw.split('\n');
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLines = lines.filter((line) => line.startsWith('data: '));
    if (!eventLine || dataLines.length === 0) continue;

    const type = eventLine.slice(7).trim();
    const data = dataLines.map((line) => line.slice(6)).join('\n');

    try {
      events.push({ type, payload: JSON.parse(data) });
    } catch {
      events.push({ type: 'error', payload: { error: `Malformed stream payload for ${type}` } });
    }
  }

  return { events, buffer };
}
