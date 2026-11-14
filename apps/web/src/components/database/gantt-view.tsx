import { useEffect, useMemo, useRef, useState } from "react";
import { TABLES, type TableKey } from "@erp/shared";
import type { Refs, Row } from "@/lib/api";
import { fmtDate, useI18n } from "@/lib/i18n";
import { recordLabel, type ViewConfig } from "@/lib/data";
import { HEX } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/misc";
import { RelationChip } from "./fields";

type Props = {
  table: TableKey;
  rows: Row[];
  refs: Refs;
  config: ViewConfig;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
};

const DAY = 864e5;
const parse = (v: unknown) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`) : null);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

type Scale = "week" | "month" | "quarter";
const PX_PER_DAY: Record<Scale, number> = { week: 44, month: 16, quarter: 6 };

export function GanttView({ table, rows, refs, config, onUpdate, onOpen }: Props) {
  const { tr, t, locale } = useI18n();
  const def = TABLES[table];
  const startKey = config.dateField ?? def.startField ?? def.dateField ?? "";
  const endKey = config.endDateField ?? def.endField ?? startKey;
  const statusField = def.fields.find((f) => f.key === (def.kanbanField ?? "status") && f.type === "select");
  const subtitleField = def.fields.find((f) => f.key === def.subtitle);
  const [scale, setScale] = useState<Scale>("month");
  const px = PX_PER_DAY[scale];
  const scroller = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () =>
      rows
        .map((r) => {
          const s = parse(r[startKey]) ?? parse(r[endKey]);
          const e = parse(r[endKey]) ?? s;
          return s && e ? { r, s: s <= e ? s : e, e: s <= e ? e : s } : { r, s: null, e: null };
        })
        .sort((a, b) => (a.s?.getTime() ?? Infinity) - (b.s?.getTime() ?? Infinity)),
    [rows, startKey, endKey],
  );

  const range = useMemo(() => {
    const dated = items.filter((i) => i.s);
    const now = new Date();
    let min = dated.length ? new Date(Math.min(...dated.map((i) => i.s!.getTime()))) : addDays(now, -30);
    let max = dated.length ? new Date(Math.max(...dated.map((i) => i.e!.getTime()))) : addDays(now, 60);
    if (now < min) min = now;
    if (now > max) max = now;
    min = new Date(min.getFullYear(), min.getMonth() - 1, 1);
    max = new Date(max.getFullYear(), max.getMonth() + 2, 0);
    return { min, days: diffDays(min, max) + 1 };
  }, [items]);

  // Header segments
  const months = useMemo(() => {
    const out: { label: string; left: number; width: number }[] = [];
    let d = new Date(range.min);
    while (diffDays(range.min, d) < range.days) {
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const left = diffDays(range.min, d) * px;
      const width = Math.min(diffDays(d, next), range.days - diffDays(range.min, d)) * px;
      out.push({ label: d.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { month: scale === "quarter" ? "short" : "long", year: "numeric" }), left, width });
      d = next;
    }
    return out;
  }, [range, px, locale, scale]);

  const todayX = diffDays(range.min, new Date(new Date().toDateString())) * px;
  useEffect(() => {
    scroller.current?.scrollTo({ left: Math.max(0, todayX - 280), behavior: "auto" });
  }, [todayX, scale]);

  // Drag state
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "start" | "end"; x0: number; s: Date; e: Date; dx: number } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const move = (ev: PointerEvent) => setDrag((d) => (d ? { ...d, dx: ev.clientX - d.x0 } : d));
    const up = () => {
      setDrag((d) => {
        if (d) {
          const delta = Math.round(d.dx / px);
          if (delta) {
            const s = d.mode === "end" ? d.s : addDays(d.s, delta);
            const e = d.mode === "start" ? d.e : addDays(d.e, delta);
            const patch: Record<string, unknown> = {};
            if (startKey) patch[startKey] = iso(s <= e ? s : e);
            if (endKey && endKey !== startKey) patch[endKey] = iso(s <= e ? e : s);
            onUpdate(d.id, patch);
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, px, startKey, endKey, onUpdate]);

  const ROW_H = 40;
  const width = range.days * px;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Segmented value={scale} onChange={setScale} options={[{ value: "week", label: t("week") }, { value: "month", label: t("month") }, { value: "quarter", label: t("quarter") }]} />
        <button type="button" onClick={() => scroller.current?.scrollTo({ left: Math.max(0, todayX - 280), behavior: "smooth" })} className="h-7 rounded-lg px-2 text-xs font-medium text-muted ring-1 ring-inset ring-border hover:text-fg">
          {t("today")}
        </button>
        <span className="ml-auto text-xs text-subtle">{tr({ fr: "Glissez les barres pour replanifier", en: "Drag bars to reschedule" })}</span>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* Left labels */}
        <div className="w-72 shrink-0 overflow-hidden border-r border-border">
          <div className="h-14 border-b border-border bg-surface px-4 pt-8 text-xs font-medium text-muted">{tr(def.singular)}</div>
          <div className="overflow-hidden" id="gantt-left">
            {items.map(({ r }) => (
              <button key={r.id} type="button" onClick={() => onOpen(r.id)} style={{ height: ROW_H }} className="flex w-full items-center gap-2 border-b border-border px-4 text-left hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{recordLabel(table, r)}</span>
                </span>
                {subtitleField?.type === "relation" && r[subtitleField.key] ? (
                  <span className="max-w-28 shrink-0 truncate opacity-80">
                    <RelationChip table={subtitleField.relation!} id={String(r[subtitleField.key])} refs={refs} compact />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        {/* Timeline */}
        <div
          ref={scroller}
          className="relative min-w-0 flex-1 overflow-auto"
          onScroll={(e) => {
            const left = document.getElementById("gantt-left");
            if (left) left.style.transform = `translateY(-${(e.target as HTMLDivElement).scrollTop}px)`;
          }}
        >
          <div style={{ width, minHeight: "100%" }} className="relative">
            <div className="sticky top-0 z-10 h-14 border-b border-border bg-surface/95 backdrop-blur">
              {months.map((m) => (
                <div key={m.left} style={{ left: m.left, width: m.width }} className="absolute top-0 h-7 truncate border-r border-border px-2 pt-1.5 text-xs font-medium capitalize text-fg">
                  {m.label}
                </div>
              ))}
              {scale !== "quarter" &&
                Array.from({ length: range.days }, (_, i) => {
                  const d = addDays(range.min, i);
                  const show = scale === "week" || d.getDay() === 1;
                  return show ? (
                    <div key={i} style={{ left: i * px }} className={cn("absolute top-7 h-7 border-l border-border pl-1 pt-1.5 text-[10px] tabular-nums text-subtle", d.getDay() % 6 === 0 && "text-subtle/60")}>
                      {d.getDate()}
                    </div>
                  ) : null;
                })}
            </div>
            {/* weekend shading + grid */}
            {scale !== "quarter" &&
              Array.from({ length: range.days }, (_, i) => {
                const d = addDays(range.min, i);
                return d.getDay() % 6 === 0 ? <div key={i} style={{ left: i * px, width: px, top: 56 }} className="absolute bottom-0 bg-surface-2/60" /> : null;
              })}
            <div style={{ left: todayX, top: 56 }} className="absolute bottom-0 z-[5] w-px bg-rose-500">
              <span className="absolute -left-[3px] -top-1 size-[7px] rounded-full bg-rose-500" />
            </div>
            {items.map(({ r, s, e }, i) => {
              const opt = statusField?.options?.find((o) => o.value === r[statusField.key]);
              const color = opt ? HEX[opt.color] : "#6366f1";
              const top = 56 + i * ROW_H;
              if (!s || !e) {
                return <div key={r.id} style={{ top, height: ROW_H }} className="absolute left-0 right-0 border-b border-border" />;
              }
              const isDrag = drag?.id === r.id;
              const delta = isDrag ? Math.round(drag.dx / px) : 0;
              const ss = isDrag && drag.mode !== "end" ? addDays(s, delta) : s;
              const ee = isDrag && drag.mode !== "start" ? addDays(e, delta) : e;
              const left = diffDays(range.min, ss) * px;
              const w = Math.max(px, (diffDays(ss, ee) + 1) * px);
              const progress = typeof r.progress === "number" ? r.progress : null;
              return (
                <div key={r.id} style={{ top, height: ROW_H }} className="absolute left-0 right-0 border-b border-border">
                  <div
                    onPointerDown={(ev) => {
                      ev.preventDefault();
                      setDrag({ id: r.id, mode: "move", x0: ev.clientX, s, e, dx: 0 });
                    }}
                    onDoubleClick={() => onOpen(r.id)}
                    title={`${recordLabel(table, r)} · ${fmtDate(iso(ss), locale)} → ${fmtDate(iso(ee), locale)}`}
                    style={{ left, width: w, background: `color-mix(in oklab, ${color} 16%, var(--surface))`, borderColor: `color-mix(in oklab, ${color} 45%, transparent)` }}
                    className={cn("group/bar absolute top-1.5 flex h-7 cursor-grab items-center overflow-hidden rounded-lg border text-xs font-medium shadow-card active:cursor-grabbing", isDrag && "shadow-pop")}
                  >
                    {progress != null && <div className="absolute inset-y-0 left-0 opacity-25" style={{ width: `${progress}%`, background: color }} />}
                    <span className="relative truncate px-2" style={{ color: `color-mix(in oklab, ${color} 70%, var(--fg))` }}>
                      {recordLabel(table, r)}
                    </span>
                    <span
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        setDrag({ id: r.id, mode: "start", x0: ev.clientX, s, e, dx: 0 });
                      }}
                      className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
                      style={{ background: `color-mix(in oklab, ${color} 40%, transparent)` }}
                    />
                    <span
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        setDrag({ id: r.id, mode: "end", x0: ev.clientX, s, e, dx: 0 });
                      }}
                      className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
                      style={{ background: `color-mix(in oklab, ${color} 40%, transparent)` }}
                    />
                  </div>
                </div>
              );
            })}
            <div style={{ height: 56 + items.length * ROW_H + 40 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
