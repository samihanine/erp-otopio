/**
 * Client portal: /portail (sign-in: magic link or Google), /portail/app (client list), /portail/c/:id (read-only client view).
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, LogOut, MailCheck } from "lucide-react";
import { api } from "@/lib/api";
import { authClient, signIn, signOut } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ClientView, type Overview } from "./clients";

type PortalMe = { email: string; name: string; member: boolean; clients: { id: string; name: string; logoUrl: string | null; wsName: string; wsColor: string }[] };

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

/** Magic-link + Google sign-in, shared by the team login and the client portal. */
export function MagicLinkForm({ callbackURL, defaultEmail = "", dark = false }: { callbackURL: string; defaultEmail?: string; dark?: boolean }) {
  const { tr } = useI18n();
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (sent)
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <MailCheck className="size-8 text-emerald-600" />
        <div className="text-[15px] font-semibold">{tr({ fr: "Vérifie ta boîte de réception", en: "Check your inbox" })}</div>
        <p className="text-[13px] text-muted">
          {tr({ fr: `Un lien de connexion a été envoyé à ${email}. Il est valable 15 minutes.`, en: `A sign-in link was sent to ${email}. It is valid for 15 minutes.` })}
        </p>
        <button type="button" onClick={() => setSent(false)} className="mt-2 text-xs text-muted underline hover:text-fg">
          {tr({ fr: "Utiliser une autre adresse", en: "Use another address" })}
        </button>
      </div>
    );
  return (
    <div className={dark ? "" : ""}>
      <Button size="lg" variant="secondary" className="w-full" onClick={() => signIn.social({ provider: "google", callbackURL, errorCallbackURL: `${location.pathname}?error=1` })}>
        <GoogleG /> {tr({ fr: "Continuer avec Google", en: "Continue with Google" })}
      </Button>
      <div className="my-4 flex items-center gap-3 text-xs text-subtle">
        <span className="h-px flex-1 bg-border" /> {tr({ fr: "ou par courriel", en: "or by email" })} <span className="h-px flex-1 bg-border" />
      </div>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError(null);
          const res = await authClient.signIn.magicLink({ email, callbackURL, errorCallbackURL: `${location.pathname}?error=1` });
          setLoading(false);
          if (res.error) setError(res.error.message ?? tr({ fr: "Envoi impossible", en: "Could not send" }));
          else setSent(true);
        }}
      >
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr({ fr: "ton@courriel.com", en: "you@company.com" })} className="h-10" />
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</div>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
          {loading ? "…" : tr({ fr: "Recevoir un lien de connexion", en: "Email me a sign-in link" })} <ArrowRight />
        </Button>
      </form>
    </div>
  );
}

export function PortalLoginPage() {
  const { tr } = useI18n();
  const params = new URLSearchParams(location.search);
  const err = params.get("error");
  return (
    <div className="grid min-h-full place-items-center bg-surface-2/60 px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-navy text-white">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-[24px] font-semibold tracking-tight">{tr({ fr: "Espace client", en: "Client portal" })}</h1>
          <p className="mt-1 text-[13px] text-muted">{tr({ fr: "Suivi de tes projets, devis, factures et fichiers.", en: "Your projects, quotes, invoices and files." })}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {err && (
            <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {tr({ fr: "Connexion impossible : cette adresse n'a pas d'accès. Demande une invitation à ton contact.", en: "Sign-in failed: this address has no access. Ask your contact for an invitation." })}
            </div>
          )}
          <MagicLinkForm callbackURL="/portail/app" defaultEmail={params.get("email") ?? ""} />
        </div>
        <p className="mt-4 text-center text-xs text-subtle">
          {tr({ fr: "Pas de mot de passe : un lien sécurisé t'est envoyé à chaque connexion.", en: "No password: a secure link is emailed at each sign-in." })}
        </p>
      </div>
    </div>
  );
}

function PortalShell({ children, me, title }: { children: React.ReactNode; me?: PortalMe; title?: string }) {
  const { tr } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-8">
        <Link to="/portail/app" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-navy text-white">
            <Building2 className="size-4" />
          </span>
          <span className="text-[14px] font-semibold">{tr({ fr: "Espace client", en: "Client portal" })}</span>
        </Link>
        {title && <span className="truncate text-[14px] text-muted max-sm:hidden">/ {title}</span>}
        <div className="ml-auto flex items-center gap-2">
          {me?.member && (
            <a href="/" className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-hover">
              {tr({ fr: "Ouvrir l'ERP", en: "Open the ERP" })}
            </a>
          )}
          <span className="truncate text-xs text-muted max-sm:hidden">{me?.email}</span>
          <button
            type="button"
            title={tr({ fr: "Se déconnecter", en: "Sign out" })}
            onClick={async () => {
              await signOut();
              navigate({ to: "/portail" });
            }}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

const usePortalMe = () => useQuery({ queryKey: ["portal-me"], queryFn: () => api<PortalMe>("/portal/me") });

export function PortalHomePage() {
  const { tr } = useI18n();
  const navigate = useNavigate();
  const { data: me, isLoading } = usePortalMe();
  if (me && me.clients.length === 1) {
    navigate({ to: "/portail/c/$id", params: { id: me.clients[0]!.id }, replace: true });
    return null;
  }
  return (
    <PortalShell me={me}>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-[24px] font-semibold tracking-tight">{tr({ fr: "Tes espaces", en: "Your spaces" })}</h1>
        {isLoading && <Skeleton className="mt-6 h-32" />}
        <div className="mt-6 space-y-2">
          {me?.clients.map((c) => (
            <Link key={c.id} to="/portail/c/$id" params={{ id: c.id }} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 hover:bg-hover">
              <span className="grid size-9 place-items-center rounded-lg bg-surface-2 text-sm font-semibold">{c.name[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted">{c.wsName}</span>
              </span>
              <ArrowRight className="size-4 text-subtle" />
            </Link>
          ))}
          {me && !me.clients.length && (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted">
              {me.member ? (
                <>
                  {tr({ fr: "Aucun espace client pour cette adresse.", en: "No client space for this address." })}{" "}
                  <a href="/" className="underline">
                    {tr({ fr: "Ouvrir l'ERP", en: "Open the ERP" })}
                  </a>
                </>
              ) : (
                tr({ fr: "Aucun espace client pour cette adresse. Demande une invitation à ton contact.", en: "No client space for this address. Ask your contact for an invitation." })
              )}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

export function PortalClientPage() {
  const { id } = useParams({ from: "/portail/c/$id" });
  const { data: me } = usePortalMe();
  const { data, isLoading, error } = useQuery({ queryKey: ["portal-client", id], queryFn: () => api<Overview>(`/portal/clients/${id}`) });
  return (
    <PortalShell me={me} title={data?.org.name}>
      {isLoading && <Skeleton className="m-8 h-96" />}
      {error && <div className="p-8 text-[13px] text-muted">{(error as Error).message}</div>}
      {data && <ClientView data={data} id={id} mode="portal" />}
    </PortalShell>
  );
}
