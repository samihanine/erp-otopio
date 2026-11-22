/** Settings › Espace de travail: identity, modules (tabs) on/off, website, members & roles. */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useWorkspaces, type ModuleKey } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Member = { id: string; email: string; role: "admin" | "member" | "viewer" };

const MODULES: { key: ModuleKey; label: { fr: string; en: string }; hint: { fr: string; en: string } }[] = [
  { key: "calendar", label: { fr: "Calendrier", en: "Calendar" }, hint: { fr: "Accueil › Calendrier", en: "Home › Calendar" } },
  { key: "clients", label: { fr: "Clients", en: "Clients" }, hint: { fr: "Tableaux de bord clients", en: "Client dashboards" } },
  { key: "db", label: { fr: "Données", en: "Data" }, hint: { fr: "Tables (projets, tâches, contacts…)", en: "Tables (projects, tasks, contacts…)" } },
  { key: "docs", label: { fr: "Documents", en: "Documents" }, hint: { fr: "Drive et modèles", en: "Drive and templates" } },
  { key: "finance", label: { fr: "Comptabilité › Finance", en: "Accounting › Finance" }, hint: { fr: "Tableau de bord financier", en: "Financial dashboard" } },
  { key: "taxes", label: { fr: "Comptabilité › Fiscal", en: "Accounting › Tax" }, hint: { fr: "Taxes et échéances", en: "Taxes and deadlines" } },
  { key: "website", label: { fr: "Marketing › Site web", en: "Marketing › Website" }, hint: { fr: "Contenus et statistiques du site", en: "Website content and analytics" } },
  { key: "social", label: { fr: "Marketing › Réseaux sociaux", en: "Marketing › Social media" }, hint: { fr: "Posts planifiés et publiés", en: "Scheduled and published posts" } },
];
const ROLES = [
  { value: "admin", label: { fr: "Admin", en: "Admin" } },
  { value: "member", label: { fr: "Membre", en: "Member" } },
  { value: "viewer", label: { fr: "Lecture seule", en: "Read-only" } },
] as const;

export function WorkspaceSettings() {
  const { tr, locale } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { ws } = useWorkspaces();
  const admin = ws?.role === "admin";
  const { data: members = [] } = useQuery({ queryKey: ["ws-members", ws?.id], queryFn: () => api<Member[]>(`/workspaces/${ws!.id}/members`), enabled: Boolean(ws) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("member");
  const [domain, setDomain] = useState<string | null>(null);
  if (!ws) return null;
  const refreshWs = () => qc.invalidateQueries({ queryKey: ["__workspaces"] });
  const patch = async (body: Record<string, unknown>) => {
    try {
      await api(`/workspaces/${ws.id}`, { method: "PATCH", json: body });
      await refreshWs();
      toast.success(tr({ fr: "Enregistré", en: "Saved" }));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const toggle = (m: ModuleKey) => patch({ disabledModules: ws.disabledModules.includes(m) ? ws.disabledModules.filter((x) => x !== m) : [...ws.disabledModules, m] });

  return (
    <div className="mt-8 space-y-10">
      <section>
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: ws.color }}>
            {ws.country}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{ws.name}</h2>
            <p className="text-[13px] text-muted">
              {ws.legalName} · {ws.currency} · {tr({ fr: "ton rôle", en: "your role" })} : {ROLES.find((r) => r.value === ws.role)?.label[locale]}
            </p>
          </div>
          <Button onClick={() => navigate({ to: "/db/$table/$id", params: { table: "legal_entity", id: ws.id } })}>
            {tr({ fr: "Infos légales & facturation", en: "Legal & billing info" })} <ExternalLink />
          </Button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          {tr({
            fr: "Chaque structure est un espace de travail indépendant : ses propres clients, contacts, finances, Drive, cartes et connexions. Seuls les membres ci-dessous y ont accès.",
            en: "Each structure is an independent workspace: its own clients, contacts, finances, Drive, cards and connections. Only the members below can open it.",
          })}
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-[15px] font-semibold">{tr({ fr: "Onglets activés", en: "Enabled tabs" })}</h3>
        <p className="mb-3 text-[13px] text-muted">{tr({ fr: "Les onglets désactivés disparaissent de la barre latérale pour tout l'espace.", en: "Disabled tabs disappear from the sidebar for the whole workspace." })}</p>
        <div className="overflow-hidden rounded-xl border border-border">
          {MODULES.map((m) => {
            const on = !ws.disabledModules.includes(m.key);
            return (
              <label key={m.key} className={cn("flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0", admin && "cursor-pointer hover:bg-hover")}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{m.label[locale]}</span>
                  <span className="block text-xs text-subtle">{m.hint[locale]}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  disabled={!admin}
                  onClick={() => toggle(m.key)}
                  className={cn("relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-emerald-500" : "bg-border-strong")}
                >
                  <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition", on ? "left-[18px]" : "left-0.5")} />
                </button>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[15px] font-semibold">{tr({ fr: "Site web", en: "Website" })}</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            patch({ websiteDomain: domain ?? ws.websiteDomain });
          }}
        >
          <Input value={domain ?? ws.websiteDomain ?? ""} onChange={(e) => setDomain(e.target.value)} placeholder="exemple.com" disabled={!admin} />
          <Button disabled={!admin}>{tr({ fr: "Enregistrer", en: "Save" })}</Button>
        </form>
        <p className="mt-2 text-xs text-subtle">
          {tr({ fr: "Le contenu publié (articles, réalisations, équipe) de cet espace est servi par l'API publique pour ce domaine (?site=", en: "Published content of this workspace is served by the public API for this domain (?site=" })}
          {ws.websiteDomain ?? "…"}).
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-[15px] font-semibold">{tr({ fr: "Membres", en: "Members" })}</h3>
        <p className="mb-3 text-[13px] text-muted">
          {tr({ fr: "Adresse précise ou domaine entier (*@otopio.ca). Les admins gèrent les accès et les onglets.", en: "Exact address or whole domain (*@otopio.ca). Admins manage access and tabs." })}
        </p>
        {admin && (
          <form
            className="mb-3 flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api(`/workspaces/${ws.id}/members`, { method: "POST", json: { email, role } });
                setEmail("");
                qc.invalidateQueries({ queryKey: ["ws-members", ws.id] });
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@gmail.com" className="min-w-0 flex-1" />
            <select value={role} onChange={(e) => setRole(e.target.value as Member["role"])} className="h-8 rounded-lg border border-border bg-surface px-2 text-[13px]">
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label[locale]}
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={!email}>
              <UserPlus /> {tr({ fr: "Ajouter", en: "Add" })}
            </Button>
          </form>
        )}
        <div className="overflow-hidden rounded-xl border border-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.email}</span>
              {admin ? (
                <select
                  value={m.role}
                  onChange={async (e) => {
                    try {
                      await api(`/workspaces/${ws.id}/members/${m.id}`, { method: "PATCH", json: { role: e.target.value } });
                      qc.invalidateQueries({ queryKey: ["ws-members", ws.id] });
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                  className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label[locale]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted">{ROLES.find((r) => r.value === m.role)?.label[locale]}</span>
              )}
              {admin && (
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-rose-600"
                  title={tr({ fr: "Retirer", en: "Remove" })}
                  onClick={async () => {
                    try {
                      await api(`/workspaces/${ws.id}/members/${m.id}`, { method: "DELETE" });
                      qc.invalidateQueries({ queryKey: ["ws-members", ws.id] });
                    } catch (err) {
                      toast.error((err as Error).message);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
