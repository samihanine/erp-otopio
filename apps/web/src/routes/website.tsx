import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Eye, Globe, MousePointerClick, Sparkles, Timer, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { CONTENT_STATUS_OPTIONS, TABLES } from "@erp/shared";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { fmtDate, fmtNumber, useI18n } from "@/lib/i18n";
import { useList } from "@/lib/data";
import { HEX } from "@/lib/colors";
import { OptionBadge, Segmented, TableTile } from "@/components/ui/misc";

type Analytics = {
  demo: boolean;
  domain: string;
  totals: { visitors: number; pageviews: number; bounceRate: number; avgDuration: number };
  series: { date: string; visitors: number; pageviews: number }[];
  pages: { path: string; views: number }[];
  referrers: { source: string; visitors: number }[];
  countries: { code: string; visitors: number }[];
  devices: { device: string; share: number }[];
};

const FLAGS: Record<string, string> = { CA: "🇨🇦", FR: "🇫🇷", US: "🇺🇸", BE: "🇧🇪", CH: "🇨🇭" };

export function WebsitePage() {
  const { tr, t, locale } = useI18n();
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const { data } = useQuery({ queryKey: ["website", days], queryFn: () => api<Analytics>(`/integrations/website/analytics?days=${days}`) });
  const { data: articles } = useList("article", {});
  const { data: posts } = useList("post", {});
  const { data: artifacts } = useList("artifact", {});
  const { data: team } = useList("team_member", {});
  const n = (v: number) => fmtNumber(v, locale);

  return (
    <AppShell title={t("website")}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-7xl px-8 pb-16 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-navy text-sky-brand">
                <Globe className="size-5" />
              </span>
              <div>
                <h1 className="text-[26px] font-semibold tracking-tight">otopio.ca</h1>
                <a href="https://otopio.ca" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] text-muted hover:text-fg">
                  {tr({ fr: "Site public · Cloudflare", en: "Public site · Cloudflare" })} <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
            <Segmented value={days} onChange={setDays} options={[{ value: "7", label: "7 j" }, { value: "30", label: "30 j" }, { value: "90", label: "90 j" }]} />
          </div>

          {/* CMS: content published on otopio.ca (server-side rendered from the ERP) */}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {(["artifact", "team_member", "article"] as const).map((k) => {
              const def = TABLES[k];
              const rows = (k === "artifact" ? artifacts : k === "team_member" ? team : articles)?.rows ?? [];
              const published = rows.filter((r) => r.status === "published").length;
              return (
                <Link key={k} to="/db/$table" params={{ table: k }} search={{}} className="group flex items-center gap-3 rounded-xl border border-border p-4 transition hover:border-border-strong">
                  <TableTile icon={def.icon} color={def.color} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{tr(def.label)}</div>
                    <div className="text-xs text-muted">
                      {published} {tr({ fr: "publié(s)", en: "published" })} · {rows.length - published} {tr({ fr: "brouillon(s)", en: "draft(s)" })}
                    </div>
                  </div>
                  <span className="text-xs text-subtle group-hover:text-fg">{tr({ fr: "Gérer →", en: "Manage →" })}</span>
                </Link>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-subtle">
            {tr({
              fr: "Les réalisations, l'équipe et les articles publiés ici apparaissent sur otopio.ca en moins d'une minute (rendu serveur). Images hébergées sur Cloudflare R2 (media.otopio.ca).",
              en: "Showcase, team and articles published here appear on otopio.ca within a minute (server-side rendering). Images on Cloudflare R2.",
            })}
          </p>

          {data?.demo && (
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-3 text-[13px]">
              <Sparkles className="size-4 text-accent" />
              <span className="flex-1 text-muted">
                <strong className="text-fg">{t("demoData")}.</strong> {tr({ fr: "Ajoutez un jeton Cloudflare (Analytics:Read) dans CLOUDFLARE_API_TOKEN pour afficher les vraies statistiques Web Analytics du site.", en: "Add a Cloudflare token (Analytics:Read) as CLOUDFLARE_API_TOKEN to show real Web Analytics." })}
              </span>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: tr({ fr: "Visiteurs uniques", en: "Unique visitors" }), value: data ? n(data.totals.visitors) : "…", icon: Users, tint: "#2563eb" },
              { label: tr({ fr: "Pages vues", en: "Page views" }), value: data ? n(data.totals.pageviews) : "…", icon: Eye, tint: "#8b5cf6" },
              { label: tr({ fr: "Taux de rebond", en: "Bounce rate" }), value: data ? `${Math.round(data.totals.bounceRate * 100)} %` : "…", icon: MousePointerClick, tint: "#f97316" },
              { label: tr({ fr: "Durée moyenne", en: "Avg. duration" }), value: data ? `${Math.floor(data.totals.avgDuration / 60)} min ${data.totals.avgDuration % 60} s` : "…", icon: Timer, tint: "#10b981" },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between text-[13px] text-muted">
                  {k.label}
                </div>
                <div className="mt-3 text-[26px] font-semibold tabular-nums tracking-tight">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-border p-5">
            <div className="text-[15px] font-semibold">{tr({ fr: "Trafic", en: "Traffic" })}</div>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.series ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-v" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g-p" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, locale, { day: "numeric", month: "short" })} tickLine={false} axisLine={false} minTickGap={32} tick={{ fontSize: 11, fill: "var(--subtle)" }} />
                  <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: "var(--subtle)" }} />
                  <RTooltip labelFormatter={(d) => fmtDate(String(d), locale, { weekday: "long", day: "numeric", month: "long" })} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="pageviews" name={tr({ fr: "Pages vues", en: "Page views" })} stroke="#8b5cf6" strokeWidth={1.5} fill="url(#g-p)" />
                  <Area type="monotone" dataKey="visitors" name={tr({ fr: "Visiteurs", en: "Visitors" })} stroke="#2563eb" strokeWidth={2} fill="url(#g-v)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title={tr({ fr: "Pages populaires", en: "Top pages" })}>
              {data?.pages.map((p) => <BarRow key={p.path} label={<span className="font-mono text-xs">{p.path}</span>} value={p.views} max={data.pages[0]!.views} color="#2563eb" fmt={n} />)}
            </Panel>
            <Panel title={tr({ fr: "Sources", en: "Referrers" })}>
              {data?.referrers.map((p) => <BarRow key={p.source} label={p.source} value={p.visitors} max={data.referrers[0]!.visitors} color="#8b5cf6" fmt={n} />)}
              <p className="pt-1 text-xs text-subtle">{tr({ fr: "« ChatGPT / Perplexity » = trafic issu des moteurs génératifs (GEO).", en: "“ChatGPT / Perplexity” = traffic from generative engines (GEO)." })}</p>
            </Panel>
            <Panel title={tr({ fr: "Pays & appareils", en: "Countries & devices" })}>
              {data?.countries.map((c) => <BarRow key={c.code} label={`${FLAGS[c.code] ?? ""} ${c.code}`} value={c.visitors} max={data.countries[0]!.visitors} color="#14b8a6" fmt={n} />)}
              <div className="mt-3 flex h-2 overflow-hidden rounded-full">
                {data?.devices.map((d, i) => <div key={d.device} style={{ width: `${d.share * 100}%`, background: ["#0a1430", "#2563eb", "#a9bbe6"][i] }} />)}
              </div>
              <div className="mt-1.5 flex gap-3 text-xs text-muted">
                {data?.devices.map((d) => (
                  <span key={d.device}>
                    {d.device} {Math.round(d.share * 100)} %
                  </span>
                ))}
              </div>
            </Panel>
          </div>

          {/* Content pipeline */}
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <ContentList title={tr(TABLES.article.label)} table="article" rows={articles?.rows ?? []} sub={(r) => (r.targetQuery ? `🎯 ${r.targetQuery}` : "")} />
            <ContentList title={tr(TABLES.post.label)} table="post" rows={posts?.rows ?? []} sub={(r) => String(r.network ?? "")} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-3 text-[15px] font-semibold">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function BarRow({ label, value, max, color, fmt }: { label: React.ReactNode; value: number; max: number; color: string; fmt: (n: number) => string }) {
  return (
    <div className="relative flex h-8 items-center overflow-hidden rounded-lg px-2.5 text-[13px]">
      <div className="absolute inset-y-0 left-0 rounded-lg opacity-[.12]" style={{ width: `${(value / max) * 100}%`, background: color }} />
      <span className="relative flex-1 truncate">{label}</span>
      <span className="relative tabular-nums text-muted">{fmt(value)}</span>
    </div>
  );
}

function ContentList({ title, table, rows, sub }: { title: string; table: "article" | "post"; rows: Record<string, unknown>[]; sub: (r: Record<string, unknown>) => string }) {
  const { tr } = useI18n();
  const def = TABLES[table];
  const counts = CONTENT_STATUS_OPTIONS.map((o) => ({ o, n: rows.filter((r) => r.status === o.value).length })).filter((x) => x.n);
  return (
    <div className="rounded-xl border border-border">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <TableTile icon={def.icon} color={def.color} />
        <span className="text-[15px] font-semibold">{title}</span>
        <div className="ml-3 flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          {counts.map(({ o, n }) => (
            <div key={o.value} style={{ width: `${(n / rows.length) * 100}%`, background: HEX[o.color] }} />
          ))}
        </div>
        <Link to="/db/$table" params={{ table }} className="ml-3 text-[13px] text-muted hover:text-fg">
          {tr({ fr: "Ouvrir", en: "Open" })} →
        </Link>
      </div>
      {rows.slice(0, 6).map((r) => (
        <Link key={String(r.id)} to="/db/$table/$id" params={{ table, id: String(r.id) }} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-hover">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{String(r.title)}</span>
            <span className="block truncate text-xs text-subtle">{sub(r)}</span>
          </span>
          <OptionBadge option={CONTENT_STATUS_OPTIONS.find((o) => o.value === r.status)} />
        </Link>
      ))}
    </div>
  );
}
