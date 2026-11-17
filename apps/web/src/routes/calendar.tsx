import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Lock, Plus, RefreshCw, Repeat, Video } from "lucide-react";
import { TABLES } from "@erp/shared";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { api, type Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { useCreateRecord, useList, useOptions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OptionBadge, Segmented } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, inputClass } from "@/components/ui/input";

const MEMBERS = [
  { email: "sami@otopio.ca", name: "Sami", color: "#2563eb" },
  { email: "maissane@otopio.ca", name: "Maïssane", color: "#db2777" },
  { email: "contact@otopio.ca", name: "Contact", color: "#0d9488" },
  { email: "noah@otopio.ca", name: "Noah", color: "#ea580c" },
];
const colorOf = (owner: string) => MEMBERS.find((m) => m.email === owner)?.color ?? "#64748b";
const DAY = 864e5;
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const HOUR_PX = 48;

export function CalendarPage() {
  const { tr, locale } = useI18n();
  const navigate = useNavigate();
  const [view, setView] = useState<"week" | "month" | "list">("week");
  const [kinds, setKinds] = useState<string[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [members, setMembers] = useState<string[]>(MEMBERS.map((m) => m.email));
  const [client, setClient] = useState<string>("");
  const [creating, setCreating] = useState<Date | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "week" && scroller.current) scroller.current.scrollTop = 7 * HOUR_PX;
  }, [view]);

  const range = useMemo(() => {
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { start: s, end: new Date(s.getTime() + 7 * DAY) };
    }
    const s = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    return { start: s, end: new Date(s.getTime() + 42 * DAY) };
  }, [view, cursor]);

  const { data, isFetching } = useList("event", {
    filters: [
      { field: "startAt", op: "after", value: range.start.toISOString() },
      { field: "startAt", op: "before", value: range.end.toISOString() },
      ...(client ? [{ field: "organizationId", op: "in", value: [client] }] : []),
    ],
    sorts: [{ field: "startAt", dir: "asc" }],
    limit: 2000,
  });
  const { data: clients = [] } = useOptions("organization", "");

  // dedupe the same Google event shown in several calendars
  const events = useMemo(() => {
    const map = new Map<string, Row & { owners: string[] }>();
    for (const e of data?.rows ?? []) {
      if (!members.includes(String(e.calendarOwner))) continue;
      const k = String(e.googleEventId ?? e.id);
      const ex = map.get(k);
      if (ex) ex.owners.push(String(e.calendarOwner));
      else map.set(k, { ...e, owners: [String(e.calendarOwner)] });
    }
    return [...map.values()];
  }, [data, members]);

  const days = Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => new Date(range.start.getTime() + i * DAY));
  const shift = (n: number) => setCursor(view === "week" ? new Date(cursor.getTime() + n * 7 * DAY) : new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const open = (e: Row) => navigate({ to: "/db/$table/$id", params: { table: "event", id: e.id } });
  const title = view === "week" ? `${fmtDate(range.start.toISOString(), locale, { day: "numeric", month: "short" })} – ${fmtDate(new Date(range.end.getTime() - DAY).toISOString(), locale, { day: "numeric", month: "short", year: "numeric" })}` : cursor.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: "long", year: "numeric" });

  return (
    <AppShell
      title={tr({ fr: "Calendrier", en: "Calendar" })}
      actions={
        <div className="flex items-center gap-2">
          <Button size="md" variant="ghost" onClick={() => api("/ws/sync/calendar-sync", { method: "POST" }).then(() => toast.success(tr({ fr: "Synchronisation lancée", en: "Sync started" })))}>
            <RefreshCw className={cn(isFetching && "animate-spin")} />
          </Button>
          <Button variant="primary" size="md" onClick={() => setCreating(new Date())}>
            <Plus /> {tr({ fr: "Événement", en: "Event" })}
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button size="sm" onClick={() => setCursor(new Date())}>
              {tr({ fr: "Aujourd'hui", en: "Today" })}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
          <h1 className="text-[17px] font-semibold capitalize">{title}</h1>
          <Segmented value={view} onChange={setView} options={[{ value: "week", label: tr({ fr: "Semaine", en: "Week" }) }, { value: "month", label: tr({ fr: "Mois", en: "Month" }) }, { value: "list", label: tr({ fr: "Liste", en: "List" }) }]} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {MEMBERS.map((m) => {
              const on = members.includes(m.email);
              return (
                <button
                  key={m.email}
                  type="button"
                  onClick={() => setMembers(on ? members.filter((x) => x !== m.email) : [...members, m.email])}
                  className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition", on ? "border-transparent text-white" : "border-border text-muted")}
                  style={on ? { background: m.color } : undefined}
                >
                  {m.name}
                </button>
              );
            })}
            <select value={client} onChange={(e) => setClient(e.target.value)} className="h-7 rounded-lg border border-border bg-surface px-2 text-xs outline-none">
              <option value="">{tr({ fr: "Tous les clients", en: "All clients" })}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {view === "list" ? (
          <EventList events={events} kinds={kinds} setKinds={setKinds} onOpen={open} />
        ) : view === "week" ? (
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border bg-surface">
              <div />
              {days.map((d) => (
                <div key={d.toISOString()} className="border-l border-border px-2 py-2 text-center">
                  <div className="text-[11px] uppercase text-subtle">{d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "short" })}</div>
                  <div className={cn("mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-[15px] font-medium", sameDay(d, new Date()) && "bg-accent text-white")}>{d.getDate()}</div>
                  <div className="mt-1 space-y-0.5">
                    {events
                      .filter((e) => e.allDay && sameDay(new Date(String(e.startAt)), d))
                      .map((e) => (
                        <button key={e.id} type="button" onClick={() => open(e)} className="block w-full truncate rounded px-1 text-left text-[11px] text-white" style={{ background: colorOf(e.owners[0]!) }}>
                          {String(e.title)}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]">
              <div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} style={{ height: HOUR_PX }} className="pr-2 text-right text-[10px] text-subtle">
                    {h ? `${h}:00` : ""}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const list = events.filter((e) => !e.allDay && sameDay(new Date(String(e.startAt)), d));
                return (
                  <div key={d.toISOString()} className="relative border-l border-border" onDoubleClick={(ev) => {
                    const y = ev.nativeEvent.offsetY;
                    const t = new Date(d);
                    t.setHours(Math.floor(y / HOUR_PX), 0, 0, 0);
                    setCreating(t);
                  }}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} style={{ height: HOUR_PX }} className="border-b border-border/60" />
                    ))}
                    {sameDay(d, new Date()) && <div className="absolute inset-x-0 z-[2] h-px bg-rose-500" style={{ top: (new Date().getHours() + new Date().getMinutes() / 60) * HOUR_PX }} />}
                    {list.map((e, i) => {
                      const s = new Date(String(e.startAt));
                      const en = new Date(String(e.endAt));
                      const top = (s.getHours() + s.getMinutes() / 60) * HOUR_PX;
                      const h = Math.max(20, Math.min(24 * HOUR_PX - top, ((en.getTime() - s.getTime()) / 3600e3) * HOUR_PX) - 2);
                      const overlap = list.filter((o) => new Date(String(o.startAt)) < en && new Date(String(o.endAt)) > s);
                      const idx = overlap.indexOf(e);
                      const w = 100 / overlap.length;
                      const c = colorOf(e.owners[0]!);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => open(e)}
                          className="absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-card"
                          style={{ top, height: h, left: `calc(${idx * w}% + 2px)`, width: `calc(${w}% - 4px)`, background: `color-mix(in oklab, ${c} 14%, var(--surface))`, borderColor: c, zIndex: 3 + i }}
                          title={String(e.title)}
                        >
                          <span className="flex items-center gap-1 font-medium" style={{ color: `color-mix(in oklab, ${c} 75%, var(--fg))` }}>
                            {e.isPrivate ? <Lock className="size-2.5" /> : e.meetUrl ? <Video className="size-2.5" /> : null}
                            <span className="truncate">{String(e.title)}</span>
                          </span>
                          {h > 30 && <span className="block text-muted">{s.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span>}
                          {h > 44 && e.owners.length > 1 && (
                            <span className="mt-0.5 flex gap-0.5">
                              {e.owners.map((o) => (
                                <span key={o} className="size-1.5 rounded-full" style={{ background: colorOf(o) }} />
                              ))}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
            {days.map((d) => {
              const list = events.filter((e) => sameDay(new Date(String(e.startAt)), d));
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div key={d.toISOString()} onDoubleClick={() => setCreating(new Date(d.setHours(10)))} className={cn("min-h-0 overflow-hidden border-b border-r border-border p-1", !inMonth && "bg-surface-2/50")}>
                  <div className={cn("mb-1 grid size-6 place-items-center rounded-full text-xs", sameDay(d, new Date()) ? "bg-accent font-semibold text-white" : inMonth ? "" : "text-subtle")}>{d.getDate()}</div>
                  {list.slice(0, 4).map((e) => (
                    <button key={e.id} type="button" onClick={() => open(e)} className="flex w-full items-center gap-1 truncate rounded px-1 py-px text-left text-[11px] hover:bg-hover">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: colorOf(e.owners[0]!) }} />
                      <span className="truncate">{!e.allDay && `${new Date(String(e.startAt)).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} `}{String(e.title)}</span>
                    </button>
                  ))}
                  {list.length > 4 && <div className="px-1 text-[10px] text-subtle">+{list.length - 4}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <NewEvent at={creating} onClose={() => setCreating(null)} />
    </AppShell>
  );
}

function NewEvent({ at, onClose }: { at: Date | null; onClose: () => void }) {
  const { tr } = useI18n();
  const create = useCreateRecord("event");
  const { data: clients = [] } = useOptions("organization", "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const [form, setForm] = useState({ title: "", start: "", minutes: 60, attendees: "", org: "", owner: "", description: "", notes: "" });
  const isOpen = Boolean(at);
  if (isOpen && !form.start) setTimeout(() => setForm((f) => ({ ...f, start: local(at!) })), 0);
  const submit = async () => {
    const start = new Date(form.start);
    await create.mutateAsync({
      title: form.title || tr({ fr: "Réunion", en: "Meeting" }),
      startAt: start.toISOString(),
      endAt: new Date(start.getTime() + form.minutes * 60_000).toISOString(),
      attendees: form.attendees.split(/[\s,;]+/).filter((x) => x.includes("@")),
      organizationId: form.org || null,
      description: form.description || null,
      notes: form.notes || null,
      ...(form.owner ? { calendarOwner: form.owner } : {}),
    });
    toast.success(tr({ fr: "Événement créé — invitation Google + lien Meet en cours", en: "Event created — Google invite + Meet link on the way" }));
    setForm({ title: "", start: "", minutes: 60, attendees: "", org: "", owner: "", description: "", notes: "" });
    onClose();
  };
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={tr({ fr: "Nouvel événement", en: "New event" })} description={tr({ fr: "Créé dans Google Agenda avec un lien Google Meet, invitations envoyées aux participants.", en: "Created in Google Calendar with a Meet link; attendees are invited." })}>
        <div className="space-y-3 p-5">
          <Input autoFocus placeholder={tr({ fr: "Titre", en: "Title" })} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="flex gap-2">
            <input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={cn(inputClass, "flex-1")} />
            <select value={form.minutes} onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })} className={cn(inputClass, "w-28")}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>
          <Input placeholder={tr({ fr: "Participants (courriels, séparés par des virgules)", en: "Attendees (emails)" })} value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} />
          <div className="flex gap-2">
            <select value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} className={cn(inputClass, "flex-1")}>
              <option value="">{tr({ fr: "Client (optionnel)", en: "Client (optional)" })}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} className={cn(inputClass, "w-40")}>
              <option value="">{tr({ fr: "Mon agenda", en: "My calendar" })}</option>
              {MEMBERS.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={cn(inputClass, "h-auto py-2")} />
          <textarea placeholder={tr({ fr: "Note interne (non partagée dans Google Agenda)", en: "Internal note (not shared to Google Calendar)" })} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={cn(inputClass, "h-auto py-2")} />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            {tr({ fr: "Annuler", en: "Cancel" })}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!form.start}>
            {tr({ fr: "Créer", en: "Create" })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


const KIND_FIELD = TABLES.event.fields.find((f) => f.key === "kind")!;

function EventList({ events, kinds, setKinds, onOpen }: { events: (Row & { owners: string[] })[]; kinds: string[]; setKinds: (k: string[]) => void; onOpen: (e: Row) => void }) {
  const { tr, locale } = useI18n();
  const list = events.filter((e) => !kinds.length || kinds.includes(String(e.kind ?? "other"))).sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
  const byDay = new Map<string, typeof list>();
  for (const e of list) {
    const d = new Date(String(e.startAt)).toDateString();
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const counts = new Map<string, number>();
  for (const e of events) counts.set(String(e.kind ?? "other"), (counts.get(String(e.kind ?? "other")) ?? 0) + 1);
  const time = (d: unknown) => new Date(String(d)).toLocaleTimeString(locale === "fr" ? "fr-CA" : "en-CA", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex flex-wrap gap-1.5 border-b border-border bg-surface px-6 py-2.5">
        <button type="button" onClick={() => setKinds([])} className={cn("h-7 rounded-full px-3 text-xs font-medium", !kinds.length ? "bg-fg text-surface" : "text-muted ring-1 ring-inset ring-border hover:text-fg")}>
          {tr({ fr: "Tous", en: "All" })} · {events.length}
        </button>
        {KIND_FIELD.options!.map((o) => {
          const on = kinds.includes(o.value);
          const n = counts.get(o.value) ?? 0;
          if (!n) return null;
          return (
            <button key={o.value} type="button" onClick={() => setKinds(on ? kinds.filter((k) => k !== o.value) : [...kinds, o.value])} className={cn("h-7 rounded-full px-3 text-xs", on ? "bg-accent/10 font-medium text-accent ring-1 ring-inset ring-accent/30" : "text-muted ring-1 ring-inset ring-border hover:text-fg")}>
              {tr(o.label)} · {n}
            </button>
          );
        })}
      </div>
      <div className="mx-auto max-w-4xl px-4 py-4 md:px-6">
        {[...byDay.entries()].map(([d, evs]) => {
          const date = new Date(d);
          const today = sameDay(date, new Date());
          return (
            <div key={d} className="mb-5">
              <div className={cn("mb-1.5 text-[12px] font-medium uppercase tracking-wider", today ? "text-accent" : "text-subtle")}>
                {date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { weekday: "long", day: "numeric", month: "long" })}
                {today && ` · ${tr({ fr: "aujourd'hui", en: "today" })}`}
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                {evs.map((e) => {
                  const opt = KIND_FIELD.options!.find((o) => o.value === (e.kind ?? "other"));
                  return (
                    <button key={e.id} type="button" onClick={() => onOpen(e)} className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left text-[13px] last:border-0 hover:bg-hover">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colorOf(e.owners[0]!) }} />
                      <span className="w-32 shrink-0 whitespace-nowrap tabular-nums text-muted">{e.allDay ? tr({ fr: "Journée", en: "All day" }) : `${time(e.startAt)} – ${time(e.endAt)}`}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          {e.isPrivate ? <Lock className="size-3 text-subtle" /> : e.meetUrl ? <Video className="size-3 text-subtle" /> : null}
                          <span className="truncate">{String(e.title)}</span>
                          {e.recurrence ? <Repeat className="size-3 shrink-0 text-subtle" /> : null}
                        </span>
                        {e.location || e.notes ? <span className="block truncate text-xs text-subtle">{String(e.notes ?? e.location)}</span> : null}
                      </span>
                      {opt && <OptionBadge option={opt} />}
                      <span className="hidden gap-0.5 sm:flex">
                        {e.owners.map((o) => (
                          <span key={o} className="size-2 rounded-full" style={{ background: colorOf(o) }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!list.length && <div className="py-16 text-center text-[13px] text-subtle">{tr({ fr: "Aucun événement sur cette période.", en: "No events in this period." })}</div>}
      </div>
    </div>
  );
}
