import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Cloud, Database, Github, HardDrive, Landmark, Plus, Server } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented, StatusDot } from "@/components/ui/misc";
import { useState } from "react";
import { AiUsage, AutomationJournal, PersonalGoogle } from "./automation";
import { useUrlTab } from "@/lib/use-media";
import { WorkspaceSettings } from "./workspace-settings";
import { IntegrityPanel } from "./integrity";

type Status = {
  google: { connected: boolean; scope: string };
  github: { connected: boolean; org: string };
  cloudflare: { connected: boolean };
  r2: { connected: boolean; bucket: string };
  redis: { connected: boolean };
  qonto: { connected: boolean; entities: { id: string; name: string }[] };
  quickbooks: { connected: boolean; entities: { id: string; name: string }[] };
};

export function SettingsPage() {
  const { tr, t, locale, setLocale } = useI18n();
  const navigate = useNavigate();
  const { data: status } = useQuery({ queryKey: ["integrations"], queryFn: () => api<Status>("/integrations/status") });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: () => api<{ ok: boolean; env: string; version: string; db: boolean; redis: boolean }>("/health") });
  const [tab0, setTab] = useUrlTab<"workspace" | "entities" | "integrations" | "accounts" | "automation" | "ai" | "prefs" | "system">("workspace", ["workspace", "entities", "integrations", "accounts", "automation", "ai", "prefs", "system"]);
  const tab = tab0 === "entities" ? "workspace" : tab0;
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const integrations = status
    ? [
        { name: "Google Workspace", desc: tr({ fr: "Connexion SSO @otopio.ca, Gmail, Drive, Docs", en: "SSO @otopio.ca, Gmail, Drive, Docs" }), ok: status.google.connected, icon: <GoogleIcon />, env: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
        { name: "GitHub", desc: tr({ fr: `Repos des projets (${status.github.org})`, en: `Project repos (${status.github.org})` }), ok: status.github.connected, icon: <Github className="size-5" />, env: "GITHUB_TOKEN" },
        { name: "Cloudflare", desc: tr({ fr: "DNS, Web Analytics du site otopio.ca", en: "DNS, otopio.ca Web Analytics" }), ok: status.cloudflare.connected, icon: <Cloud className="size-5 text-orange-500" />, env: "CLOUDFLARE_API_TOKEN" },
        { name: "Cloudflare R2", desc: tr({ fr: `Fichiers, CDN et sauvegardes BDD (${status.r2.bucket})`, en: `Files, CDN and DB backups (${status.r2.bucket})` }), ok: status.r2.connected, icon: <HardDrive className="size-5 text-orange-500" />, env: "R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY" },
        { name: "Qonto", desc: `Megascale (FR) — ${tr({ fr: "transactions bancaires", en: "bank transactions" })}`, ok: status.qonto.connected, icon: <span className="text-sm font-bold text-violet-600">Q</span>, env: "QONTO_LOGIN / QONTO_SECRET_KEY" },
        { name: "QuickBooks", desc: `Otopio Inc. (CA) — ${tr({ fr: "comptabilité", en: "accounting" })}`, ok: status.quickbooks.connected, icon: <span className="text-sm font-bold text-emerald-600">qb</span>, env: "QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET" },
        { name: "Redis · Worker", desc: tr({ fr: "File de tâches (PDF, sauvegardes)", en: "Job queue (PDF, backups)" }), ok: status.redis.connected, icon: <Server className="size-5" />, env: "REDIS_URL" },
      ]
    : [];

  return (
    <AppShell title={t("settings")}>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 md:px-8 md:pt-8">
          <h1 className="text-[28px] font-semibold tracking-tight">{t("settings")}</h1>
          <Segmented
            className="mt-5 flex-wrap"
            value={tab}
            onChange={setTab}
            options={[
              { value: "workspace", label: tr({ fr: "Espace de travail", en: "Workspace" }) },
              { value: "integrations", label: tr({ fr: "Intégrations", en: "Integrations" }) },
              { value: "accounts", label: tr({ fr: "Comptes Google", en: "Google accounts" }) },
              { value: "automation", label: tr({ fr: "Automatisations", en: "Automations" }) },
              { value: "ai", label: tr({ fr: "IA & coûts", en: "AI & costs" }) },
              { value: "prefs", label: tr({ fr: "Préférences", en: "Preferences" }) },
              { value: "system", label: tr({ fr: "Système", en: "System" }) },
            ]}
          />

          {tab === "workspace" && <WorkspaceSettings />}

          {tab === "integrations" && (
          <section className="mt-10">
            <h2 className="text-lg font-semibold">{tr({ fr: "Intégrations", en: "Integrations" })}</h2>
            <p className="mb-3 text-[13px] text-muted">{tr({ fr: "Les clés se configurent dans les variables d'environnement Dokploy (prod & staging).", en: "Keys are set as Dokploy environment variables (prod & staging)." })}</p>
            <div className="overflow-hidden rounded-xl border border-border">
              {integrations.map((i) => (
                <div key={i.name} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
                  <span className="grid size-10 place-items-center rounded-xl bg-surface-2 ring-1 ring-inset ring-border">{i.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[14px] font-medium">
                      {i.name} <StatusDot ok={i.ok} />
                    </div>
                    <div className="truncate text-xs text-muted">{i.desc}</div>
                  </div>
                  <code className="hidden rounded-md bg-surface-2 px-2 py-1 text-[11px] text-muted lg:block">{i.env}</code>
                  <span className={i.ok ? "text-xs font-medium text-emerald-600" : "text-xs text-subtle"}>{i.ok ? t("connected") : t("notConnected")}</span>
                </div>
              ))}
            </div>
          </section>
          )}

          {tab === "automation" && <AutomationJournal />}

          {tab === "accounts" && <PersonalGoogle />}
          {tab === "ai" && <AiUsage />}

          {tab === "prefs" && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">{tr({ fr: "Préférences", en: "Preferences" })}</h2>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between text-[13px]">
                <span>{t("language")}</span>
                <Segmented value={locale} onChange={setLocale} options={[{ value: "fr", label: "Français" }, { value: "en", label: "English" }]} />
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span>{t("theme")}</span>
                <Segmented
                  value={dark ? "dark" : "light"}
                  onChange={(v) => {
                    const d = v === "dark";
                    setDark(d);
                    document.documentElement.classList.toggle("dark", d);
                    try {
                      localStorage.setItem("erp.theme", v);
                    } catch {}
                  }}
                  options={[{ value: "light", label: t("light") }, { value: "dark", label: t("dark") }]}
                />
              </div>
            </div>
          </section>
          )}

          {tab === "system" && <IntegrityPanel />}
          {tab === "system" && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-semibold">{tr({ fr: "Système", en: "System" })}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: tr({ fr: "Environnement", en: "Environment" }), value: health?.env ?? "…", icon: Landmark },
                { label: "PostgreSQL", value: health?.db ? "OK" : "—", icon: Database },
                { label: "Version", value: health?.version?.slice(0, 7) ?? "…", icon: Server },
              ].map((x) => (
                <div key={x.label} className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <x.icon className="size-3.5" /> {x.label}
                  </div>
                  <div className="mt-2 font-mono text-[15px] font-medium">{x.value}</div>
                </div>
              ))}
            </div>
          </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
