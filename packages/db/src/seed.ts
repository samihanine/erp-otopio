/**
 * Initial data set, consolidated from the legacy Airtable base, the Otopio
 * shared Drive (invoices / receipts) and Gmail threads (read-only).
 *
 *   bun src/seed.ts            → seeds only if the DB is empty
 *   SEED_RESET=1 bun src/seed.ts → wipes business tables first
 */
import { sql as rawSql } from "drizzle-orm";
import { db, sql } from "./index";
import * as s from "./schema";
import type { DocumentLine, TaxRate } from "./schema";

const r2 = (n: number) => Math.round(n * 100) / 100;
let lineSeq = 0;
const line = (description: string, unitPrice: number, quantity = 1, details?: string): DocumentLine => ({
  id: `l${++lineSeq}`,
  description,
  details,
  quantity,
  unitPrice,
});
function totals(lines: DocumentLine[], taxes: TaxRate[]) {
  const subtotal = r2(lines.reduce((acc, l) => acc + l.quantity * l.unitPrice - (l.discount ?? 0), 0));
  const applied = taxes.map((t) => ({ ...t, amount: r2(subtotal * t.rate) }));
  const taxTotal = r2(applied.reduce((a, t) => a + t.amount, 0));
  return { lines, taxes: applied, subtotal, taxTotal, total: r2(subtotal + taxTotal) };
}

const TVA_FR: TaxRate[] = [{ code: "TVA", label: "TVA", rate: 0.2 }];
const TAX_QC: TaxRate[] = [
  { code: "TPS", label: "TPS", rate: 0.05 },
  { code: "TVQ", label: "TVQ", rate: 0.09975 },
];

const BUSINESS_TABLES = [
  "activity",
  "saved_view",
  "file",
  "document",
  "post",
  "article",
  "transaction",
  "quote",
  "communication",
  "ticket",
  "task",
  "project",
  "person",
  "organization",
  "legal_entity",
];

/** Personal freelance activities (travailleurs autonomes, QC) — small suppliers exempt from GST/QST. */
export const FREELANCE_ENTITIES = [
  {
    code: "SHF",
    name: "Sami Freelance Canada",
    legalName: "Sami Hanine",
    legalForm: "Travailleur autonome (Québec)",
    country: "CA",
    currency: "CAD",
    addressLine1: "4130-425 rue de la Montagne",
    postalCode: "H3C 0J9",
    city: "Montréal",
    region: "QC",
    email: "sami.hanine22@gmail.com",
    phone: "+1 (514) 430-5919",
    taxIds: [] as { label: string; value: string }[],
    defaultTaxes: [],
    bankDetails: [{ label: "Méthode", value: "Virement Interac" }, { label: "Courriel", value: "sami.hanine22@gmail.com" }],
    paymentTerms: "Payable dans les 30 jours suivant la date d'émission.",
    legalMentions: "Petit fournisseur — non inscrit aux fichiers de la TPS et de la TVQ (revenus annuels inférieurs à 30 000 $). Aucune taxe facturée.",
    invoicePrefix: "SH-{YYYY}-",
    quotePrefix: "SH-D{YYYY}-",
    nextInvoiceNumber: 1,
    nextQuoteNumber: 1,
    accountingProvider: "none" as const,
    color: "#0f766e",
  },
  {
    code: "MTF",
    name: "Maïssane Freelance Canada",
    legalName: "Maïssane Touati",
    legalForm: "Travailleuse autonome (Québec)",
    country: "CA",
    currency: "CAD",
    addressLine1: "425 rue de la Montagne",
    postalCode: "H3C 0J9",
    city: "Montréal",
    region: "QC",
    email: "contact@otopio.net",
    phone: "+1 (514) 565-1701",
    taxIds: [] as { label: string; value: string }[],
    defaultTaxes: [],
    bankDetails: [{ label: "Méthode", value: "Virement Interac" }],
    paymentTerms: "Payable dans les 30 jours suivant la date d'émission.",
    legalMentions: "Petit fournisseur — non inscrite aux fichiers de la TPS et de la TVQ (revenus annuels inférieurs à 30 000 $). Aucune taxe facturée.",
    invoicePrefix: "MT-{YYYY}-",
    quotePrefix: "MT-D{YYYY}-",
    nextInvoiceNumber: 1,
    nextQuoteNumber: 1,
    accountingProvider: "none" as const,
    color: "#be185d",
  },
];

async function main() {
  if (process.env.SEED_RESET === "1") {
    console.log("[seed] reset business tables");
    await db.execute(rawSql.raw(`TRUNCATE ${BUSINESS_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));
  } else {
    const existing = await db.select({ id: s.legalEntity.id }).from(s.legalEntity).limit(1);
    if (existing.length) {
      console.log("[seed] database already seeded — skipping (use SEED_RESET=1 to force)");
      return;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Billing structures                                                */
  /* ------------------------------------------------------------------ */
  const [mgs, otp] = await db
    .insert(s.legalEntity)
    .values([
      {
        code: "MGS",
        name: "Megascale",
        legalName: "MEGASCALE TECHNOLOGIE",
        legalForm: "SARL",
        country: "FR",
        currency: "EUR",
        addressLine1: "3 Rue des Bintinais, Centre d'Affaires le Hil",
        postalCode: "35230",
        city: "Noyal-Châtillon-sur-Seiche",
        email: "megascale.technologie@gmail.com",
        registrationNumber: "SIRET 104 284 823 00010",
        taxIds: [{ label: "SIREN", value: "104284823" }],
        defaultTaxes: TVA_FR,
        bankDetails: [
          { label: "Bénéficiaire", value: "MEGASCALE TECHNOLOGIE" },
          { label: "Banque", value: "Qonto" },
          { label: "BIC", value: "QNTOFRP1XXX" },
          { label: "IBAN", value: "FR76 1695 8000 0126 4006 2561 031" },
        ],
        paymentTerms: "Paiement par virement bancaire à réception de facture (échéance indiquée).",
        legalMentions:
          "Pas d'escompte accordé pour paiement anticipé. En cas de non-paiement à la date d'échéance, des pénalités calculées à trois fois le taux d'intérêt légal seront appliquées. Tout retard de paiement entraînera une indemnité forfaitaire pour frais de recouvrement de 40 €.",
        invoicePrefix: "F-{YYYY}-",
        quotePrefix: "D-{YYYY}-",
        nextInvoiceNumber: 5,
        nextQuoteNumber: 3,
        accountingProvider: "qonto",
        color: "#5E398F",
      },
      {
        code: "OTP",
        name: "Otopio Inc.",
        legalName: "Otopio Inc.",
        legalForm: "Société par actions (Québec)",
        country: "CA",
        currency: "CAD",
        addressLine1: "425 rue de la Montagne",
        postalCode: "H3C 0J9",
        city: "Montréal",
        region: "QC",
        email: "contact@otopio.ca",
        phone: "+1 (514) 565-1701",
        taxIds: [
          { label: "TPS", value: "706439361 RT0001" },
          { label: "TVQ", value: "1233433612 TQ0001" },
        ],
        defaultTaxes: TAX_QC,
        bankDetails: [
          { label: "Méthode", value: "Virement Interac" },
          { label: "Courriel", value: "contact@otopio.ca" },
        ],
        paymentTerms: "Payable dans les 30 jours suivant la date d'émission.",
        invoicePrefix: "OTP-{YYYY}-",
        quotePrefix: "DEV-{YYYY}-",
        nextInvoiceNumber: 1,
        nextQuoteNumber: 1,
        accountingProvider: "quickbooks",
        color: "#1c3266",
      },
      ...FREELANCE_ENTITIES,
    ])
    .returning();
  if (!mgs || !otp) throw new Error("entities not created");

  /* ------------------------------------------------------------------ */
  /*  Organizations                                                     */
  /* ------------------------------------------------------------------ */
  type OrgIn = typeof s.organization.$inferInsert;
  const orgRows: (OrgIn & { key: string })[] = [
    { key: "otopio", name: "Otopio", type: "internal", status: "active", website: "https://otopio.ca", email: "contact@otopio.ca", city: "Montréal", country: "CA", defaultEntityId: otp.id, industry: "Agence TI — IA, logiciel, quantique" },
    // Clients
    { key: "theoasso", name: "ThéoAsso", legalName: "THEOASSO", type: "client", status: "active", website: "https://www.theoasso.com", addressLine1: "16 rue Cuvier", postalCode: "69006", city: "Lyon", country: "FR", registrationNumber: "992084020", vatNumber: "FR05992084020", defaultEntityId: mgs.id, industry: "Associatif", firstMetAt: "2026-05-06" },
    { key: "heeroo", name: "Heeroo", legalName: "9522-6452 Québec Inc.", type: "client", status: "active", website: "https://www.heeroo.com", city: "Montréal", country: "CA", defaultEntityId: otp.id, industry: "RH / Recrutement", notes: "Facture de régularisation HEE-0426-01 impayée — dossier suivi avec Groupe TCJ." },
    { key: "coordia", name: "Coordia", type: "client", status: "active", website: "https://coordia.ca", country: "CA", defaultEntityId: otp.id, industry: "Santé" },
    { key: "onball", name: "OnBall", type: "client", status: "active", website: "https://www.onball.fr", email: "admin@onball.fr", country: "FR", defaultEntityId: mgs.id, industry: "Sport" },
    { key: "assoinfo", name: "Asso.info", type: "client", status: "active", website: "https://asso.info", country: "FR", industry: "Associatif" },
    { key: "medicpub", name: "Medic.pub", type: "client", status: "active", website: "https://www.medic.pub/fr", country: "CA", defaultEntityId: otp.id, industry: "Médical" },
    { key: "hanagie", name: "Hanagie Production", type: "client", status: "active", website: "https://www.hannagie.com" },
    { key: "smog", name: "SMOG", legalName: "SMOG Inc.", type: "client", status: "active", email: "gestion@servicemecaniqueog.com", addressLine1: "128 rue de la Lagune", postalCode: "J0J 1E0", city: "Henryville", country: "CA", defaultEntityId: otp.id, industry: "Mécanique", firstMetAt: "2026-03-03" },
    { key: "mtaregion", name: "M ta région", type: "client", status: "active", website: "https://mtaregion.com", country: "CA", defaultEntityId: otp.id, industry: "Tourisme / Fidélité" },
    { key: "epik", name: "Epik Eats", type: "client", status: "active", country: "CA", defaultEntityId: otp.id, industry: "Restauration" },
    // Former clients
    ...["Drivite", "Obeo Biogas", "Voolta", "Immovia", "Click", "Oragius"].map((name) => ({ key: name, name, type: "client" as const, status: "former" as const })),
    { key: "tvl", name: "TVL Conseil", type: "client", status: "former", website: "https://www.tvlconseils.com/fr" },
    { key: "emergence", name: "Emergence Entreprise", type: "client", status: "former", website: "https://www.emergenceentreprise.com/" },
    { key: "piwwop", name: "Piwwop", type: "client", status: "former", website: "https://piwwop.com/" },
    { key: "nomie", name: "Nomie", type: "client", status: "former", website: "https://nomie.ca/" },
    { key: "paxeo", name: "Paxeo", type: "client", status: "former", website: "https://paxeo.ai/" },
    // Leads
    { key: "tealecom", name: "Tealecom", type: "lead", status: "lost", country: "CA", notes: "SOW Phase 1 TEA Platform non retenu (juin 2026). NDA signé." },
    { key: "logisante", name: "Logisanté", type: "lead", status: "prospect", country: "CA", industry: "Santé" },
    { key: "saasmairie", name: "SAAS Mairie", type: "lead", status: "prospect" },
    { key: "allymeno", name: "Allymeno", type: "lead", status: "prospect" },
    { key: "phygitags", name: "Phygitags", type: "lead", status: "no_contact" },
    { key: "senzu", name: "Senzu", type: "lead", status: "no_contact" },
    // Partners
    { key: "boreal", name: "Boréal Technologie", type: "partner", status: "active", website: "https://borealtechnologie.com", country: "CA", notes: "Apporteur d'affaires (SMOG)." },
    { key: "toundrigo", name: "Toundrigo", type: "partner", status: "active", country: "CA", notes: "Éditeur de l'application M ta région." },
    // Suppliers
    { key: "google", name: "Google Workspace", type: "supplier", status: "active", website: "https://workspace.google.com", tags: ["saas"] },
    { key: "anthropic", name: "Anthropic", type: "supplier", status: "active", website: "https://www.anthropic.com", tags: ["ia"] },
    { key: "ovh", name: "OVHcloud", type: "supplier", status: "active", website: "https://www.ovhcloud.com", tags: ["hébergement"] },
    { key: "rapidapi", name: "RapidAPI", type: "supplier", status: "active", website: "https://rapidapi.com", tags: ["api"] },
    { key: "intuit", name: "Intuit QuickBooks", type: "supplier", status: "active", website: "https://quickbooks.intuit.com", tags: ["comptabilité"] },
    { key: "qonto", name: "Qonto", type: "supplier", status: "active", website: "https://qonto.com", tags: ["banque"] },
    { key: "cloudflare", name: "Cloudflare", type: "supplier", status: "active", website: "https://cloudflare.com", tags: ["hébergement"] },
    { key: "tcj", name: "Groupe TCJ", type: "supplier", status: "active", website: "https://groupetcj.ca", tags: ["juridique"], notes: "Accompagnement facture impayée (dossier 9024093-1)." },
  ];
  const orgs = await db
    .insert(s.organization)
    .values(orgRows.map(({ key: _k, ...o }) => o))
    .returning({ id: s.organization.id, name: s.organization.name });
  const org: Record<string, string> = {};
  orgRows.forEach((o, i) => (org[o.key] = orgs[i]!.id));

  /* ------------------------------------------------------------------ */
  /*  People                                                            */
  /* ------------------------------------------------------------------ */
  type PersonIn = typeof s.person.$inferInsert;
  const peopleRows: (PersonIn & { key: string })[] = [
    { key: "sami", firstName: "Sami", lastName: "Hanine", email: "sami@otopio.ca", jobTitle: "Cofondateur — CTO", organizationId: org.otopio },
    { key: "maissane", firstName: "Maïssane", lastName: "Touati", email: "maissane@otopio.ca", jobTitle: "Cofondatrice — CEO", organizationId: org.otopio },
    { key: "mathilde", firstName: "Mathilde", lastName: "Goyenaga", email: "mathilde@otopio.ca", jobTitle: "Opérations", organizationId: org.otopio },
    { key: "noah", firstName: "Noah", lastName: "Blanchard", email: "noah@otopio.ca", jobTitle: "Développeur", organizationId: org.otopio },
    { key: "aisha", firstName: "Aïsha", lastName: "Gueye", jobTitle: "Marketing & communication", organizationId: org.otopio },
    { key: "stephane", firstName: "Stéphane", lastName: "Hamelin", email: "stephane@theoasso.com", jobTitle: "Fondateur", organizationId: org.theoasso, isPrimaryContact: true },
    { key: "benjamin", firstName: "Benjamin", lastName: "Callebaut", email: "finances@theoasso.com", jobTitle: "Finances", organizationId: org.theoasso },
    { key: "jonathan", firstName: "Jonathan", lastName: "Deschênes", email: "jonathan@heeroo.com", phone: "+1 514 585-2585", jobTitle: "Fondateur", organizationId: org.heeroo, isPrimaryContact: true },
    { key: "naminata", firstName: "Naminata", lastName: "Diarrassouba", email: "naminata@coordia.ca", jobTitle: "Direction produit & stratégie", organizationId: org.coordia, isPrimaryContact: true },
    { key: "vicky", firstName: "Vicky", lastName: "D'Amours", email: "vicky@coordia.ca", organizationId: org.coordia },
    { key: "paul", firstName: "Paul", lastName: "Gourdon", email: "paul@mtaregion.com", jobTitle: "Directeur", organizationId: org.mtaregion, isPrimaryContact: true },
    { key: "noemie", firstName: "Noémie", email: "noemie@mtaregion.com", organizationId: org.mtaregion },
    { key: "jc", firstName: "Jean-Christophe", lastName: "Viard", email: "jcviard@toundrigo.com", organizationId: org.toundrigo },
    { key: "olivier", firstName: "Olivier", lastName: "Goulet", email: "olivier@borealtechnologie.com", organizationId: org.boreal, isPrimaryContact: true },
    { key: "zachary", firstName: "Zachary", lastName: "Richard", email: "zachary@borealtechnologie.com", organizationId: org.boreal },
    { key: "larbi", firstName: "Larbi", lastName: "Bentaleb", organizationId: org.onball, isPrimaryContact: true },
    { key: "tarek", firstName: "Tarek", lastName: "Bentaleb", organizationId: org.onball },
    { key: "adel", firstName: "Adel", email: "adel@tealecom.com", organizationId: org.tealecom },
    { key: "dansu", firstName: "Dan", lastName: "Su", email: "dan@dansufoods.com", organizationId: org.epik },
    { key: "augustin", firstName: "Augustin", lastName: "Élie", email: "augustin.elie@groupetcj.ca", jobTitle: "Avocat", organizationId: org.tcj },
  ];
  const people = await db
    .insert(s.person)
    .values(peopleRows.map(({ key: _k, ...p }) => p))
    .returning({ id: s.person.id });
  const p: Record<string, string> = {};
  peopleRows.forEach((x, i) => (p[x.key] = people[i]!.id));

  /* ------------------------------------------------------------------ */
  /*  Projects                                                          */
  /* ------------------------------------------------------------------ */
  type ProjectIn = typeof s.project.$inferInsert;
  const projectRows: (ProjectIn & { key: string })[] = [
    { key: "theoasso", name: "Site web ThéoAsso", organizationId: org.theoasso, legalEntityId: mgs.id, leadId: p.maissane, status: "maintenance", priority: "high", startDate: "2026-05-06", dueDate: "2026-10-31", budget: 7600, currency: "EUR", progress: 90, websiteUrl: "https://www.theoasso.com", description: "Conception et développement du site theoasso.com, parcours de paiement, CMS et SEO/GEO." },
    { key: "onball", name: "Plateforme OnBall", organizationId: org.onball, legalEntityId: mgs.id, leadId: p.maissane, status: "in_progress", priority: "high", startDate: "2026-01-01", dueDate: "2026-04-01", currency: "EUR", progress: 100, websiteUrl: "https://onball.fr" },
    { key: "onball2", name: "OnBall — Phase 2", organizationId: org.onball, legalEntityId: mgs.id, leadId: p.maissane, status: "in_progress", priority: "medium", startDate: "2026-07-15", dueDate: "2026-12-15", budget: 5000, currency: "EUR", progress: 35 },
    { key: "heeroo", name: "CRM Heeroo v1 — Agent IA", organizationId: org.heeroo, legalEntityId: otp.id, leadId: p.sami, status: "delivered", priority: "high", startDate: "2025-10-01", dueDate: "2026-02-28", budget: 35500, currency: "CAD", progress: 100, websiteUrl: "http://crm.heeroo.com/" },
    { key: "coordiaSite", name: "Site web Coordia", organizationId: org.coordia, legalEntityId: otp.id, leadId: p.maissane, status: "delivered", startDate: "2026-02-18", dueDate: "2026-03-14", currency: "CAD", progress: 100, websiteUrl: "https://coordia.ca" },
    { key: "coordiaApp", name: "Plateforme Coordia", organizationId: org.coordia, legalEntityId: otp.id, leadId: p.sami, status: "in_progress", startDate: "2025-11-01", dueDate: "2026-03-01", currency: "CAD", progress: 80, websiteUrl: "https://dashboard.coordia.ca" },
    { key: "coordiaLp", name: "Landing page Coordia", organizationId: org.coordia, legalEntityId: otp.id, status: "delivered", currency: "CAD", progress: 100 },
    { key: "assoSite", name: "Site web Asso.info", organizationId: org.assoinfo, leadId: p.maissane, status: "in_progress", startDate: "2026-01-01", dueDate: "2026-02-26", currency: "EUR", progress: 85, websiteUrl: "https://asso.info" },
    { key: "assoApp", name: "Plateforme Asso.info", organizationId: org.assoinfo, leadId: p.sami, status: "in_progress", priority: "high", startDate: "2025-01-01", dueDate: "2026-03-31", currency: "EUR", progress: 75, websiteUrl: "https://dashboard.asso.info" },
    { key: "medic", name: "Plateforme Medic.pub v2", organizationId: org.medicpub, legalEntityId: otp.id, leadId: p.sami, status: "in_progress", startDate: "2025-12-01", dueDate: "2026-12-31", currency: "CAD", progress: 60, websiteUrl: "https://dashboard.medic.pub" },
    { key: "smog", name: "Site web SMOG", organizationId: org.smog, legalEntityId: otp.id, leadId: p.maissane, status: "in_progress", startDate: "2026-03-30", dueDate: "2026-06-30", budget: 3500, currency: "CAD", progress: 50 },
    { key: "mtaregion", name: "App M ta région — 11 tâches", organizationId: org.mtaregion, legalEntityId: otp.id, leadId: p.sami, status: "in_progress", priority: "high", startDate: "2026-07-29", dueDate: "2026-11-30", budget: 4900, currency: "CAD", progress: 70 },
    { key: "epik", name: "Modification site web Epik Eats", organizationId: org.epik, legalEntityId: otp.id, status: "delivered", startDate: "2026-03-06", dueDate: "2026-04-30", currency: "CAD", progress: 100 },
    { key: "otopioSite", name: "Site web Otopio v2", organizationId: org.otopio, legalEntityId: otp.id, leadId: p.sami, status: "in_progress", startDate: "2026-09-01", dueDate: "2026-12-15", currency: "CAD", progress: 65, websiteUrl: "https://otopio.ca", githubRepo: "otopio-org/landing" },
    { key: "pfe", name: "PFE Médical", organizationId: org.otopio, legalEntityId: otp.id, leadId: p.sami, status: "in_progress", startDate: "2026-06-01", currency: "CAD", progress: 55, githubRepo: "otopio-org/pfe" },
    { key: "erp", name: "ERP Otopio", organizationId: org.otopio, legalEntityId: otp.id, leadId: p.sami, status: "in_progress", priority: "high", startDate: "2026-11-14", dueDate: "2026-12-31", currency: "CAD", progress: 20, githubRepo: "samihanine/erp-otopio", websiteUrl: "https://erp.otopio.ca" },
    { key: "gestion", name: "Gestion Otopio", organizationId: org.otopio, legalEntityId: otp.id, status: "on_hold", currency: "CAD", progress: 10, description: "Tâches internes : administratif, subventions, recrutement, marketing." },
    { key: "bourse", name: "Bourse Pierre Péladeau", organizationId: org.otopio, legalEntityId: otp.id, status: "delivered", startDate: "2026-01-15", dueDate: "2026-02-13", currency: "CAD", progress: 100 },
  ];
  const projects = await db
    .insert(s.project)
    .values(projectRows.map(({ key: _k, ...x }) => x))
    .returning({ id: s.project.id });
  const pr: Record<string, string> = {};
  projectRows.forEach((x, i) => (pr[x.key] = projects[i]!.id));

  /* ------------------------------------------------------------------ */
  /*  Tasks (from Airtable "Tâches", normalised)                        */
  /* ------------------------------------------------------------------ */
  type TaskIn = typeof s.task.$inferInsert;
  const T = (title: string, project: string, extra: Partial<TaskIn> = {}): TaskIn => ({
    title,
    projectId: pr[project],
    ...extra,
    completedAt: extra.completedAt ?? (extra.status === "done" ? (extra.dueDate ?? extra.startDate ?? "2026-06-02") : null),
  });
  await db.insert(s.task).values([
    T("Améliorer la landing page", "assoSite", { assigneeId: p.maissane, status: "done", priority: "urgent", dueDate: "2026-02-27", labels: ["front-end"], estimateHours: 8, spentHours: 7 }),
    T("Corriger bug recherche", "assoApp", { assigneeId: p.sami, status: "done", dueDate: "2026-02-23", completedAt: "2026-02-22", labels: ["back-end"], estimateHours: 2, spentHours: 1.5 }),
    T("Simplifier l'interface du CRM", "heeroo", { assigneeId: p.sami, status: "done", priority: "urgent", startDate: "2026-02-10", dueDate: "2026-03-01", labels: ["front-end", "back-end", "devops"], estimateHours: 24, spentHours: 26 }),
    T("Tourner la vidéo de présentation", "bourse", { assigneeId: p.maissane, status: "done", priority: "urgent", dueDate: "2026-02-13", estimateHours: 8, spentHours: 10, labels: ["administratif"] }),
    T("Envoyer la vidéo OnBall", "onball", { assigneeId: p.maissane, status: "done", labels: ["administratif"] }),
    T("Payer Noah pour la mission OnBall", "onball", { assigneeId: p.maissane, status: "done", priority: "urgent", labels: ["administratif"] }),
    T("Suivi développeur externe (Zakaria B.)", "onball", { assigneeId: p.maissane, status: "done", priority: "high", labels: ["administratif"] }),
    T("Cadrage Phase 2 — cahier des charges", "onball2", { assigneeId: p.maissane, status: "done", startDate: "2026-07-01", dueDate: "2026-07-11", labels: ["produit"] }),
    T("Développement Phase 2 — modules prioritaires", "onball2", { assigneeId: p.noah, status: "in_progress", priority: "high", startDate: "2026-09-01", dueDate: "2026-11-30", estimateHours: 80, spentHours: 32, labels: ["front-end", "back-end"] }),
    T("Point app OnBall", "onball2", { assigneeId: p.maissane, status: "done", dueDate: "2026-10-29", labels: ["réunion"] }),
    T("Développer le site Coordia", "coordiaLp", { assigneeId: p.maissane, status: "done", labels: ["front-end"] }),
    T("Transfert du code Coordia", "coordiaSite", { assigneeId: p.sami, status: "todo", priority: "medium", dueDate: "2026-11-30", labels: ["devops"] }),
    T("Workflow trésorier — plusieurs commandes par courriel", "theoasso", { assigneeId: p.sami, status: "in_progress", priority: "high", startDate: "2026-10-03", dueDate: "2026-11-20", estimateHours: 10, spentHours: 6, labels: ["back-end"] }),
    T("Documentation et transfert du code sur le GitHub ThéoAsso", "theoasso", { assigneeId: p.sami, status: "todo", startDate: "2026-11-10", dueDate: "2026-11-28", estimateHours: 6, labels: ["devops"] }),
    T("Transfert de l'infrastructure (Vercel ou Infomaniak)", "theoasso", { assigneeId: p.sami, status: "backlog", startDate: "2026-11-24", dueDate: "2026-12-12", labels: ["devops"] }),
    T("Finaliser le CMS et le SEO / GEO", "theoasso", { assigneeId: p.maissane, status: "in_progress", startDate: "2026-10-15", dueDate: "2026-11-30", estimateHours: 12, spentHours: 4, labels: ["seo"] }),
    T("Maquettes site SMOG", "smog", { assigneeId: p.mathilde, status: "done", startDate: "2026-04-01", dueDate: "2026-04-20", labels: ["design"] }),
    T("Intégration site SMOG", "smog", { assigneeId: p.noah, status: "in_progress", startDate: "2026-04-21", dueDate: "2026-06-30", labels: ["front-end"] }),
    T("Récapitulatif technique au client", "mtaregion", { assigneeId: p.sami, status: "done", dueDate: "2026-11-03", labels: ["réunion"] }),
    T("Mise en production des 11 tâches", "mtaregion", { assigneeId: p.sami, status: "in_review", priority: "high", startDate: "2026-08-01", dueDate: "2026-11-21", estimateHours: 40, spentHours: 36, labels: ["back-end", "devops"] }),
    T("Refonte de la page d'accueil", "otopioSite", { assigneeId: p.sami, status: "in_progress", startDate: "2026-09-15", dueDate: "2026-11-30", labels: ["front-end"] }),
    T("Articles blog SEO / GEO", "otopioSite", { assigneeId: p.aisha, status: "todo", startDate: "2026-11-15", dueDate: "2026-12-15", labels: ["seo"] }),
    T("Prototype ERP — vues base de données", "erp", { assigneeId: p.sami, status: "in_progress", priority: "high", startDate: "2026-11-14", dueDate: "2026-11-30", labels: ["front-end", "back-end"] }),
    T("Connecter Qonto et QuickBooks", "erp", { assigneeId: p.sami, status: "backlog", startDate: "2026-12-01", dueDate: "2026-12-20", labels: ["intégration"] }),
    T("Renforcer l'équipe en marketing", "gestion", { status: "todo", labels: ["administratif"] }),
    T("Créer un kit de communication", "gestion", { assigneeId: p.aisha, status: "todo", labels: ["marketing"] }),
    T("Automatiser les calculs de taxes", "gestion", { status: "todo", labels: ["administratif"] }),
    T("Transférer tous les abonnements sur les cartes de crédit", "gestion", { status: "todo", labels: ["administratif"] }),
    T("Estimer financièrement chaque projet futur", "gestion", { status: "todo", labels: ["administratif"] }),
    T("Créer les templates de documents Otopio", "gestion", { assigneeId: p.aisha, status: "todo", labels: ["administratif"] }),
    T("Uniformiser les templates factures & devis", "gestion", { assigneeId: p.mathilde, status: "todo", labels: ["administratif"] }),
    T("Répertorier / catégoriser toutes les dépenses", "gestion", { status: "todo", labels: ["finance"] }),
    T("Faire les notes de frais", "gestion", { assigneeId: p.sami, status: "todo", labels: ["finance"] }),
    T("S'inscrire à un logiciel de compta (QuickBooks)", "gestion", { assigneeId: p.maissane, status: "done", priority: "urgent", labels: ["finance"] }),
    T("Ranger tous les documents existants sur le Drive", "gestion", { assigneeId: p.mathilde, status: "todo", priority: "low", labels: ["administratif"] }),
    T("Stratégie subventions (produit, service)", "gestion", { assigneeId: p.aisha, status: "todo", labels: ["subventions"] }),
    T("Recruter notre premier stagiaire", "gestion", { status: "backlog", labels: ["rh"] }),
    T("Brander nos réseaux : LinkedIn, Instagram, Facebook", "gestion", { assigneeId: p.aisha, status: "todo", priority: "low", labels: ["marketing"] }),
    T("Créer le workflow d'acquisition client", "gestion", { status: "todo", labels: ["ventes"] }),
    T("Mettre en place le système de sprints", "gestion", { assigneeId: p.aisha, status: "backlog", labels: ["organisation"] }),
  ]);

  /* ------------------------------------------------------------------ */
  /*  Tickets                                                           */
  /* ------------------------------------------------------------------ */
  await db.insert(s.ticket).values([
    { title: "Un même courriel doit pouvoir passer plusieurs commandes", projectId: pr.theoasso, organizationId: org.theoasso, requesterId: p.stephane, assigneeId: p.sami, status: "in_progress", priority: "high", category: "bug", dueDate: "2026-11-20", description: "Workflow trésorier : actuellement bloqué après une première commande." },
    { title: "Accès au code et transfert sur le GitHub client", projectId: pr.theoasso, organizationId: org.theoasso, requesterId: p.stephane, assigneeId: p.sami, status: "triaged", priority: "medium", category: "support", dueDate: "2026-11-28" },
    { title: "Refonte du workflow de paiement", projectId: pr.theoasso, organizationId: org.theoasso, requesterId: p.benjamin, status: "closed", priority: "medium", category: "feature", description: "Devis D-2026-002 envoyé — le client internalise cette partie." },
    { title: "Procédure d'accès au code de l'application", projectId: pr.mtaregion, organizationId: org.mtaregion, requesterId: p.jc, assigneeId: p.sami, status: "resolved", priority: "medium", category: "support", resolvedAt: "2026-07-29" },
    { title: "Suivi du lancement en production", projectId: pr.mtaregion, organizationId: org.mtaregion, requesterId: p.paul, assigneeId: p.sami, status: "waiting_client", priority: "high", category: "support", dueDate: "2026-11-21" },
    { title: "Transfert du code du site web", projectId: pr.coordiaSite, organizationId: org.coordia, requesterId: p.naminata, assigneeId: p.maissane, status: "in_progress", priority: "medium", category: "support" },
    { title: "Contenus et informations de facturation SMOG", projectId: pr.smog, organizationId: org.smog, requesterId: p.olivier, assigneeId: p.maissane, status: "resolved", priority: "low", category: "content", resolvedAt: "2026-03-31" },
  ]);

  /* ------------------------------------------------------------------ */
  /*  Quotes                                                            */
  /* ------------------------------------------------------------------ */
  type QuoteIn = typeof s.quote.$inferInsert;
  const Q = (q: Omit<QuoteIn, "subtotal" | "taxTotal" | "total" | "taxes" | "lines">, lines: DocumentLine[], taxes: TaxRate[]): QuoteIn => ({ ...q, ...totals(lines, taxes) });
  const quotes = await db
    .insert(s.quote)
    .values([
      Q(
        { number: "DEV-2025-012", title: "Plateforme Heeroo — Agent IA", legalEntityId: otp.id, organizationId: org.heeroo, contactId: p.jonathan, projectId: pr.heeroo, status: "accepted", issueDate: "2025-12-05", validUntil: "2026-01-05", currency: "CAD" },
        [line("Agent IA conversationnel — conception et développement", 35500, 1, "Mandat initial validé en décembre 2025")],
        TAX_QC,
      ),
      Q(
        { number: "MOG-26-01", title: "Conception du site web SMOG", legalEntityId: otp.id, organizationId: org.smog, projectId: pr.smog, status: "accepted", issueDate: "2026-03-03", validUntil: "2026-04-03", currency: "CAD", introduction: "Conception et intégration d'un site vitrine pour SMOG Inc., en partenariat avec Boréal Technologie.", terms: "Acompte de 30 % au démarrage, solde à la mise en production." },
        [line("Site web vitrine — design, intégration et mise en ligne", 3500)],
        TAX_QC,
      ),
      Q(
        { number: "MTR-SOW-01", title: "M ta région — 11 tâches (SOW)", legalEntityId: otp.id, organizationId: org.mtaregion, contactId: p.paul, projectId: pr.mtaregion, status: "accepted", issueDate: "2026-07-29", validUntil: "2026-08-29", currency: "CAD", terms: "50 % à la signature, 50 % à la livraison." },
        [line("Réalisation des 11 tâches convenues", 4900, 1, "Voir tableau de tâches joint au SOW")],
        TAX_QC,
      ),
      Q(
        { number: "D-2026-001", title: "OnBall — Phase 2", legalEntityId: mgs.id, organizationId: org.onball, contactId: p.larbi, projectId: pr.onball2, status: "accepted", issueDate: "2026-07-11", validUntil: "2026-08-11", currency: "EUR", introduction: "Devis ajusté suite à l'échange avec Larbi : périmètre réduit à 5 000 € HT en dépriorisant certains modules.", scope: "## Objectifs\n- Faire évoluer la plateforme OnBall (phase 2)\n- Prioriser les modules à plus forte valeur\n\n## Livrables\n1. Cahier des charges phase 2 validé\n2. Développement des modules prioritaires\n3. Recette et mise en production" },
        [line("Phase 2 — développement des modules prioritaires", 5000)],
        TVA_FR,
      ),
      Q(
        { number: "D-2026-002", title: "ThéoAsso — Refonte du workflow de paiement", legalEntityId: mgs.id, organizationId: org.theoasso, contactId: p.stephane, projectId: pr.theoasso, status: "rejected", issueDate: "2026-10-04", validUntil: "2026-11-04", currency: "EUR", introduction: "Refonte du workflow de paiement sur la base du processus décrit le 29 septembre. Le client a choisi d'internaliser cette partie." },
        [],
        TVA_FR,
      ),
      Q(
        { number: "TEA-SOW-01", title: "Tealecom — TEA Platform Phase 1", legalEntityId: otp.id, organizationId: org.tealecom, contactId: p.adel, status: "rejected", issueDate: "2026-06-08", validUntil: "2026-07-08", currency: "CAD" },
        [],
        TAX_QC,
      ),
      Q(
        { number: "EPK-26-01", title: "Modification du site web — Epik Eats", legalEntityId: otp.id, organizationId: org.epik, contactId: p.dansu, projectId: pr.epik, status: "accepted", issueDate: "2026-03-30", currency: "CAD" },
        [],
        TAX_QC,
      ),
    ])
    .returning({ id: s.quote.id, number: s.quote.number });
  const qid = (n: string) => quotes.find((q) => q.number === n)?.id;

  /* ------------------------------------------------------------------ */
  /*  Invoices                                                          */
  /* ------------------------------------------------------------------ */
  type TxIn = typeof s.transaction.$inferInsert;
  type InvSeed = Omit<TxIn, "subtotal" | "taxTotal" | "total" | "taxes" | "lines" | "kind" | "side" | "date" | "label"> & { title?: string; issueDate?: string };
  /** sales invoice → ledger row (kind "invoice") */
  const I = ({ title, issueDate, ...i }: InvSeed, lines: DocumentLine[], taxes: TaxRate[]): TxIn => ({
    ...i,
    ...totals(lines, taxes),
    kind: "invoice",
    side: "credit",
    date: issueDate ?? new Date().toISOString().slice(0, 10),
    label: title ?? String(i.number),
  });
  const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;
  const invoices = await db
    .insert(s.transaction)
    .values([
      // Megascale (FR) — Qonto
      I(
        { number: "F-2026-001", title: "Acompte 30 % — création du site web", legalEntityId: mgs.id, organizationId: org.theoasso, projectId: pr.theoasso, status: "paid", issueDate: "2026-05-06", dueDate: "2026-05-21", paidAt: "2026-05-21", currency: "EUR", amountPaid: 3283.2, externalRef: "Q8TDZVX", fileUrl: drive("1G5ZqczFMa16wD2PSFoL7Le97qwUkydSz") },
        [line("Acompte de 30 % pour la création du site web", 2736)],
        TVA_FR,
      ),
      I(
        { number: "F-2026-002", title: "Réalisation de la plateforme web OnBall", legalEntityId: mgs.id, organizationId: org.onball, projectId: pr.onball, status: "sent", issueDate: "2026-06-03", currency: "EUR", notes: "Facture envoyée le 3 juin 2026 à admin@onball.fr — montant et numéro à confirmer depuis Qonto." },
        [],
        TVA_FR,
      ),
      I(
        { number: "F-2026-004", title: "Solde — conception et développement du site web ThéoAsso", legalEntityId: mgs.id, organizationId: org.theoasso, projectId: pr.theoasso, status: "sent", issueDate: "2026-10-02", dueDate: "2026-10-31", currency: "EUR", externalRef: "QVT4BCX", notes: "Remise de 456 € HT : régularisation de la TVA de la facture F-2026-001. « Bon pour paiement » reçu le 5 oct. 2026." },
        [
          line("Paiement de 40 % — validation de la phase de design", 3040),
          { ...line("Remise — régularisation F-2026-001", -456) },
          line("Paiement de 30 % — mise en production", 2280),
        ],
        TVA_FR,
      ),
      // Otopio Inc. (CA) — QuickBooks
      I(
        { number: "HEE-0426-01", title: "Régularisation — Projet Agent IA", legalEntityId: otp.id, organizationId: org.heeroo, projectId: pr.heeroo, quoteId: qid("DEV-2025-012"), status: "overdue", issueDate: "2026-04-15", dueDate: "2026-05-15", currency: "CAD", amountPaid: 11000, fileUrl: drive("1wfOYbn534LANYNJG2hjL_42DaSjXSbZI"), notes: "Acomptes reçus : 8 000 $ + 3 000 $. Solde de 17 168,88 $ TTC impayé — dossier confié à Groupe TCJ." },
        [line("Solde du mandat initial (devis décembre 2025)", 22500), line("Travaux supplémentaires — ajustement de périmètre", 2000, 1, "Profil public, onboarding par chat, messagerie")],
        TAX_QC,
      ),
      I(
        { number: "FAC-2026-003", title: "Agent IA — premier paiement", legalEntityId: otp.id, organizationId: org.heeroo, projectId: pr.heeroo, status: "paid", issueDate: "2026-02-21", paidAt: "2026-02-25", currency: "CAD", amountPaid: 12000, notes: "Importée depuis Airtable." },
        [line("Agent IA — jalon 1", 12000)],
        [],
      ),
      I(
        { number: "FAC-2026-004", title: "Site web Coordia — facture 1", legalEntityId: otp.id, organizationId: org.coordia, projectId: pr.coordiaSite, status: "paid", issueDate: "2026-03-14", paidAt: "2026-04-11", currency: "CAD", amountPaid: 3449.25, notes: "Importée depuis Airtable. Facture finale envoyée le 9 avril, virement reçu le 11 avril." },
        [line("Site web Coordia", 3000)],
        TAX_QC,
      ),
      I(
        { number: "SMO-26-01", title: "Acompte 30 % — site web SMOG", legalEntityId: otp.id, organizationId: org.smog, projectId: pr.smog, quoteId: qid("MOG-26-01"), status: "paid", issueDate: "2026-03-30", dueDate: "2026-03-30", paidAt: "2026-04-01", currency: "CAD", amountPaid: 1207.24, fileUrl: drive("1bdwVVlGTekGLSgFRHxRwyyV7tROluTQ0") },
        [line("Acompte de 30 % (sur devis de 3 500 $ HT du 3 mars 2026)", 1050)],
        TAX_QC,
      ),
      I(
        { number: "MTR-26-01", title: "Acompte 50 % — 11 tâches", legalEntityId: otp.id, organizationId: org.mtaregion, projectId: pr.mtaregion, quoteId: qid("MTR-SOW-01"), status: "sent", issueDate: "2026-07-29", dueDate: "2026-08-28", currency: "CAD", notes: "Numéro à confirmer (facture envoyée le 29 juillet 2026)." },
        [line("Acompte de 50 % sur les 11 tâches convenues", 2450)],
        TAX_QC,
      ),
      I(
        { number: "MTR-26-02", title: "Solde 50 % — 11 tâches", legalEntityId: otp.id, organizationId: org.mtaregion, projectId: pr.mtaregion, quoteId: qid("MTR-SOW-01"), status: "draft", currency: "CAD" },
        [line("Solde de 50 % à la livraison des 11 tâches", 2450)],
        TAX_QC,
      ),
    ])
    .returning({ id: s.transaction.id, number: s.transaction.number });

  /* ------------------------------------------------------------------ */
  /*  Bills                                                             */
  /* ------------------------------------------------------------------ */
  type BillIn = Omit<TxIn, "kind" | "side" | "date"> & { issueDate?: string };
  const gw = (month: number, num: string | null, fileId?: string): BillIn => {
    const mm = String(month).padStart(2, "0");
    return {
      label: `Google Workspace — ${new Date(2026, month - 1, 1).toLocaleDateString("fr-CA", { month: "long" })} 2026`,
      number: num,
      legalEntityId: otp.id,
      organizationId: org.google,
      category: "software",
      status: "paid",
      recurrence: "monthly",
      issueDate: `2026-${mm}-01`,
      paidAt: `2026-${mm}-01`,
      currency: "CAD",
      subtotal: 55.0,
      taxTotal: 8.24,
      total: 63.24,
      paymentMethod: "Carte de crédit (prélèvement automatique)",
      fileUrl: fileId ? drive(fileId) : null,
      driveFileId: fileId ?? null,
    };
  };
  const E = ({ issueDate, ...b }: BillIn): TxIn => ({ ...b, kind: "expense", side: "debit", date: issueDate ?? new Date().toISOString().slice(0, 10), source: "quickbooks", amountPaid: b.status === "paid" ? (b.total ?? 0) : 0 });
  const billSeeds: BillIn[] = [
      gw(3, "5524589125", "1mlQPlhColXd5KQhHjlQh11YGJ1vTihHk"),
      gw(4, "5554900196", "16nrI9ygusOFImexU8APTof82zKYtyfKR"),
      gw(5, "5584009104", "10afi0lb6Vx_hFBQlD56BOok-ij0ovKoW"),
      gw(6, null),
      gw(7, null),
      gw(8, null),
      gw(9, null),
      gw(10, null),
      gw(11, null),
      { label: "Anthropic — Claude Pro (mai 2026)", number: "EYLN2XBG-0001", legalEntityId: otp.id, organizationId: org.anthropic, category: "ai", status: "paid", recurrence: "monthly", issueDate: "2026-05-02", paidAt: "2026-05-02", currency: "CAD", total: 29.4, subtotal: 29.4, fileUrl: drive("1-hyqR9I070Y7CY1ogrWuFCf7j6lgD1iY"), driveFileId: "1-hyqR9I070Y7CY1ogrWuFCf7j6lgD1iY" },
      { label: "OVHcloud — VPS (mai 2026)", number: "CA784546", legalEntityId: otp.id, organizationId: org.ovh, category: "hosting", status: "paid", recurrence: "monthly", issueDate: "2026-05-01", currency: "CAD", total: 0, notes: "Montant à compléter — justificatif Drive vide.", driveFileId: "1os1JcY00gveQbEqS2H5-qapKJFaNKmMzQWttR9C8HQI" },
      { label: "RapidAPI — Facebook Scraper PRO (mai 2026)", legalEntityId: otp.id, organizationId: org.rapidapi, category: "software", status: "paid", recurrence: "monthly", issueDate: "2026-05-01", currency: "CAD", total: 0, notes: "Montant à compléter.", driveFileId: "1V-13VGuYm-DZJAKdqVZjwFzC5F3nBmQGUX9zuI_XLXM" },
      { label: "RapidAPI — Facebook Scraper PRO (juin 2026)", legalEntityId: otp.id, organizationId: org.rapidapi, category: "software", status: "paid", recurrence: "monthly", issueDate: "2026-06-01", currency: "CAD", total: 0, notes: "Montant à compléter.", driveFileId: "1IaTKg3tMVGXAwYFqVG449XttgG56GTFbs4Lqm8uvcw8" },
      { label: "QuickBooks — abonnement Intuit (mai 2026)", legalEntityId: otp.id, organizationId: org.intuit, category: "accounting", status: "paid", recurrence: "monthly", issueDate: "2026-05-01", currency: "CAD", total: 0, notes: "Montant à compléter.", driveFileId: "1Ts8akDdtrOsEnSXLqxLFnXAgfMNzMl4abi3OX6g4mOg" },
      { label: "Sous-traitance — virement Interac (mai 2026)", legalEntityId: otp.id, category: "subcontracting", status: "paid", issueDate: "2026-05-15", currency: "CAD", total: 0, notes: "Montant à compléter.", driveFileId: "1FTlCzt_PS45sDNNlao_6irsJL1xeXVRiUSWZ3hnGitI" },
      { label: "Groupe TCJ — convention de mandat (facture impayée)", legalEntityId: otp.id, organizationId: org.tcj, category: "legal", status: "to_pay", issueDate: "2026-07-15", currency: "CAD", total: 0, notes: "Honoraires selon convention de mandat — montant à compléter." },
  ];
  const bills = await db.insert(s.transaction).values(billSeeds.map(E)).returning({ id: s.transaction.id });

  /* ------------------------------------------------------------------ */
  /*  Bank transactions (sample feed for reconciliation)                */
  /* ------------------------------------------------------------------ */
  await db.insert(s.transaction).values([
    { kind: "movement", legalEntityId: otp.id, date: "2026-10-14", label: "CLOUDFLARE INC", counterparty: "Cloudflare", side: "debit", total: 7.18, subtotal: 7.18, currency: "CAD", source: "quickbooks", notes: "Aucune dépense liée — justificatif à retrouver." },
    { kind: "movement", legalEntityId: mgs.id, date: "2026-10-01", label: "QONTO — abonnement", counterparty: "Qonto", side: "debit", total: 11, subtotal: 11, currency: "EUR", source: "qonto", notes: "Aucune dépense liée — justificatif à retrouver." },
  ]);

  /* ------------------------------------------------------------------ */
  /*  Marketing                                                         */
  /* ------------------------------------------------------------------ */
  const [art1, art2] = await db
    .insert(s.article)
    .values([
      { title: "Agents IA en PME : par où commencer en 2027 ?", slug: "agents-ia-pme-par-ou-commencer", status: "draft", locale: "fr", targetQuery: "agent IA PME Québec", keywords: ["agent IA", "PME", "automatisation"], authorId: p.sami, seoScore: 62, excerpt: "Cas concrets, coûts et pièges à éviter pour déployer un premier agent IA utile." },
      { title: "Ce que nous avons appris en livrant la plateforme Heeroo", slug: "retour-experience-heeroo", status: "idea", locale: "fr", targetQuery: "CRM IA recrutement", keywords: ["étude de cas", "CRM", "IA"], authorId: p.maissane },
      { title: "Quantum computing for SMBs: hype vs. reality", slug: "quantum-computing-smb-reality", status: "idea", locale: "en", keywords: ["quantum", "R&D"], authorId: p.sami },
      { title: "Refonte d'un site associatif : le cas ThéoAsso", slug: "refonte-site-associatif-theoasso", status: "review", locale: "fr", targetQuery: "site web association", keywords: ["associatif", "étude de cas", "SEO"], authorId: p.maissane, seoScore: 78 },
    ])
    .returning({ id: s.article.id });
  await db.insert(s.post).values([
    { title: "Lancement du nouveau site otopio.ca", network: "linkedin", status: "scheduled", scheduledAt: new Date("2026-12-01T14:00:00Z"), authorId: p.maissane },
    { title: "Étude de cas ThéoAsso", network: "linkedin", status: "draft", articleId: art2?.id, authorId: p.maissane },
    { title: "3 idées reçues sur les agents IA", network: "instagram", status: "idea", articleId: art1?.id, authorId: p.aisha },
    { title: "Coulisses : notre stack 2026", network: "linkedin", status: "idea", authorId: p.sami },
  ]);

  /* ------------------------------------------------------------------ */
  /*  Documents (templates + linked Google Docs)                        */
  /* ------------------------------------------------------------------ */
  await db.insert(s.document).values([
    { title: "Devis + cahier des charges", kind: "template", type: "quote", icon: "FilePenLine", content: "# {{quote.title}}\n\n## Contexte\n{{client.name}} souhaite…\n\n## Objectifs\n- …\n\n## Périmètre\n1. …\n\n## Planning\n- Démarrage : …\n- Livraison : …" },
    { title: "Facture", kind: "template", type: "invoice", icon: "Receipt", content: "Facture générée automatiquement à partir des lignes, des taxes et des coordonnées bancaires de la structure émettrice." },
    { title: "Contrat de prestation de service", kind: "template", type: "contract", icon: "ScrollText", content: "# Contrat de prestation de service\n\nEntre **{{entity.legalName}}** et **{{client.legalName}}**…\n\n## 1. Objet\n…\n\n## 2. Durée\n…\n\n## 3. Rémunération\n…\n\n## 4. Propriété intellectuelle\n…" },
    { title: "Statement of Work (SOW)", kind: "template", type: "sow", icon: "ListChecks", content: "# Statement of Work — {{project.name}}\n\n## Scope\n…\n\n## Deliverables\n…\n\n## Payment schedule\n- 50 % at signature\n- 50 % at delivery" },
    { title: "Accord de confidentialité (NDA)", kind: "template", type: "nda", icon: "ShieldCheck", content: "# Accord de confidentialité\n\nEntre {{entity.legalName}} et {{client.legalName}}…" },
    { title: "Compte-rendu de réunion", kind: "template", type: "report", icon: "NotebookPen", content: "# CR — {{project.name}} — {{date}}\n\n## Participants\n- …\n\n## Décisions\n- …\n\n## Prochaines étapes\n- [ ] …" },
    { title: "FINAL OnBall — Devis Phase 2", kind: "document", type: "quote", organizationId: org.onball, projectId: pr.onball2, googleDocId: "1-sZkeJYnDuvHxCp9LStKEI4vj8gswXUKV3AvH90WBYE" },
    { title: "Facture n°HEE-0426-01 Régularisation", kind: "document", type: "invoice", organizationId: org.heeroo, projectId: pr.heeroo, googleDocId: "1hAsjw_PEoSDMwI5NRGHctu0-JjYf-r2G0dx9SZF6rts" },
    { title: "Taxes — notes internes", kind: "document", type: "free", googleDocId: "1njNSBmc5VKj49A3pQCr3cChS9hN1wxhBU596LB-kF1M" },
    { title: "Récapitulatif technique — M ta région", kind: "document", type: "report", organizationId: org.mtaregion, projectId: pr.mtaregion, content: "# Récapitulatif technique\n\nPoints livrés, état de la mise en production et prochaines étapes (envoyé le 3 nov. 2026)." },
  ]);

  /* ------------------------------------------------------------------ */
  /*  Default saved views                                               */
  /* ------------------------------------------------------------------ */
  const empty = { filters: [], sorts: [], hiddenFields: [] };
  await db.insert(s.savedView).values([
    { table: "task", name: "Tableau des tâches", type: "kanban", icon: "Columns3", position: 1, config: { ...empty, groupBy: "status", filters: [{ id: "f1", field: "status", op: "not_in", value: ["cancelled"] }] } },
    { table: "task", name: "Planning", type: "gantt", icon: "ChartGantt", position: 2, config: { ...empty, dateField: "startDate", endDateField: "dueDate", filters: [{ id: "f1", field: "startDate", op: "is_not_empty" }] } },
    { table: "task", name: "Urgences", type: "table", icon: "Flame", position: 3, config: { ...empty, filters: [{ id: "f1", field: "priority", op: "in", value: ["high", "urgent"] }, { id: "f2", field: "status", op: "not_in", value: ["done", "cancelled"] }], sorts: [{ field: "dueDate", dir: "asc" }] } },
    { table: "project", name: "Timeline", type: "gantt", icon: "ChartGantt", position: 1, config: { ...empty, dateField: "startDate", endDateField: "dueDate", filters: [{ id: "f1", field: "status", op: "not_in", value: ["cancelled", "idea"] }] } },
    { table: "project", name: "Par statut", type: "kanban", icon: "Columns3", position: 2, config: { ...empty, groupBy: "status" } },
    { table: "organization", name: "Clients actifs", type: "gallery", icon: "Star", position: 1, config: { ...empty, filters: [{ id: "f1", field: "type", op: "in", value: ["client"] }, { id: "f2", field: "status", op: "in", value: ["active"] }] } },
    { table: "organization", name: "Pipeline", type: "kanban", icon: "Columns3", position: 2, config: { ...empty, groupBy: "status", filters: [{ id: "f1", field: "type", op: "in", value: ["lead", "client"] }] } },
    { table: "ticket", name: "Support client", type: "kanban", icon: "Columns3", position: 1, config: { ...empty, groupBy: "status" } },
    { table: "post", name: "Calendrier éditorial", type: "calendar", icon: "CalendarDays", position: 1, config: { ...empty, dateField: "scheduledAt" } },
    { table: "article", name: "Pipeline SEO", type: "kanban", icon: "Columns3", position: 1, config: { ...empty, groupBy: "status" } },
  ]);

  console.log(`[seed] done — ${orgs.length} organizations, ${people.length} people, ${projects.length} projects, ${invoices.length} invoices, ${bills.length} bills`);
}

await main();
await sql.end();
