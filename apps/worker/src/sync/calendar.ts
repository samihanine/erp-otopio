/**
 * Google Calendar ↔ ERP `event` table (incremental with sync tokens),
 * and past meetings with external attendees → CRM communications.
 */
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { calendar, GoogleError, type GEvent } from "@erp/google";
import { directory, getState, log, MEMBERS, setState } from "./common";

const meetLink = (e: GEvent) =>
  e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? (e.description ?? e.location ?? "").match(/https:\/\/(teams\.microsoft\.com|[\w.]*zoom\.us)\/[^\s"<>]+/)?.[0] ?? null;

const DAYS: Record<string, string> = { MO: "lun.", TU: "mar.", WE: "mer.", TH: "jeu.", FR: "ven.", SA: "sam.", SU: "dim." };
/** RRULE → short French text ("Chaque semaine (lun., mer.)", "Chaque mois", …). */
export function humanRecurrence(rules?: string[]) {
  const r = rules?.find((x) => x.startsWith("RRULE:"));
  if (!r) return null;
  const p = Object.fromEntries(r.slice(6).split(";").map((kv) => kv.split("=") as [string, string]));
  const every = Number(p.INTERVAL ?? 1);
  const unit = { DAILY: ["jour", "jours"], WEEKLY: ["semaine", "semaines"], MONTHLY: ["mois", "mois"], YEARLY: ["an", "ans"] }[p.FREQ as string] ?? ["fois", "fois"];
  let txt = every > 1 ? `Toutes les ${every} ${unit[1]}` : `Chaque ${unit[0]}`;
  if (p.BYDAY) txt += ` (${p.BYDAY.split(",").map((d: string) => DAYS[d.slice(-2)] ?? d).join(", ")})`;
  if (p.UNTIL) txt += ` jusqu'au ${p.UNTIL.slice(6, 8)}/${p.UNTIL.slice(4, 6)}/${p.UNTIL.slice(0, 4)}`;
  if (p.COUNT) txt += ` · ${p.COUNT} fois`;
  return txt;
}

/** Event kind used by the calendar list filter. */
function kindOf(e: GEvent, priv: boolean, ext: string[]) {
  if (priv) return "personal";
  if (e.start.date) return "all_day";
  const t = `${e.summary ?? ""} ${e.location ?? ""}`.toLowerCase();
  if (/vol |flight|train|aéroport|airport|✈/.test(t)) return "travel";
  if (/deadline|échéance|rendu|due/.test(t)) return "deadline";
  if (meetLink(e) || ext.length) return "meeting";
  if (/appel|call|tel|téléphone/.test(t)) return "call";
  return "other";
}

export async function syncCalendars() {
  const seriesCache = new Map<string, string | null>();
  const dir = await directory();
  const stats: Record<string, number> = {};
  for (const owner of MEMBERS) {
    const key = `calendar:${owner}:syncToken`;
    const token = await getState(key);
    let res;
    try {
      res = token
        ? await calendar.events(owner, "primary", { syncToken: token })
        : await calendar.events(owner, "primary", { timeMin: new Date(Date.now() - 365 * 864e5).toISOString(), timeMax: new Date(Date.now() + 365 * 864e5).toISOString() });
    } catch (e) {
      if (e instanceof GoogleError && e.status === 410) {
        await setState(key, "");
        continue;
      }
      console.warn("[calendar]", owner, (e as Error).message.slice(0, 120));
      continue;
    }
    let n = 0;
    for (const e of res.items) {
      if (e.status === "cancelled") {
        await db.delete(schema.event).where(and(eq(schema.event.calendarOwner, owner), eq(schema.event.googleEventId, e.id)));
        continue;
      }
      const start = e.start.dateTime ?? (e.start.date ? `${e.start.date}T00:00:00Z` : null);
      const end = e.end.dateTime ?? (e.end.date ? `${e.end.date}T00:00:00Z` : start);
      if (!start) continue;
      const priv = e.visibility === "private" || e.visibility === "confidential";
      const attendees = (e.attendees ?? []).map((a) => a.email.toLowerCase()).filter((x) => !x.includes("resource.calendar"));
      const m = dir.match(attendees.filter((a) => !a.endsWith("@otopio.ca")));
      const values = {
        title: priv ? "Occupé" : (e.summary ?? "(sans titre)"),
        description: priv ? null : (e.description ?? null),
        location: priv ? null : (e.location ?? null),
        startAt: new Date(start),
        endAt: new Date(end!),
        allDay: Boolean(e.start.date),
        isPrivate: priv,
        status: e.status,
        meetUrl: priv ? null : meetLink(e),
        calendarOwner: owner,
        organizer: e.organizer?.email ?? null,
        attendees: priv ? [] : attendees,
        organizationId: priv ? null : (m.org?.id ?? null),
        personId: priv ? null : (m.person?.id ?? null),
        projectId: priv ? null : (m.project?.id ?? null),
        googleEventId: e.id,
        htmlLink: e.htmlLink ?? null,
        seriesId: e.recurringEventId ?? null,
        recurrence: null as string | null,
        kind: kindOf(e, priv, attendees.filter((x) => !x.endsWith("@otopio.ca"))),
      };
      if (e.recurringEventId) {
        const k = `${owner}:${e.recurringEventId}`;
        if (!seriesCache.has(k)) {
          const master = await calendar.get(owner, "primary", e.recurringEventId).catch(() => null);
          seriesCache.set(k, humanRecurrence(master?.recurrence));
        }
        values.recurrence = seriesCache.get(k) ?? "Série";
      }
      await db
        .insert(schema.event)
        .values(values)
        .onConflictDoUpdate({ target: [schema.event.calendarOwner, schema.event.googleEventId], set: { ...values, updatedAt: new Date() } });
      n++;
    }
    if (res.nextSyncToken) await setState(key, res.nextSyncToken);
    stats[owner] = n;
  }
  stats.meetings = await meetingsToCommunications();
  return stats;
}

/** Past meetings with at least one external attendee become communications (once per meeting). */
export async function meetingsToCommunications() {
  const rows = await db
    .select()
    .from(schema.event)
    .where(and(lt(schema.event.endAt, new Date()), eq(schema.event.isPrivate, false), sql`cardinality(${schema.event.attendees}) > 0`, sql`${schema.event.startAt} > now() - interval '120 days'`));
  let created = 0;
  for (const e of rows) {
    const ext = e.attendees.filter((a) => !a.endsWith("@otopio.ca"));
    if (!ext.length) continue;
    const externalId = `event:${e.googleEventId}`;
    const [exists] = await db.select({ id: schema.communication.id }).from(schema.communication).where(eq(schema.communication.externalId, externalId));
    if (exists) continue;
    // Already logged from the invitation email? → just link it to the event
    const [twin] = await db
      .select({ id: schema.communication.id })
      .from(schema.communication)
      .where(
        and(
          sql`${schema.communication.type} in ('google_meet','teams','zoom','other','in_person')`,
          sql`lower(${schema.communication.subject}) = lower(${e.title})`,
          sql`abs(extract(epoch from (${schema.communication.occurredAt} - ${e.startAt.toISOString()}::timestamptz))) < 864000`,
          isNull(schema.communication.eventId),
        ),
      )
      .limit(1);
    if (twin) {
      await db.update(schema.communication).set({ eventId: e.id, occurredAt: e.startAt, durationMinutes: Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60000), externalId: externalId }).where(eq(schema.communication.id, twin.id)).catch(() => {});
      continue;
    }
    const type = /meet\.google/.test(e.meetUrl ?? "") ? "google_meet" : /teams/.test(e.meetUrl ?? "") ? "teams" : /zoom/.test(e.meetUrl ?? "") ? "zoom" : e.location ? "in_person" : "other";
    const [c] = await db
      .insert(schema.communication)
      .values({
        subject: e.title,
        type: type as never,
        direction: "outbound",
        occurredAt: e.startAt,
        durationMinutes: Math.round((e.endAt.getTime() - e.startAt.getTime()) / 60000),
        personId: e.personId,
        organizationId: e.organizationId,
        projectId: e.projectId,
        participants: ext,
        mailbox: e.calendarOwner,
        meetingUrl: e.meetUrl,
        sourceUrl: e.htmlLink,
        externalId,
        eventId: e.id,
        summary: e.description?.slice(0, 1500) ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.communication.id });
    if (c) {
      created++;
      await log("meeting-logged", "communication", c.id, `Réunion « ${e.title} » ajoutée aux communications`, { deleteRecord: { table: "communication", id: c.id } });
    }
  }
  return created;
}

/** Creates the Google event (with Meet link) for an event created in the ERP. */
export async function pushEventToGoogle(eventId: string) {
  const [e] = await db.select().from(schema.event).where(eq(schema.event.id, eventId));
  if (!e || e.googleEventId) return;
  const g = await calendar.insert(
    e.calendarOwner,
    "primary",
    {
      summary: e.title,
      description: e.description ?? undefined,
      location: e.location ?? undefined,
      start: { dateTime: e.startAt.toISOString() },
      end: { dateTime: e.endAt.toISOString() },
      attendees: e.attendees.map((email) => ({ email })),
    },
    !e.meetUrl,
  );
  await db.update(schema.event).set({ googleEventId: g.id, htmlLink: g.htmlLink, meetUrl: e.meetUrl ?? g.hangoutLink ?? null }).where(eq(schema.event.id, e.id));
}

export async function patchEventInGoogle(eventId: string) {
  const [e] = await db.select().from(schema.event).where(eq(schema.event.id, eventId));
  if (!e?.googleEventId) return pushEventToGoogle(eventId);
  await calendar.patch(e.calendarOwner, "primary", e.googleEventId, {
    summary: e.title,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start: { dateTime: e.startAt.toISOString() },
    end: { dateTime: e.endAt.toISOString() },
    attendees: e.attendees.map((email) => ({ email })),
  });
}

export async function deleteEventInGoogle(owner: string, googleEventId: string) {
  await calendar.remove(owner, "primary", googleEventId).catch(() => {});
}

export { isNull };
