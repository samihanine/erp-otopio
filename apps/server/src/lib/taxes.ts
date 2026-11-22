/**
 * Corporate tax estimates + filing calendar for the two incorporated entities:
 *  - OTP — Otopio Inc., société par actions (Québec), constituted 2026-01-08, FY ending Dec 31,
 *          TPS/TVQ registrant since 2026-02-02, annual GST/QST filer (Revenu Québec registration).
 *  - MGS — SARL Megascale Technologie (associé unique), Noyal-Châtillon-sur-Seiche (SIE Rennes 1),
 *          activity since 2026-04-23, first FY closes 2026-12-31 (statuts art. 5), invoices with TVA 20 %.
 * Figures are estimates from the ERP data; rates are the 2026 statutory rates.
 */
export type TaxConfig = Record<string, unknown> & { done?: Record<string, boolean> };

export const DEFAULTS: Record<string, TaxConfig> = {
  OTP: {
    incorporatedOn: "2026-01-08",
    fyEnd: "12-31",
    ccpc: true, // société privée sous contrôle canadien (actionnaires résidents du Canada)
    qcSbd: false, // déduction pour petite entreprise du Québec : exige 5 500 h rémunérées
    gstFrequency: "annual",
  },
  MGS: {
    incorporatedOn: "2026-04-23",
    firstFyEnd: "2026-12-31",
    fyEnd: "12-31",
    regime: "IS", // IS ou IR (défaut légal d'une SARL à associé unique personne physique : IR, sauf option)
    irRate: 0.2, // taux d'IR estimé du gérant si régime IR (non-résident : taux minimum 20 %)
    tnsRate: 0.45, // cotisations sociales TNS ≈ 45 % de la base (bénéfice si IR, rémunération si IS)
    gerantPay: 0, // rémunération annuelle du gérant (IS)
    tnsMinimum: 1100, // cotisations minimales annuelles d'un gérant TNS sans revenu (estimation)
    vatRegime: "RSI",
  },
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const D = (s: string) => new Date(`${s}T12:00:00Z`);
const addMonths = (s: string, m: number) => {
  const d = D(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
};
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
/** next business day (weekend roll-forward, + a few fixed public holidays) */
const FR_HOLIDAYS = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"];
const CA_HOLIDAYS = ["01-01", "07-01", "12-25"];
function roll(s: string, country: "FR" | "CA") {
  const d = D(s);
  const hol = country === "FR" ? FR_HOLIDAYS : CA_HOLIDAYS;
  while (isWeekend(d) || hol.includes(iso(d).slice(5))) d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
}
/** n-th working day after a date (FR) — e.g. « 2e jour ouvré suivant le 1er mai » */
function nthWorkingDayAfter(s: string, n: number) {
  const d = D(s);
  let k = 0;
  while (k < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d) && !FR_HOLIDAYS.includes(iso(d).slice(5))) k++;
  }
  return iso(d);
}

export type Deadline = { key: string; date: string; title: string; detail: string; authority: string; kind: "declare" | "pay" | "admin"; amount?: number; conditional?: boolean };
export type TaxLine = { key: string; label: string; base: number; rate: string; amount: number; note?: string };

export type Inputs = {
  revenueHT: number;
  expensesHT: number;
  invoices: number;
  bills: number;
  vatCollected: number; // GST+QST or TVA collected
  vatDeductible: number;
  gstCollected?: number;
  qstCollected?: number;
  gstItc?: number;
  qstItr?: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function fiscalYear(code: string, year: number, cfg: TaxConfig) {
  const inc = String(cfg.incorporatedOn);
  const start = `${year}-01-01` < inc ? inc : `${year}-01-01`;
  const end = code === "MGS" && cfg.firstFyEnd && Number(String(cfg.firstFyEnd).slice(0, 4)) === year ? String(cfg.firstFyEnd) : `${year}-12-31`;
  const first = start === inc;
  const days = Math.round((+D(end) - +D(start)) / 864e5) + 1;
  return { start, end, first, days, valid: end >= inc };
}

export function computeOTP(year: number, cfg: TaxConfig, x: Inputs) {
  const fy = fiscalYear("OTP", year, cfg);
  const profit = r2(x.revenueHT - x.expensesHT);
  const base = Math.max(0, profit);
  const limit = (500_000 * fy.days) / 365;
  const sbdPart = cfg.ccpc ? Math.min(base, limit) : 0;
  const genPart = base - sbdPart;
  const fed = r2(sbdPart * 0.09 + genPart * 0.15);
  const qc = r2(cfg.qcSbd ? sbdPart * 0.032 + genPart * 0.115 : base * 0.115);
  const taxes: TaxLine[] = [
    { key: "fed", label: "Impôt fédéral (ARC)", base, rate: cfg.ccpc ? "9 % (DPE) / 15 %" : "15 %", amount: fed, note: cfg.ccpc ? "Taux réduit des petites entreprises (SPCC) sur le revenu d'entreprise exploitée activement." : undefined },
    { key: "qc", label: "Impôt du Québec (Revenu Québec)", base, rate: cfg.qcSbd ? "3,2 % (DPE) / 11,5 %" : "11,5 %", amount: qc, note: cfg.qcSbd ? undefined : "La déduction pour petite entreprise du Québec exige 5 500 h rémunérées dans l'année (aucun salaire déclaré) → taux général." },
  ];
  const gst = r2((x.gstCollected ?? 0) - (x.gstItc ?? 0));
  const qst = r2((x.qstCollected ?? 0) - (x.qstItr ?? 0));
  const sales: TaxLine[] = [
    { key: "gst", label: "TPS à remettre (5 %)", base: x.gstCollected ?? 0, rate: `perçue ${r2(x.gstCollected ?? 0)} − CTI ${r2(x.gstItc ?? 0)}`, amount: gst },
    { key: "qst", label: "TVQ à remettre (9,975 %)", base: x.qstCollected ?? 0, rate: `perçue ${r2(x.qstCollected ?? 0)} − RTI ${r2(x.qstItr ?? 0)}`, amount: qst },
  ];
  const income = r2(fed + qc);
  const E = fy.end;
  const dl: Deadline[] = [
    { key: `otp-${year}-gst`, date: roll(addMonths(E, 3), "CA"), title: "Déclaration annuelle TPS/TVQ + paiement", detail: `Exercice ${year} — déclarant annuel (une seule déclaration TPS/TVQ produite à Revenu Québec, FPZ-34).`, authority: "Revenu Québec", kind: "declare", amount: r2(gst + qst) },
    { key: `otp-${year}-bal`, date: roll(addMonths(E, cfg.ccpc ? 3 : 2), "CA"), title: "Solde d'impôt fédéral + Québec", detail: cfg.ccpc ? "SPCC admissible à la DPE : solde dû 3 mois après la fin d'exercice (sinon 2 mois)." : "Solde dû 2 mois après la fin d'exercice.", authority: "ARC + Revenu Québec", kind: "pay", amount: income },
    { key: `otp-${year}-t2`, date: roll(addMonths(E, 6), "CA"), title: "Déclarations T2 (fédéral) et CO-17 (Québec)", detail: "Avec états financiers (IGRF / annexes), à produire 6 mois après la fin d'exercice. La déclaration de mise à jour annuelle du Registraire est produite avec la CO-17 (droits annuels d'immatriculation).", authority: "ARC + Revenu Québec + REQ", kind: "declare" },
  ];
  if (income > 3000)
    dl.push({ key: `otp-${year + 1}-inst`, date: roll(`${year + 1}-01-31`, "CA"), title: `Acomptes provisionnels ${year + 1} (impôt)`, detail: `Impôt ${year} > 3 000 $ : acomptes mensuels (ou trimestriels pour une SPCC admissible) en ${year + 1}, ≈ ${Math.round(income / 12)} $ / mois.`, authority: "ARC + Revenu Québec", kind: "pay", amount: r2(income / 12), conditional: true });
  if (gst + qst > 3000)
    dl.push({ key: `otp-${year + 1}-gstinst`, date: roll(`${year + 1}-04-30`, "CA"), title: `Acomptes TPS/TVQ ${year + 1}`, detail: "Taxe nette > 3 000 $ : acomptes trimestriels (30 avril, 31 juillet, 31 octobre, 31 janvier).", authority: "Revenu Québec", kind: "pay", amount: r2((gst + qst) / 4), conditional: true });
  const notes = [
    "Exercice du " + fy.start + " au " + fy.end + (fy.first ? " (premier exercice, constitution le 8 janvier 2026)" : "") + ".",
    "Aucun acompte d'impôt pour le premier exercice.",
    profit < 0 ? "Perte : aucun impôt ; reportable sur les 20 exercices suivants (ou 3 précédents)." : "Bénéfice imposable estimé = facturé HT − dépenses HT déductibles (y compris les dépenses payées perso à rembourser).",
    "Non inclus : dividendes / salaires versés aux actionnaires (T4/T5, RL-1/RL-3), amortissement (DPA), crédits d'impôt (RS&DE, CDAE).",
  ];
  return { fy, figures: { revenueHT: x.revenueHT, expensesHT: x.expensesHT, profit, invoices: x.invoices, bills: x.bills }, taxes, sales, totalIncomeTax: income, totalSales: r2(gst + qst), total: r2(income + gst + qst), deadlines: dl, notes };
}

export function computeMGS(year: number, cfg: TaxConfig, x: Inputs) {
  const fy = fiscalYear("MGS", year, cfg);
  const profit = r2(x.revenueHT - x.expensesHT);
  const base = Math.max(0, profit);
  const IS = cfg.regime !== "IR";
  const pay = Number(cfg.gerantPay ?? 0);
  const taxes: TaxLine[] = [];
  let corp = 0;
  if (IS) {
    const b = Math.max(0, base - pay);
    const low = Math.min(b, 42_500);
    corp = r2(low * 0.15 + (b - low) * 0.25);
    taxes.push({ key: "is", label: "Impôt sur les sociétés", base: r2(b), rate: "15 % ≤ 42 500 € / 25 %", amount: corp, note: "Taux réduit PME : CA < 10 M€, capital entièrement libéré et détenu à 75 % par des personnes physiques (associé unique)." });
    const tns = r2(Math.max(Number(cfg.tnsMinimum ?? 0) * (fy.days / 365), pay * Number(cfg.tnsRate ?? 0.45)));
    taxes.push({ key: "tns", label: "Cotisations sociales du gérant (URSSAF, TNS)", base: pay, rate: pay ? `≈ ${Math.round(Number(cfg.tnsRate) * 100)} % de la rémunération` : "minimales", amount: tns, note: "Gérant associé unique = travailleur indépendant. Sans rémunération : cotisations minimales (prélevées par l'URSSAF, montant exact sur ton espace URSSAF)." });
  } else {
    const ir = r2(base * Number(cfg.irRate ?? 0.2));
    const tns = r2(Math.max(Number(cfg.tnsMinimum ?? 0) * (fy.days / 365), base * Number(cfg.tnsRate ?? 0.45)));
    taxes.push({ key: "ir", label: "Impôt sur le revenu (au nom du gérant)", base, rate: `≈ ${Math.round(Number(cfg.irRate) * 100)} %`, amount: ir, note: "Régime IR : le bénéfice est imposé chez l'associé (BNC/BIC), pas dans la société." });
    taxes.push({ key: "tns", label: "Cotisations sociales TNS sur le bénéfice", base, rate: `≈ ${Math.round(Number(cfg.tnsRate) * 100)} %`, amount: tns });
  }
  const vat = r2(x.vatCollected - x.vatDeductible);
  const sales: TaxLine[] = [{ key: "tva", label: "TVA à payer", base: x.vatCollected, rate: `collectée ${r2(x.vatCollected)} − déductible ${r2(x.vatDeductible)}`, amount: vat, note: "TVA sur les prestations de services exigible à l'encaissement ; déductible uniquement avec facture." }];
  const total = r2(taxes.reduce((a, t) => a + t.amount, 0) + Math.max(0, vat));
  const Y = Number(fy.end.slice(0, 4));
  const may = nthWorkingDayAfter(`${Y + 1}-05-01`, 2);
  const dl: Deadline[] = [];
  if (fy.first) {
    dl.push({ key: `mgs-${Y}-sine`, date: `${Y}-11-30`, title: "Enquête INSEE SINE (obligatoire)", detail: "Questionnaire « nouvelles entreprises créées en 2026 », identifiant reçu par courriel le 6 novembre.", authority: "INSEE", kind: "admin" });
    dl.push({ key: `mgs-${Y}-cfe1447`, date: `${Y}-12-31`, title: "Déclaration initiale CFE (1447-C)", detail: "Avant le 31 décembre de l'année de création — les éléments du local ont déjà été transmis au SIE de Rennes 1 en août ; vérifier qu'il ne reste rien à déposer sur l'espace professionnel.", authority: "SIE Rennes 1", kind: "declare" });
  }
  dl.push({ key: `mgs-${Y}-ca12`, date: may, title: "TVA : déclaration annuelle CA12 + solde", detail: `Régime réel simplifié. ${fy.first ? "Premier exercice : pas d'acompte, toute la TVA de " + Y + " est payée avec la CA12." : "Solde après déduction des acomptes de juillet et décembre."}`, authority: "impots.gouv (espace pro)", kind: "declare", amount: Math.max(0, vat) });
  dl.push({ key: `mgs-${Y}-liasse`, date: may, title: IS ? "Liasse fiscale 2065 + 2033 (IS, régime simplifié)" : "Déclaration de résultats (2035/2031, régime IR)", detail: "Délai supplémentaire de 15 jours en télédéclaration (EDI) — en pratique via l'expert-comptable ou un service EDI.", authority: "impots.gouv", kind: "declare" });
  if (IS) dl.push({ key: `mgs-${Y}-is`, date: roll(`${Y + 1}-05-15`, "FR"), title: "Solde d'IS (relevé 2572)", detail: fy.first ? "Premier exercice : aucun acompte versé, le solde = l'IS total." : "Solde = IS de l'exercice − acomptes versés.", authority: "impots.gouv", kind: "pay", amount: corp });
  else dl.push({ key: `mgs-${Y}-2042`, date: `${Y + 1}-05-31`, title: "Report du bénéfice sur la déclaration 2042-C-PRO du gérant", detail: "Date selon le calendrier de l'impôt sur le revenu (fin mai / début juin).", authority: "impots.gouv (particulier)", kind: "declare", amount: taxes[0]!.amount });
  dl.push({ key: `mgs-${Y}-ag`, date: `${Y + 1}-06-30`, title: "Approbation des comptes par l'associé unique", detail: "Dans les 6 mois suivant la clôture (décision de l'associé unique + rapport de gestion).", authority: "Société", kind: "admin" });
  dl.push({ key: `mgs-${Y}-greffe`, date: `${Y + 1}-07-31`, title: "Dépôt des comptes annuels au greffe", detail: "1 mois après l'approbation (2 mois en ligne) — possibilité de confidentialité des comptes (micro-entreprise).", authority: "Greffe / guichet unique", kind: "admin" });
  if (vat >= 1000) {
    dl.push({ key: `mgs-${Y + 1}-tva07`, date: `${Y + 1}-07-24`, title: `Acompte TVA juillet ${Y + 1} (55 %)`, detail: `55 % de la TVA due au titre de ${Y}.`, authority: "impots.gouv", kind: "pay", amount: r2(vat * 0.55), conditional: true });
    dl.push({ key: `mgs-${Y + 1}-tva12`, date: `${Y + 1}-12-24`, title: `Acompte TVA décembre ${Y + 1} (40 %)`, detail: `40 % de la TVA due au titre de ${Y}.`, authority: "impots.gouv", kind: "pay", amount: r2(vat * 0.4), conditional: true });
  }
  if (IS && corp >= 3000)
    for (const [m, n] of [["03", 1], ["06", 2], ["09", 3], ["12", 4]] as const)
      dl.push({ key: `mgs-${Y + 1}-isa${n}`, date: roll(`${Y + 1}-${m}-15`, "FR"), title: `Acompte d'IS n°${n} (${Y + 1})`, detail: "IS de référence ≥ 3 000 € : 4 acomptes de 25 %.", authority: "impots.gouv", kind: "pay", amount: r2(corp / 4), conditional: true });
  dl.push({ key: `mgs-${Y + 1}-cfe`, date: `${Y + 1}-12-15`, title: `CFE ${Y + 1}`, detail: fy.first ? "Exonération l'année de création ; réduction de moitié de la base la 2e année. Avis disponible sur l'espace pro en novembre ; exonération de la cotisation minimum si CA ≤ 5 000 €." : "Avis disponible sur l'espace professionnel en novembre.", authority: "impots.gouv", kind: "pay" });
  const notes = [
    `Exercice du ${fy.start} au ${fy.end}${fy.first ? " (premier exercice, statuts art. 5)" : ""}.`,
    IS ? "Régime retenu : IS. Par défaut, une SARL à associé unique personne physique relève de l'IR sauf option pour l'IS — à vérifier sur l'espace professionnel (rubrique « Régime fiscal »)." : "Régime retenu : IR (défaut légal d'une SARL à associé unique) — si l'option IS a été cochée à l'immatriculation, change le régime.",
    "TVA : facturée à 20 % sur toutes les factures → redevable, régime réel simplifié (sauf option pour le réel normal).",
    "Non inclus : dividendes (PFU 30 % ou cotisations sociales au-delà de 10 % du capital), CVAE (non applicable), amortissements.",
  ];
  return { fy, figures: { revenueHT: x.revenueHT, expensesHT: x.expensesHT, profit, invoices: x.invoices, bills: x.bills }, taxes, sales, totalIncomeTax: r2(taxes.reduce((a, t) => a + t.amount, 0)), totalSales: Math.max(0, vat), total, deadlines: dl, notes };
}
