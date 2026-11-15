/**
 * Organize every Otopio mailbox: labels, archive newsletters/notifications, create Gmail filters.
 * Never deletes anything. Idempotent: re-running only adds missing labels and recreates ERP filters.
 *
 *   GOOGLE_SERVICE_ACCOUNT_FILE=sa.json ERP_URL=https://erp.otopio.ca ERP_EMAIL=… ERP_PASSWORD=… bun scripts/gmail-organize.ts [--dry]
 */
import { addresses, gmail, header, pool, type GmailLabel } from "@erp/google";

const DRY = process.argv.includes("--dry");
const FILTERS_ONLY = process.argv.includes("--filters-only");
const USERS = (process.env.MAILBOXES ?? "sami@otopio.ca,contact@otopio.ca,maissane@otopio.ca,noah@otopio.ca").split(",");
const SINCE = process.env.SINCE ?? ""; // e.g. "after:2026/11/01" for incremental runs

/* ------------------------------------------------------------------ */
/*  ERP context (clients, prospects, partners, suppliers)             */
/* ------------------------------------------------------------------ */
async function erp() {
  const base = process.env.ERP_URL!;
  const login = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email: process.env.ERP_EMAIL ?? "sami@otopio.ca", password: process.env.ERP_PASSWORD }),
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const get = async (t: string) => ((await (await fetch(`${base}/api/data/${t}?limit=2000`, { headers: { cookie } })).json()) as { rows: Record<string, any>[] }).rows;
  return { orgs: await get("organization"), people: await get("person") };
}

const GENERIC = new Set(["gmail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "yahoo.com", "yahoo.fr", "live.fr", "live.com", "free.fr", "icloud.com", "me.com", "orange.fr", "sfr.fr", "videotron.ca"]);
const host = (u?: string | null) => (u ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
const base2 = (d: string) => d.split(".").slice(-2).join(".");

const GOV = ["revenuquebec.ca", "canada.ca", "gc.ca", "gouv.qc.ca", "quebec.ca", "impots.gouv.fr", "urssaf.fr", "gouv.fr", "infogreffe.fr", "inpi.fr", "registreentreprises.gouv.qc.ca", "servicesquebec.gouv.qc.ca"];
const LEGAL = ["groupetcj.ca", "gplegal.com", "forsetiavocats.ca", "blue-hf.com", "docusign.net", "opensignlabs.com", "umontreal.ca"];
const BANK = ["qonto.com", "desjardins.com", "rbc.com", "bnc.ca", "td.com", "stripe.com", "wise.com", "paypal.com", "interac.ca", "payments.interac.ca", "shine.fr", "revolut.com"];
const SAAS = [
  "google.com", "github.com", "vercel.com", "cloudflare.com", "notion.so", "notion.com", "figma.com", "atlassian.com", "atlassian.net", "openai.com", "anthropic.com", "cursor.com", "cursor.sh",
  "neon.tech", "posthog.com", "airtable.com", "apple.com", "ovh.com", "ovhcloud.com", "firebase.google.com", "supabase.com", "supabase.io", "resend.com", "dokploy.com", "jetbrains.com", "slack.com",
  "linear.app", "canva.com", "hostinger.com", "godaddy.com", "namecheap.com", "zoom.us", "calendly.com", "indy.fr", "intuit.com", "quickbooks.com", "rapidapi.com", "expo.dev", "sentry.io", "docker.com",
  "digitalocean.com", "heroku.com", "netlify.com", "mongodb.com", "twilio.com", "sendgrid.net", "mailchimp.com", "hubspot.com", "webflow.com", "framer.com", "wix.com", "shopify.com", "squarespace.com",
  "microsoft.com", "office.com", "adobe.com", "dropbox.com", "loom.com", "miro.com", "clickup.com", "monday.com", "zapier.com", "make.com", "n8n.io", "railway.app", "render.com", "fly.io",
];
const HR = /\b(stage|stagiaire|recrutement|candidature|fiche de paie|paie|payroll|contrat de travail|offre d'emploi|mitacs|permis de travail)\b/i;
const INVOICE = /\b(facture|invoice|receipt|reçu|re[çc]u de paiement|payment (received|confirmation|receipt)|votre paiement|billing|abonnement|subscription|renews|renouvel|order confirmation|commande)\b/i;
const AUTOMATED = /(no-?reply|do-?not-?reply|ne-?pas-?repondre|nepasrepondre|notifications?@|notify@|mailer@|alerts?@|updates?@|info@e\.|news@|newsletter|bounce|postmaster|calendar-notification|drive-shares)/i;
const domainIn = (d: string, list: string[]) => list.some((x) => d === x || d.endsWith(`.${x}`));

type Group = { label: string; color?: { backgroundColor: string; textColor: string } };
const COLORS = {
  client: { backgroundColor: "#16a766", textColor: "#ffffff" },
  prospect: { backgroundColor: "#4a86e8", textColor: "#ffffff" },
  partner: { backgroundColor: "#a479e2", textColor: "#ffffff" },
  finance: { backgroundColor: "#ffad47", textColor: "#ffffff" },
  admin: { backgroundColor: "#e66550", textColor: "#ffffff" },
  tools: { backgroundColor: "#cccccc", textColor: "#000000" },
  noise: { backgroundColor: "#c2c2c2", textColor: "#000000" },
};

async function main() {
  const { orgs, people } = await erp();
  // email/domain -> org
  const byEmail = new Map<string, Record<string, any>>();
  const byDomain = new Map<string, Record<string, any>>();
  for (const o of orgs) {
    if (o.type === "internal") continue;
    for (const d of [host(o.website), (o.email ?? "").split("@")[1] ?? ""].map((x) => x.toLowerCase()).filter(Boolean)) if (!GENERIC.has(d)) byDomain.set(d, o);
  }
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  for (const p of people) {
    const o = p.organizationId ? orgById.get(p.organizationId) : null;
    if (!p.email || !o || o.type === "internal") continue;
    const e = String(p.email).toLowerCase();
    byEmail.set(e, o);
    const d = e.split("@")[1]!;
    if (!GENERIC.has(d) && !d.endsWith("otopio.ca") && !byDomain.has(d)) byDomain.set(d, o);
  }
  const orgFor = (e: string) => byEmail.get(e) ?? byDomain.get(e.split("@")[1]!) ?? byDomain.get(base2(e.split("@")[1]!));
  const clean = (s: string) => s.replace(/[\/]/g, "-").trim();
  const orgLabel = (o: Record<string, any>): Group | null => {
    if (o.type === "client") return { label: `Clients/${clean(o.name)}`, color: COLORS.client };
    if (o.type === "lead") return { label: "Prospects", color: COLORS.prospect };
    if (o.type === "partner") return { label: "Partenaires", color: COLORS.partner };
    return null;
  };

  const report: Record<string, Record<string, number>> = {};

  for (const user of USERS) {
    const stats: Record<string, number> = { threads: 0, archived: 0 };
    report[user] = stats;
    const existing = await gmail.labels(user);
    const labelIds = new Map(existing.map((l) => [l.name, l.id]));
    const ensure = async (g: Group) => {
      const parts = g.label.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const name = parts.slice(0, i).join("/");
        if (!labelIds.has(name)) {
          if (DRY) labelIds.set(name, `dry:${name}`);
          else {
            try {
              const l: GmailLabel = await gmail.createLabel(user, name, g.color).catch(() => gmail.createLabel(user, name));
              labelIds.set(name, l.id);
            } catch {
              // already exists (409) → reload
              for (const l of await gmail.labels(user)) labelIds.set(l.name, l.id);
            }
          }
        }
      }
      return labelIds.get(g.label)!;
    };

    const threads = FILTERS_ONLY ? [] : await gmail.listThreads(user, `-in:spam -in:trash -in:chats ${SINCE}`.trim());
    stats.threads = threads.length;
    const plan: { id: string; labels: Group[]; archive: boolean }[] = [];

    await pool(threads, 4, async (tid) => {
      const t = await gmail.thread(user, tid);
      const msgs = t.messages ?? [];
      const parts = new Set<string>();
      let subjects = "";
      let anyUnsub = false;
      let fromOtopio = false;
      let allAutomated = true;
      const sysLabels = new Set<string>();
      for (const m of msgs) {
        const from = addresses(header(m, "From"));
        from.forEach((x) => parts.add(x));
        addresses(`${header(m, "To")} ${header(m, "Cc")}`).forEach((x) => parts.add(x));
        subjects += ` ${header(m, "Subject")} ${m.snippet ?? ""}`;
        if (header(m, "List-Unsubscribe") || header(m, "List-Id")) anyUnsub = true;
        if (from.some((f) => f.endsWith("@otopio.ca"))) fromOtopio = true;
        if (!from.every((f) => AUTOMATED.test(f))) allAutomated = false;
        (m.labelIds ?? []).forEach((l) => sysLabels.add(l));
      }
      const ext = [...parts].filter((p) => !p.endsWith("@otopio.ca"));
      const labels: Group[] = [];
      for (const e of ext) {
        const o = orgFor(e);
        const g = o && orgLabel(o);
        if (g && !labels.some((x) => x.label === g.label)) labels.push(g);
      }
      const domains = ext.map((e) => e.split("@")[1]!);
      const businessHit = labels.length > 0;
      if (domains.some((d) => domainIn(d, GOV))) labels.push({ label: "Admin/Gouvernement & taxes", color: COLORS.admin });
      if (domains.some((d) => domainIn(d, LEGAL)) || /\b(NDA|mise en demeure|avocat|juridique|cession de propriété|convention de mandat)\b/i.test(subjects))
        labels.push({ label: "Admin/Juridique", color: COLORS.admin });
      if (HR.test(subjects)) labels.push({ label: "Admin/RH", color: COLORS.admin });
      if (domains.some((d) => domainIn(d, BANK))) labels.push({ label: "Finance/Banque", color: COLORS.finance });
      const invoice = INVOICE.test(subjects);
      if (invoice && fromOtopio && businessHit && labels.some((l) => l.label.startsWith("Clients/"))) labels.push({ label: "Finance/Factures clients", color: COLORS.finance });
      else if (invoice && !businessHit && (allAutomated || domains.some((d) => domainIn(d, SAAS) || domainIn(d, BANK))))
        labels.push({ label: "Finance/Factures fournisseurs", color: COLORS.finance });
      const saas = domains.some((d) => domainIn(d, SAAS));
      if (saas && !businessHit) labels.push({ label: "Outils & SaaS", color: COLORS.tools });

      const promo = sysLabels.has("CATEGORY_PROMOTIONS") || sysLabels.has("CATEGORY_SOCIAL") || domains.some((d) => d.endsWith("linkedin.com"));
      const important = labels.some((l) => /^(Clients|Prospects|Partenaires|Admin|Finance)/.test(l.label));
      let archive = false;
      if (!important && !fromOtopio && (promo || (anyUnsub && !allAutomated) || (anyUnsub && /newsletter|webinar|webinaire|digest|news/i.test(subjects)))) {
        labels.push({ label: "Newsletters", color: COLORS.noise });
        archive = true;
      } else if (!important && allAutomated && ext.length > 0) {
        labels.push({ label: "Notifications", color: COLORS.noise });
        archive = true;
      }
      if (labels.length) plan.push({ id: tid, labels, archive: archive && sysLabels.has("INBOX") });
    });

    // Create labels sequentially first (avoids 409 races), then apply in parallel
    for (const g of new Map(plan.flatMap((p) => p.labels).map((g) => [g.label, g] as const)).values()) await ensure(g);
    await pool(plan, 3, async (p) => {
      const ids = [];
      for (const g of p.labels) ids.push(await ensure(g));
      for (const g of p.labels) stats[g.label.split("/")[0] === "Clients" ? `Clients/*` : g.label] = (stats[g.label.split("/")[0] === "Clients" ? `Clients/*` : g.label] ?? 0) + 1;
      if (p.archive) stats.archived!++;
      if (!DRY) await gmail.modifyThread(user, p.id, ids, p.archive ? ["INBOX"] : []);
    });

    /* ---------------------------- filters ---------------------------- */
    const ours = new Set([...labelIds.entries()].filter(([n]) => /^(Clients|Prospects|Partenaires|Finance|Admin|Outils & SaaS|Newsletters|Notifications)/.test(n)).map(([, id]) => id));
    if (!DRY) for (const f of await gmail.filters(user)) if ((f.action.addLabelIds as string[] | undefined)?.some((l) => ours.has(l))) await gmail.deleteFilter(user, f.id);
    const filters: { q: string; g: Group; skipInbox?: boolean }[] = [];
    const groups = new Map<string, { g: Group; keys: Set<string> }>();
    const addKey = (g: Group, key: string) => {
      if (!groups.has(g.label)) groups.set(g.label, { g, keys: new Set() });
      groups.get(g.label)!.keys.add(key);
    };
    for (const [d, o] of byDomain) {
      const g = orgLabel(o);
      if (g) addKey(g, d);
    }
    for (const [e, o] of byEmail) {
      const g = orgLabel(o);
      if (g && GENERIC.has(e.split("@")[1]!)) addKey(g, e);
    }
    for (const { g, keys } of groups.values()) {
      const k = [...keys];
      for (let i = 0; i < k.length; i += 12) {
        const chunk = k.slice(i, i + 12).join(" OR ");
        filters.push({ q: `{from:(${chunk}) to:(${chunk}) cc:(${chunk})}`, g });
      }
    }
    filters.push({ q: `from:(${GOV.join(" OR ")})`, g: { label: "Admin/Gouvernement & taxes", color: COLORS.admin } });
    filters.push({ q: `from:(${LEGAL.join(" OR ")})`, g: { label: "Admin/Juridique", color: COLORS.admin } });
    filters.push({ q: `from:(${BANK.join(" OR ")})`, g: { label: "Finance/Banque", color: COLORS.finance } });
    filters.push({ q: `subject:(facture OR invoice OR receipt OR reçu OR "payment received" OR "votre paiement") -from:otopio.ca`, g: { label: "Finance/Factures fournisseurs", color: COLORS.finance } });
    for (let i = 0; i < SAAS.length; i += 20) filters.push({ q: `from:(${SAAS.slice(i, i + 20).join(" OR ")})`, g: { label: "Outils & SaaS", color: COLORS.tools } });
    filters.push({ q: `{category:promotions category:social from:linkedin.com}`, g: { label: "Newsletters", color: COLORS.noise }, skipInbox: true });
    filters.push({
      q: `from:(noreply OR no-reply OR donotreply OR notifications OR notification OR notify OR nepasrepondre) -subject:(facture OR invoice OR receipt OR reçu OR sécurité OR security)`,
      g: { label: "Notifications", color: COLORS.noise },
      skipInbox: true,
    });
    let nf = 0;
    for (const f of filters) {
      const id = await ensure(f.g);
      if (!DRY) await gmail.createFilter(user, { query: f.q }, { addLabelIds: [id], ...(f.skipInbox ? { removeLabelIds: ["INBOX"] } : {}) }).catch((e) => console.warn(user, "filter", f.g.label, (e as Error).message.slice(0, 140)));
      nf++;
    }
    stats.filters = nf;
    console.log(user, JSON.stringify(stats));
  }
  await Bun.write(process.env.REPORT ?? "gmail-report.json", JSON.stringify(report, null, 2));
}

await main();
