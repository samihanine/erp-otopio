import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lock } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtopioLogo } from "@/components/layout/logo";

export function LoginPage() {
  const { tr } = useI18n();
  const navigate = useNavigate();
  const { next } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: providers } = useQuery({ queryKey: ["providers"], queryFn: () => api<{ google: boolean; password: boolean }>("/auth/providers") });
  const err = new URLSearchParams(location.search).get("error");
  useEffect(() => {
    if (err) setError(tr({ fr: "Connexion refusée : seuls les comptes @otopio.ca sont autorisés.", en: "Sign-in refused: only @otopio.ca accounts are allowed." }));
  }, [err, tr]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) setError(res.error.message ?? "Erreur");
    else if (next?.startsWith("/api/")) window.location.href = next;
    else navigate({ to: next ?? "/" });
  };

  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden bg-[#0a1430] px-4">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(60% 50% at 50% 0%, #1c3266 0%, transparent 70%), radial-gradient(40% 40% at 85% 90%, #243b73 0%, transparent 70%)" }} />
      <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full border border-white/5" />
      <div className="pointer-events-none absolute -right-20 -top-56 size-[520px] rounded-full border border-white/5" />
      <div className="relative w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center text-white">
          <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-[#3b82f6] to-[#1d4ed8] shadow-[0_10px_30px_-10px_rgb(59_130_246/.8)]">
            <OtopioLogo className="size-8" />
          </div>
          <h1 className="font-serif text-[40px] italic leading-none">otopio</h1>
          <p className="mt-2 text-[13px] text-[#a9bbe6]">{tr({ fr: "ERP — clients, projets, finances & contenus", en: "ERP — clients, projects, finance & content" })}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl dark:bg-surface">
          {providers?.google && (
            <>
              <Button size="lg" variant="secondary" className="w-full" onClick={() => signIn.social({ provider: "google", callbackURL: next ?? "/", errorCallbackURL: "/login" })}>
                <svg viewBox="0 0 24 24" className="size-4"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/></svg>
                {tr({ fr: "Continuer avec Google Workspace", en: "Continue with Google Workspace" })}
              </Button>
              <div className="my-4 flex items-center gap-3 text-xs text-subtle">
                <span className="h-px flex-1 bg-border" /> {tr({ fr: "ou", en: "or" })} <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">{tr({ fr: "Courriel", en: "Email" })}</span>
              <Input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@otopio.ca" className="h-10" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">{tr({ fr: "Mot de passe", en: "Password" })}</span>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
            </label>
            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</div>}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
              {loading ? "…" : tr({ fr: "Se connecter", en: "Sign in" })} <ArrowRight />
            </Button>
          </form>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-subtle">
            <Lock className="size-3" /> {tr({ fr: "Accès réservé à l'équipe Otopio", en: "Restricted to the Otopio team" })}
          </p>
        </div>
      </div>
    </div>
  );
}
