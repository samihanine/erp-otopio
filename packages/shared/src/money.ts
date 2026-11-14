export type Line = { id: string; description: string; details?: string; quantity: number; unitPrice: number; unit?: string; discount?: number };
export type TaxRate = { code: string; label: string; rate: number };
export type AppliedTax = TaxRate & { amount: number };

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function lineTotal(l: Line) {
  return round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) - (Number(l.discount) || 0));
}

export function computeTotals(lines: Line[], taxes: TaxRate[]) {
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const applied: AppliedTax[] = taxes.map((t) => ({ ...t, amount: round2(subtotal * t.rate) }));
  const taxTotal = round2(applied.reduce((s, t) => s + t.amount, 0));
  return { subtotal, taxes: applied, taxTotal, total: round2(subtotal + taxTotal) };
}

export function formatMoney(amount: number | null | undefined, currency = "CAD", locale: "fr" | "en" = "fr") {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

/** Rough reporting rates to consolidate entities (editable later in settings). */
export const FX_TO_CAD: Record<string, number> = { CAD: 1, EUR: 1.52, USD: 1.38 };
export const toCAD = (amount: number, currency: string) => round2(amount * (FX_TO_CAD[currency] ?? 1));
