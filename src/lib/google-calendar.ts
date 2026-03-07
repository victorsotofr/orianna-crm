import 'server-only';

import { getGoogleCalendarAccessTokenForUser } from '@/lib/google-oauth';

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  timeZone?: string;
  accessRole?: string;
}

export interface GoogleCalendarEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleCalendarEventAttendee {
  email?: string;
  displayName?: string;
  responseStatus?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start: GoogleCalendarEventDateTime;
  end: GoogleCalendarEventDateTime;
  attendees?: GoogleCalendarEventAttendee[];
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
    }>;
  };
}

export interface GoogleCalendarFreeBusyResponse {
  kind: string;
  timeMin: string;
  timeMax: string;
  calendars: Record<
    string,
    {
      busy: Array<{
        start: string;
        end: string;
      }>;
    }
  >;
}

async function googleCalendarFetch<T>(
  accessToken: string,
  path: string,
  {
    method = 'GET',
    query,
    body,
  }: {
    method?: 'GET' | 'POST' | 'DELETE';
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {}
): Promise<T> {
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      data?.error ||
      `Google Calendar request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function extractMeetUrl(event: GoogleCalendarEvent) {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video');
  return videoEntry?.uri || null;
}

export async function fetchGoogleCalendarPrimaryCalendar(accessToken: string) {
  return googleCalendarFetch<GoogleCalendarListItem>(accessToken, '/users/me/calendarList/primary');
}

export async function listGoogleCalendars(userId: string) {
  const { accessToken } = await getGoogleCalendarAccessTokenForUser(userId);
  const response = await googleCalendarFetch<{ items?: GoogleCalendarListItem[] }>(accessToken, '/users/me/calendarList');
  return response.items || [];
}

export async function listGoogleCalendarEvents(
  userId: string,
  input: {
    calendarId?: string;
    q?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  } = {}
) {
  const { accessToken, connection } = await getGoogleCalendarAccessTokenForUser(userId);
  const calendarId = input.calendarId || connection.google_calendar_default_calendar_id || 'primary';

  const response = await googleCalendarFetch<{ items?: GoogleCalendarEvent[] }>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    query: {
      singleEvents: 'true',
      orderBy: 'startTime',
      q: input.q,
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      maxResults: input.maxResults || 20,
    },
  });

  return (response.items || []).map((event) => ({
    ...event,
    meetUrl: extractMeetUrl(event),
  }));
}

export async function queryGoogleCalendarFreeBusy(
  userId: string,
  input: {
    timeMin: string;
    timeMax: string;
    timeZone?: string;
    calendarIds?: string[];
  }
) {
  const { accessToken, connection } = await getGoogleCalendarAccessTokenForUser(userId);
  const calendarIds = input.calendarIds?.length
    ? input.calendarIds
    : [connection.google_calendar_default_calendar_id || 'primary'];

  return googleCalendarFetch<GoogleCalendarFreeBusyResponse>(accessToken, '/freeBusy', {
    method: 'POST',
    body: {
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      timeZone: input.timeZone || connection.google_calendar_default_timezone || 'UTC',
      items: calendarIds.map((id) => ({ id })),
    },
  });
}

export async function createGoogleCalendarEvent(
  userId: string,
  input: {
    calendarId?: string;
    summary: string;
    description?: string;
    start: string;
    end: string;
    timeZone?: string;
    attendees?: string[];
    createMeet?: boolean;
    sendUpdates?: 'all' | 'externalOnly' | 'none';
    metadata?: Record<string, string>;
  }
) {
  const { accessToken, connection } = await getGoogleCalendarAccessTokenForUser(userId);
  const calendarId = input.calendarId || connection.google_calendar_default_calendar_id || 'primary';
  const timeZone = input.timeZone || connection.google_calendar_default_timezone || 'UTC';

  const event = await googleCalendarFetch<GoogleCalendarEvent>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    query: {
      conferenceDataVersion: input.createMeet ? 1 : undefined,
      sendUpdates: input.sendUpdates || 'none',
    },
    body: {
      summary: input.summary,
      description: input.description || undefined,
      start: {
        dateTime: input.start,
        timeZone,
      },
      end: {
        dateTime: input.end,
        timeZone,
      },
      attendees: (input.attendees || []).map((email) => ({ email })),
      conferenceData: input.createMeet
        ? {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: {
                type: 'hangoutsMeet',
              },
            },
          }
        : undefined,
      extendedProperties: input.metadata
        ? {
            private: input.metadata,
          }
        : undefined,
    },
  });

  return {
    ...event,
    calendarId,
    meetUrl: extractMeetUrl(event),
  };
}

export async function deleteGoogleCalendarEvent(
  userId: string,
  input: {
    eventId: string;
    calendarId?: string;
    sendUpdates?: 'all' | 'externalOnly' | 'none';
  }
) {
  const { accessToken, connection } = await getGoogleCalendarAccessTokenForUser(userId);
  const calendarId = input.calendarId || connection.google_calendar_default_calendar_id || 'primary';

  await googleCalendarFetch<void>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.eventId)}`, {
    method: 'DELETE',
    query: {
      sendUpdates: input.sendUpdates || 'none',
    },
  });

  return { success: true, calendarId, eventId: input.eventId };
}
