/**
 * Gmail → ERP (every 15 min)
 *  - new threads with known contacts → communications
 *  - supplier invoices (PDF + invoice keywords) → bills, PDF stored in Administratif / Dépenses / <entity>
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@erp/db";
import { addresses, attachmentsOf, drive, FOLDER, gmail, header, textBody, type GmailMessage } from "@erp/google";
import { ADMIN, ai, aiEnabled, AUTOMATED, directory, getState, log, MEMBERS, setState } from "./common";
import { ADMIN_DRIVE, sharedDriveIds } from "./drive";

const INVOICE = /\b(facture|invoice|receipt|reçu|payment (received|confirmation)|votre paiement|billing statement)\b/i;

export async function syncGmail() {
  const dir = await directory();
  const stats: Record<string, number> = { communications: 0, bills: 0 };
  for (const box of MEMBERS) {
    const key = `gmail:${box}:historyId`;
    const last = await getState(key);
    const profile = await gmail.profile(box).catch(() => null);
    if (!profile) continue;
    if (!last) {
      await setState(key, profile.historyId); // start tracking from now (history already imported)
      continue;
    }
    let threadIds = new Set<string>();
    let msgIds: { id: string; threadId: string }[] = [];
    try {
      const h = await gmail.history(box, last);
      for (const item of h.history ?? []) for (const a of item.messagesAdded ?? []) {
        threadIds.add(a.message.threadId);
        msgIds.push({ id: a.message.id, threadId: a.message.threadId });
      }
    } catch {
      // history id too old → re-scan last 2 days
      const recent = await gmail.list(box, "newer_than:2d -in:spam -in:trash", 300);
      threadIds = new Set(recent.map((r) => r.threadId));
      msgIds = recent;
    }
    for (const tid of threadIds) if (await threadToCommunication(box, tid, dir)) stats.communications!++;
    for (const m of msgIds) if (await detectInvoice(box, m.id, dir)) stats.bills!++;
    await setState(key, profile.historyId);
  }
  return stats;
}

type Dir = Awaited<ReturnType<typeof directory>>;

async function threadToCommunication(box: string, tid: string, dir: Dir) {
  const t = await gmail.thread(box, tid).catch(() => null);
  if (!t?.messages?.length) return false;
  const last = t.messages.at(-1)!;
  const parts = new Set<string>();
  let automated = true;
  for (const m of t.messages) {
    const from = addresses(header(m, "From"));
    from.forEach((x) => parts.add(x));
    addresses(`${header(m, "To")} ${header(m, "Cc")}`).forEach((x) => parts.add(x));
    if (!from.every((f) => AUTOMATED.test(f))) automated = false;
  }
  if (automated) return false;
  const ext = [...parts].filter((p) => !p.endsWith("@otopio.ca") && !AUTOMATED.test(p));
  const m = dir.match(ext);
  if (!m.person && !m.org) return false; // only known contacts / organizations
  const sender = addresses(header(last, "From"))[0] ?? "";
  const subject = (header(t.messages[0]!, "Subject") || "(sans objet)").replace(/^((re|tr|fwd?)\s*:\s*)+/i, "");
  const atts = t.messages.flatMap((x) => attachmentsOf(x).map((a) => a.filename)).filter(Boolean);
  const values = {
    subject,
    type: "email" as const,
    direction: (sender.endsWith("@otopio.ca") ? "outbound" : "inbound") as "outbound" | "inbound",
    occurredAt: new Date(Number(last.internalDate)),
    personId: m.person?.id ?? null,
    organizationId: m.org?.id ?? null,
    projectId: m.project?.id ?? null,
    participants: ext,
    mailbox: box,
    sourceUrl: `https://mail.google.com/mail/?authuser=${box}#all/${tid}`,
    attachments: [...new Set(atts)].slice(0, 20),
    summary: `${last.snippet ?? ""}${t.messages.length > 1 ? `\n\n(${t.messages.length} messages dans le fil)` : ""}`,
  };
  const externalId = `gmail:${tid}`;
  const [existing] = await db.select({ id: schema.communication.id }).from(schema.communication).where(eq(schema.communication.externalId, externalId));
  if (existing) {
    await db.update(schema.communication).set({ ...values, aiSummary: null }).where(eq(schema.communication.id, existing.id));
    return false;
  }
  const [c] = await db.insert(schema.communication).values({ ...values, externalId }).onConflictDoNothing().returning({ id: schema.communication.id });
  if (c) await log("email-logged", "communication", c.id, `Courriel « ${subject} » (${box}) ajouté aux communications`, { deleteRecord: { table: "communication", id: c.id } });
  return Boolean(c);
}

async function adminFolder(entityCode: string) {
  const ids = await sharedDriveIds();
  const root = ids[ADMIN_DRIVE];
  if (!root) return null;
  const entity = entityCode === "MGS" ? "Megascale" : entityCode === "OTP" ? "Otopio Inc." : "Freelance";
  const find = async (parent: string, name: string) =>
    (await drive.list(ADMIN, `'${parent}' in parents and name='${name}' and mimeType='${FOLDER}' and trashed=false`, { driveId: root }))[0]?.id ?? (await drive.createFolder(ADMIN, name, parent)).id;
  // Administratif / Dépenses / <structure>
  return find(await find(root, "Dépenses"), entity);
}

async function detectInvoice(box: string, msgId: string, dir: Dir) {
  const [dup] = await db.select({ id: schema.transaction.id }).from(schema.transaction).where(eq(schema.transaction.externalRef, `gmail:${msgId}`));
  if (dup) return false;
  const m: GmailMessage | null = await gmail.message(box, msgId).catch(() => null);
  if (!m) return false;
  const from = addresses(header(m, "From"))[0] ?? "";
  if (from.endsWith("@otopio.ca")) return false;
  const subject = header(m, "Subject");
  const pdfs = attachmentsOf(m).filter((a) => /pdf$/i.test(a.mimeType) || /\.pdf$/i.test(a.filename));
  if (!pdfs.length || !INVOICE.test(`${subject} ${m.snippet} ${pdfs.map((p) => p.filename).join(" ")}`)) return false;
  // client invoices we send are not supplier bills
  const mm = dir.match([from]);
  if (mm.org && mm.org.type === "client") return false;
  if (!aiEnabled()) return false;
  const body = textBody(m).slice(0, 6000);
  const x = await ai<{ isSupplierInvoice: boolean; supplier: string; number: string | null; date: string | null; total: number | null; subtotal: number | null; tax: number | null; currency: string; paid: boolean; entity: "OTP" | "MGS"; category: string }>(
    "Tu analyses un courriel reçu par Otopio (agence TI ; deux structures : OTP = Otopio Inc., Canada, CAD ; MGS = Megascale Technologie, France, EUR). Détermine s'il s'agit d'une facture ou d'un reçu FOURNISSEUR (une dépense pour Otopio). Catégories possibles : software, hosting, ai, subcontracting, legal, accounting, marketing, office, travel, other.",
    `Expéditeur: ${header(m, "From")}\nDestinataire: ${box}\nObjet: ${subject}\nPièces jointes: ${pdfs.map((p) => p.filename).join(", ")}\n\n${body}\n\nJSON attendu: {"isSupplierInvoice":bool,"supplier":string,"number":string|null,"date":"YYYY-MM-DD"|null,"total":number|null,"subtotal":number|null,"tax":number|null,"currency":"CAD"|"EUR"|"USD","paid":bool,"entity":"OTP"|"MGS","category":string}`,
    true,
    "factures-gmail",
  );
  if (!x.isSupplierInvoice) return false;
  const [entity] = await db.select().from(schema.legalEntity).where(eq(schema.legalEntity.code, x.entity === "MGS" ? "MGS" : "OTP"));
  if (!entity) return false;
  let supplier = dir.orgs.find((o) => o.name.toLowerCase() === x.supplier.toLowerCase()) ?? (mm.org && mm.org.type !== "client" ? mm.org : null);
  if (!supplier) {
    [supplier] = await db.insert(schema.organization).values({ name: x.supplier, type: "supplier", status: "active", email: from, notes: "Créé automatiquement depuis une facture reçue." }).returning();
    dir.orgs.push(supplier!);
  }
  const date = x.date ?? new Date(Number(m.internalDate)).toISOString().slice(0, 10);
  // store PDF in Admin drive
  let fileUrl: string | null = null;
  let driveFileId: string | null = null;
  const folder = await adminFolder(entity.code);
  if (folder) {
    const a = pdfs[0]!;
    const data = await gmail.attachment(box, msgId, a.attachmentId);
    const name = `${date} — ${x.supplier} — Facture — ${x.number ?? a.filename.replace(/\.pdf$/i, "")}.pdf`.replace(/[\/]/g, "-");
    const f = await drive.upload(ADMIN, name, folder, new Uint8Array(Buffer.from(data.data, "base64url")), "application/pdf");
    fileUrl = f.webViewLink ?? null;
    driveFileId = f.id;
  }
  const cats = ["software", "hosting", "ai", "subcontracting", "legal", "accounting", "marketing", "office", "travel", "other"];
  const [b] = await db
    .insert(schema.transaction)
    .values({
      kind: "expense",
      side: "debit",
      label: `${x.supplier}${x.number ? ` — ${x.number}` : ""}`,
      number: x.number,
      legalEntityId: entity.id,
      organizationId: supplier!.id,
      category: (cats.includes(x.category) ? x.category : "other") as never,
      status: x.paid ? "paid" : "to_pay",
      date,
      paidAt: x.paid ? date : null,
      currency: x.currency || entity.currency,
      total: x.total ?? 0,
      subtotal: x.subtotal ?? x.total ?? 0,
      taxTotal: x.tax ?? 0,
      fileUrl,
      driveFileId,
      externalRef: `gmail:${msgId}`,
      notes: `Détectée automatiquement dans ${box} (« ${subject} »).`,
    })
    .returning({ id: schema.transaction.id });
  await log("bill-detected", "transaction", b!.id, `Facture ${x.supplier} ${x.total ?? "?"} ${x.currency} détectée (${box}) — PDF rangé dans le Drive admin`, { deleteRecord: { table: "transaction", id: b!.id }, trashDriveFile: driveFileId });
  return true;
}
