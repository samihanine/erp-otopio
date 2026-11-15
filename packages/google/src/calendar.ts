import { gfetch, SCOPES } from "./index";

const C = "https://www.googleapis.com/calendar/v3";
export type GEvent = {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  visibility?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { email: string; displayName?: string; responseStatus?: string; self?: boolean; organizer?: boolean }[];
  organizer?: { email: string; self?: boolean };
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
  htmlLink?: string;
  updated?: string;
  recurringEventId?: string;
  iCalUID?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export const calendar = {
  list: (user: string) => gfetch<{ items: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>(user, SCOPES.calendar, `${C}/users/me/calendarList`),
  events: async (user: string, calendarId: string, params: { timeMin?: string; timeMax?: string; syncToken?: string }) => {
    const out: GEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const q = new URLSearchParams({ singleEvents: "true", maxResults: "2500", showDeleted: params.syncToken ? "true" : "false" });
      if (params.syncToken) q.set("syncToken", params.syncToken);
      else {
        if (params.timeMin) q.set("timeMin", params.timeMin);
        if (params.timeMax) q.set("timeMax", params.timeMax);
      }
      if (pageToken) q.set("pageToken", pageToken);
      const r = await gfetch<{ items: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(user, SCOPES.calendar, `${C}/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
      out.push(...r.items);
      pageToken = r.nextPageToken;
      nextSyncToken = r.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { items: out, nextSyncToken };
  },
  insert: (user: string, calendarId: string, ev: Partial<GEvent>, meet = false) =>
    gfetch<GEvent>(user, SCOPES.calendar, `${C}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all${meet ? "&conferenceDataVersion=1" : ""}`, {
      method: "POST",
      json: meet ? { ...ev, conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : ev,
    }),
  patch: (user: string, calendarId: string, id: string, ev: Partial<GEvent>) =>
    gfetch<GEvent>(user, SCOPES.calendar, `${C}/calendars/${encodeURIComponent(calendarId)}/events/${id}?sendUpdates=all`, { method: "PATCH", json: ev }),
  remove: (user: string, calendarId: string, id: string) =>
    gfetch(user, SCOPES.calendar, `${C}/calendars/${encodeURIComponent(calendarId)}/events/${id}?sendUpdates=all`, { method: "DELETE" }),
};
