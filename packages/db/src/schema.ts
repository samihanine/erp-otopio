import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  bigint,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const id = () => uuid("id").primaryKey().defaultRandom();
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* -------------------------------------------------------------------------- */
/*  Auth (better-auth)                                                        */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("member"),
  locale: text("locale").notNull().default("fr"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

export const accountingProvider = pgEnum("accounting_provider", ["qonto", "quickbooks", "none", "other"]);
export const organizationType = pgEnum("organization_type", ["client", "lead", "supplier", "partner", "internal", "other"]);
export const organizationStatus = pgEnum("organization_status", ["active", "former", "prospect", "no_contact", "lost"]);
export const projectStatus = pgEnum("project_status", ["idea", "planned", "in_progress", "on_hold", "delivered", "maintenance", "cancelled"]);
export const taskStatus = pgEnum("task_status", ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"]);
export const priority = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const billCategory = pgEnum("bill_category", [
  "software",
  "hosting",
  "ai",
  "subcontracting",
  "legal",
  "accounting",
  "marketing",
  "office",
  "travel",
  "other",
  // personal life categories
  "subscription",
  "transport",
  "flight",
  "accommodation",
  "restaurant",
  "groceries",
  "shopping",
  "concert",
  "leisure",
  "health",
  "housing",
  "utilities",
  "telecom",
  "education",
  "bank_fees",
  "taxes",
  "gift",
]);
export const expenseScope = pgEnum("expense_scope", ["pro", "perso", "mixed"]);
export const cardBrand = pgEnum("card_brand", ["visa", "mastercard", "amex", "interac", "paypal", "apple_pay", "other"]);
export const recurrence = pgEnum("recurrence", ["none", "monthly", "quarterly", "yearly"]);
export const quoteStatus = pgEnum("quote_status", ["draft", "sent", "accepted", "rejected", "expired"]);
export const contentStatus = pgEnum("content_status", ["idea", "draft", "review", "scheduled", "published", "archived"]);
export const socialNetwork = pgEnum("social_network", ["linkedin", "instagram", "x", "facebook", "tiktok", "youtube"]);
export const ticketStatus = pgEnum("ticket_status", ["new", "triaged", "in_progress", "waiting_client", "resolved", "closed"]);
export const ticketCategory = pgEnum("ticket_category", ["bug", "feature", "content", "support", "billing", "other"]);
export const documentKind = pgEnum("document_kind", ["template", "document"]);
export const documentType = pgEnum("document_type", ["quote", "invoice", "contract", "sow", "nda", "report", "free"]);
export const transactionSide = pgEnum("transaction_side", ["credit", "debit"]);
export const communicationType = pgEnum("communication_type", [
  "email",
  "google_meet",
  "teams",
  "zoom",
  "phone",
  "whatsapp",
  "sms",
  "linkedin",
  "in_person",
  "other",
]);
export const communicationDirection = pgEnum("communication_direction", ["inbound", "outbound", "internal"]);

/* -------------------------------------------------------------------------- */
/*  Billing structures (Megascale FR, Otopio Inc. CA, …)                      */
/* -------------------------------------------------------------------------- */

export type TaxRate = { code: string; label: string; rate: number };
export type BankDetails = { label: string; value: string }[];

export const legalEntity = pgTable("legal_entity", {
  id: id(),
  code: text("code").notNull().unique(), // "MGS", "OTP"
  name: text("name").notNull(),
  legalName: text("legal_name").notNull(),
  legalForm: text("legal_form"),
  country: text("country").notNull(), // ISO-2
  currency: text("currency").notNull(), // ISO-4217
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  postalCode: text("postal_code"),
  city: text("city"),
  region: text("region"),
  email: text("email"),
  phone: text("phone"),
  registrationNumber: text("registration_number"), // SIREN/SIRET, NEQ…
  taxIds: jsonb("tax_ids").$type<{ label: string; value: string }[]>().notNull().default([]),
  defaultTaxes: jsonb("default_taxes").$type<TaxRate[]>().notNull().default([]),
  bankDetails: jsonb("bank_details").$type<BankDetails>().notNull().default([]),
  paymentTerms: text("payment_terms"),
  legalMentions: text("legal_mentions"),
  invoicePrefix: text("invoice_prefix").notNull(),
  quotePrefix: text("quote_prefix").notNull(),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  nextQuoteNumber: integer("next_quote_number").notNull().default(1),
  accountingProvider: accountingProvider("accounting_provider").notNull().default("none"),
  accountingConnected: boolean("accounting_connected").notNull().default(false),
  color: text("color").notNull().default("#1c3266"),
  /* ---- workspace (one workspace = one structure) ---- */
  slug: text("slug").unique(),
  /** modules (sidebar tabs) turned off for this workspace */
  disabledModules: text("disabled_modules").array().notNull().default([]),
  websiteDomain: text("website_domain"),
  /** Drive storage: shared drives (clients/admin) or a folder in a personal Drive (personalEmail + folderId) */
  drive: jsonb("drive").$type<WorkspaceDrive>().notNull().default({}),
  /** mailboxes synced into this workspace (Gmail) */
  mailboxes: text("mailboxes").array().notNull().default([]),
  ...timestamps,
});

/**
 * Drive storage of a workspace:
 *  - Otopio Inc.: two shared drives (clients, admin)
 *  - Megascale: one shared drive (root) holding « Clients » and « Administratif » folders
 *  - freelances: an « ERP » folder (folderId) of the personal Drive (personalEmail) holding the same two folders
 */
export type WorkspaceDrive = { clients?: string; admin?: string; root?: string; personalEmail?: string; folderId?: string; clientsFolder?: string; adminFolder?: string; legacy?: string[] };

/** Who can open a workspace. `email` may be a domain wildcard ("*@otopio.ca"). */
export const workspaceMember = pgTable(
  "workspace_member",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    /** admin | member | viewer */
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [uniqueIndex("workspace_member_uq").on(t.workspaceId, t.email)],
);

/* -------------------------------------------------------------------------- */
/*  CRM                                                                       */
/* -------------------------------------------------------------------------- */

export const organization = pgTable(
  "organization",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    type: organizationType("type").notNull().default("client"),
    status: organizationStatus("status").notNull().default("prospect"),
    industry: text("industry"),
    website: text("website"),
    email: text("email"),
    phone: text("phone"),
    addressLine1: text("address_line1"),
    postalCode: text("postal_code"),
    city: text("city"),
    country: text("country"),
    registrationNumber: text("registration_number"),
    vatNumber: text("vat_number"),
    logoUrl: text("logo_url"),
    firstMetAt: date("first_met_at"),
    defaultEntityId: uuid("default_entity_id").references(() => legalEntity.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    driveFolderId: text("drive_folder_id"),
    /** other workspaces that have their own record for the same company (codes, informative only) */
    alsoIn: text("also_in").array().notNull().default([]),
    aiSummary: text("ai_summary"),
    aiSummaryAt: timestamp("ai_summary_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("organization_type_idx").on(t.type), index("organization_name_idx").on(t.name)],
);

export const person = pgTable(
  "person",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    linkedinUrl: text("linkedin_url"),
    avatarUrl: text("avatar_url"),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    isPrimaryContact: boolean("is_primary_contact").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("person_org_idx").on(t.organizationId)],
);

/** Log of every exchange with a contact: emails, meetings, calls, messages. */
export const communication = pgTable(
  "communication",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    subject: text("subject").notNull(),
    type: communicationType("type").notNull().default("email"),
    direction: communicationDirection("direction").notNull().default("outbound"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    durationMinutes: integer("duration_minutes"),
    personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    projectId: uuid("project_id"),
    participants: text("participants").array().notNull().default([]),
    mailbox: text("mailbox"), // contact@ / sami@ / maissane@…
    meetingUrl: text("meeting_url"),
    sourceUrl: text("source_url"), // Gmail thread, WhatsApp export…
    externalId: text("external_id"), // e.g. Gmail thread id (dedup)
    attachments: text("attachments").array().notNull().default([]),
    attachmentUrl: text("attachment_url"),
    summary: text("summary"),
    nextSteps: text("next_steps"),
    eventId: uuid("event_id"),
    aiSummary: text("ai_summary"),
    ...timestamps,
  },
  (t) => [
    index("communication_person_idx").on(t.personId),
    index("communication_org_idx").on(t.organizationId),
    index("communication_date_idx").on(t.occurredAt),
    uniqueIndex("communication_external_uq").on(t.externalId),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Delivery                                                                  */
/* -------------------------------------------------------------------------- */

export const project = pgTable(
  "project",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    name: text("name").notNull(),
    code: text("code"),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    legalEntityId: uuid("legal_entity_id").references(() => legalEntity.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => person.id, { onDelete: "set null" }),
    status: projectStatus("status").notNull().default("planned"),
    priority: priority("priority").notNull().default("medium"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    budget: money("budget"),
    currency: text("currency").notNull().default("CAD"),
    progress: integer("progress").notNull().default(0),
    websiteUrl: text("website_url"),
    githubRepo: text("github_repo"), // "owner/name"
    description: text("description"),
    color: text("color"),
    ...timestamps,
  },
  (t) => [index("project_org_idx").on(t.organizationId), index("project_status_idx").on(t.status)],
);

export const task = pgTable(
  "task",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    title: text("title").notNull(),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id").references(() => person.id, { onDelete: "set null" }),
    ticketId: uuid("ticket_id"),
    status: taskStatus("status").notNull().default("todo"),
    priority: priority("priority").notNull().default("medium"),
    labels: text("labels").array().notNull().default([]),
    estimateHours: numeric("estimate_hours", { precision: 8, scale: 2, mode: "number" }),
    spentHours: numeric("spent_hours", { precision: 8, scale: 2, mode: "number" }).notNull().default(0),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: date("completed_at"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("task_project_idx").on(t.projectId), index("task_status_idx").on(t.status)],
);

export const ticket = pgTable(
  "ticket",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    number: integer("number").generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    requesterId: uuid("requester_id").references(() => person.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => person.id, { onDelete: "set null" }),
    status: ticketStatus("status").notNull().default("new"),
    priority: priority("priority").notNull().default("medium"),
    category: ticketCategory("category").notNull().default("support"),
    clientVisible: boolean("client_visible").notNull().default(true),
    dueDate: date("due_date"),
    resolvedAt: date("resolved_at"),
    description: text("description"),
    acceptanceCriteria: text("acceptance_criteria"),
    ...timestamps,
  },
  (t) => [index("ticket_project_idx").on(t.projectId)],
);

/* -------------------------------------------------------------------------- */
/*  Finance                                                                   */
/* -------------------------------------------------------------------------- */

export type DocumentLine = {
  id: string;
  description: string;
  details?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  discount?: number;
};
export type AppliedTax = { code: string; label: string; rate: number; amount: number };

export const quote = pgTable(
  "quote",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    number: text("number").notNull(),
    title: text("title").notNull(),
    legalEntityId: uuid("legal_entity_id")
      .notNull()
      .references(() => legalEntity.id),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => person.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
    status: quoteStatus("status").notNull().default("draft"),
    issueDate: date("issue_date"),
    validUntil: date("valid_until"),
    currency: text("currency").notNull(),
    lines: jsonb("lines").$type<DocumentLine[]>().notNull().default([]),
    taxes: jsonb("taxes").$type<AppliedTax[]>().notNull().default([]),
    subtotal: money("subtotal").notNull().default(0),
    taxTotal: money("tax_total").notNull().default(0),
    total: money("total").notNull().default(0),
    introduction: text("introduction"),
    scope: text("scope"), // cahier des charges (markdown)
    terms: text("terms"),
    googleDocId: text("google_doc_id"),
    fileUrl: text("file_url"),
    ...timestamps,
  },
  (t) => [uniqueIndex("quote_number_uq").on(t.legalEntityId, t.number)],
);

export const creditCard = pgTable("credit_card", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => legalEntity.id),
  label: text("label").notNull(),
  brand: cardBrand("brand").notNull().default("visa"),
  last4: text("last4"),
  issuer: text("issuer"),
  holder: text("holder"),
  expiry: text("expiry"), // MM/YY
  legalEntityId: uuid("legal_entity_id").references(() => legalEntity.id, { onDelete: "set null" }),
  scope: expenseScope("scope").notNull().default("perso"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  ...timestamps,
});

/**
 * Single financial ledger: every income and expense lives here.
 *  - kind "invoice"  : sales invoice issued to a client (numbered, line items, PDF)          — side credit
 *  - kind "expense"  : supplier invoice / receipt / card purchase (justificatif in fileUrl)    — side debit
 *  - kind "movement" : bank movement without a business document (capital, transfers, taxes…)
 * Bank feed data (Qonto / QuickBooks) is merged into the row it pays (bankRef, paidAt, counterparty);
 * extra partial payments stay as "movement" rows pointing to their document through parentId.
 */
export const transaction = pgTable(
  "transaction",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    kind: text("kind").notNull().default("movement"),
    side: transactionSide("side").notNull(),
    legalEntityId: uuid("legal_entity_id")
      .notNull()
      .references(() => legalEntity.id),
    /** issue date for documents, value date for bank movements */
    date: date("date").notNull(),
    label: text("label").notNull(),
    number: text("number"),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quote.id, { onDelete: "set null" }),
    /** client the expense relates to (e.g. hosting of a client's app) */
    clientId: uuid("client_id").references(() => organization.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    category: billCategory("category"),
    /** draft | sent | partial | paid | overdue | lost | to_pay | scheduled | cancelled */
    status: text("status").notNull().default("paid"),
    dueDate: date("due_date"),
    paidAt: date("paid_at"),
    currency: text("currency").notNull(),
    lines: jsonb("lines").$type<DocumentLine[]>().notNull().default([]),
    taxes: jsonb("taxes").$type<AppliedTax[]>().notNull().default([]),
    subtotal: money("subtotal").notNull().default(0),
    taxTotal: money("tax_total").notNull().default(0),
    total: money("total").notNull().default(0),
    amountPaid: money("amount_paid").notNull().default(0),
    recurrence: recurrence("recurrence").notNull().default("none"),
    paymentMethod: text("payment_method"),
    cardId: uuid("card_id").references(() => creditCard.id, { onDelete: "set null" }),
    /** who bears the cost: entity | client | reimburse (paid with a personal card) | other */
    paidBy: text("paid_by").notNull().default("entity"),
    scope: expenseScope("scope").notNull().default("pro"),
    /** recurring subscription still running */
    active: boolean("active").notNull().default(false),
    /** operating (default) | capital | transfer | tax — only operating credits count as revenue */
    nature: text("nature").notNull().default("operating"),
    counterparty: text("counterparty"),
    source: accountingProvider("source").notNull().default("none"),
    /** bank feed id (e.g. "qonto:80e8f7") */
    bankRef: text("bank_ref"),
    /** origin of the document (e.g. "gmail:<msgId>", QuickBooks id) */
    externalRef: text("external_ref"),
    fileUrl: text("file_url"),
    driveFileId: text("drive_file_id"),
    googleDocId: text("google_doc_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("transaction_entity_idx").on(t.legalEntityId),
    index("transaction_date_idx").on(t.date),
    index("transaction_kind_idx").on(t.kind),
    index("transaction_org_idx").on(t.organizationId),
    uniqueIndex("transaction_number_uq").on(t.legalEntityId, t.number).where(sql`kind = 'invoice'`),
    uniqueIndex("transaction_bank_ref_uq").on(t.bankRef),
  ],
);

/* -------------------------------------------------------------------------- */
/*  Marketing                                                                 */
/* -------------------------------------------------------------------------- */

export const article = pgTable("article", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => legalEntity.id),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  locale: text("locale").notNull().default("fr"),
  status: contentStatus("status").notNull().default("idea"),
  excerpt: text("excerpt"),
  content: text("content"),
  keywords: text("keywords").array().notNull().default([]),
  targetQuery: text("target_query"),
  coverUrl: text("cover_url"),
  authorId: uuid("author_id").references(() => person.id, { onDelete: "set null" }),
  publishedAt: date("published_at"),
  seoScore: integer("seo_score"),
  category: text("category"),
  readingMinutes: integer("reading_minutes"),
  /** other languages: { en: { title, excerpt, content } } — base fields are French */
  translations: jsonb("translations").$type<Translations>().notNull().default({}),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*  Website (CMS for otopio.ca)                                               */
/* -------------------------------------------------------------------------- */

export type Translations = Record<string, Record<string, unknown>>;
export type ArtifactSection = {
  type: "image-text" | "text-image" | "card" | "cards" | "banner" | "gallery" | "stats" | "quote";
  title?: string;
  description?: string;
  imageUrl?: string;
  lucideIcon?: string;
  subsections?: { title?: string; description?: string; imageUrl?: string; lucideIcon?: string }[];
};

/** Portfolio project shown on the website ("réalisation"). */
export const artifact = pgTable("artifact", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => legalEntity.id),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  customer: text("customer"),
  status: contentStatus("status").notNull().default("draft"),
  position: integer("position").notNull().default(0),
  summary: text("summary"),
  description: text("description"),
  imageUrl: text("image_url"),
  url: text("url"),
  startedAt: date("started_at"),
  endedAt: date("ended_at"),
  tags: text("tags").array().notNull().default([]),
  lucideIcon: text("lucide_icon"),
  hexColor: text("hex_color"),
  sections: jsonb("sections").$type<ArtifactSection[]>().notNull().default([]),
  organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
  translations: jsonb("translations").$type<Translations>().notNull().default({}),
  ...timestamps,
});

export const teamMember = pgTable("team_member", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => legalEntity.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  role: text("role"),
  bio: text("bio"),
  group: text("group_key").notNull().default("team"), // founders | team
  imageUrl: text("image_url"),
  linkedin: text("linkedin"),
  status: contentStatus("status").notNull().default("published"),
  position: integer("position").notNull().default(0),
  personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
  translations: jsonb("translations").$type<Translations>().notNull().default({}),
  ...timestamps,
});

export const post = pgTable("post", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => legalEntity.id),
  title: text("title").notNull(),
  network: socialNetwork("network").notNull().default("linkedin"),
  status: contentStatus("status").notNull().default("idea"),
  content: text("content"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  url: text("url"),
  imageUrl: text("image_url"),
  articleId: uuid("article_id").references(() => article.id, { onDelete: "set null" }),
  authorId: uuid("author_id").references(() => person.id, { onDelete: "set null" }),
  ...timestamps,
});

/* -------------------------------------------------------------------------- */
/*  Workspace: documents, files, saved views                                  */
/* -------------------------------------------------------------------------- */

export const document = pgTable("document", {
  id: id(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => legalEntity.id),
  title: text("title").notNull(),
  kind: documentKind("kind").notNull().default("document"),
  type: documentType("type").notNull().default("free"),
  icon: text("icon"),
  content: text("content"), // markdown, with {{variables}} for templates
  templateId: uuid("template_id"),
  organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
  googleDocId: text("google_doc_id"),
  fileUrl: text("file_url"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  // Google Drive mirror
  driveFileId: text("drive_file_id").unique(),
  driveId: text("drive_id"),
  parentId: text("parent_id"),
  path: text("path"),
  mimeType: text("mime_type"),
  size: bigint("size", { mode: "number" }),
  webViewLink: text("web_view_link"),
  thumbnailLink: text("thumbnail_link"),
  isFolder: boolean("is_folder").notNull().default(false),
  modifiedAt: timestamp("modified_at", { withTimezone: true }),
  // Foreign keys to business records using this file
  invoiceId: uuid("invoice_id").references(() => transaction.id, { onDelete: "set null" }),
  quoteId: uuid("quote_id").references(() => quote.id, { onDelete: "set null" }),
  billId: uuid("bill_id").references(() => transaction.id, { onDelete: "set null" }),
  communicationId: uuid("communication_id"),
  // Files dropped by a client in the portal
  /** to_sort (new upload waiting for an admin) | sorted */
  status: text("status"),
  /** invoice | expense | legal | deliverable | other */
  category: text("category"),
  description: text("description"),
  uploadedBy: text("uploaded_by"),
  ...timestamps,
});

/** Client portal: emails allowed to see one client record (read-only) and drop files. */
export const portalAccess = pgTable(
  "portal_access",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    active: boolean("active").notNull().default(true),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("portal_access_uq").on(t.organizationId, t.email), index("portal_access_email_idx").on(t.email)],
);

export const file = pgTable("file", {
  id: id(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  mimeType: text("mime_type").notNull(),
  table: text("table_name"),
  recordId: uuid("record_id"),
  workspaceId: uuid("workspace_id").references(() => legalEntity.id),
  uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

export type ViewFilter = { id: string; field: string; op: string; value?: unknown };
export type ViewSort = { field: string; dir: "asc" | "desc" };
export type ViewConfig = {
  filters: ViewFilter[];
  filterMode?: "and" | "or";
  sorts: ViewSort[];
  hiddenFields: string[];
  fieldOrder?: string[];
  columnWidths?: Record<string, number>;
  groupBy?: string | null;
  dateField?: string | null;
  endDateField?: string | null;
  coverField?: string | null;
  search?: string;
};

export const savedView = pgTable(
  "saved_view",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    table: text("table_name").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull().default("table"), // table | kanban | gantt | calendar | gallery | list
    icon: text("icon"),
    config: jsonb("config").$type<ViewConfig>().notNull(),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("saved_view_table_idx").on(t.table)],
);

export const activity = pgTable(
  "activity",
  {
    id: id(),
    table: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(), // created | updated | deleted | comment
    changes: jsonb("changes").$type<Record<string, { from: unknown; to: unknown }>>(),
    comment: text("comment"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_record_idx").on(t.table, t.recordId)],
);

/* -------------------------------------------------------------------------- */
/*  MCP (OAuth 2.1 for Claude / ChatGPT connectors)                           */
/* -------------------------------------------------------------------------- */

export const mcpClient = pgTable("mcp_client", {
  id: text("id").primaryKey(), // client_id
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mcpToken = pgTable(
  "mcp_token",
  {
    id: id(),
    kind: text("kind").notNull(), // code | access | refresh
    tokenHash: text("token_hash").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => mcpClient.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeChallenge: text("code_challenge"),
    redirectUri: text("redirect_uri"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mcp_token_hash_uq").on(t.tokenHash)],
);


/* -------------------------------------------------------------------------- */
/*  Calendar + sync state                                                     */
/* -------------------------------------------------------------------------- */

export const event = pgTable(
  "event",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => legalEntity.id),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    isPrivate: boolean("is_private").notNull().default(false),
    status: text("status").notNull().default("confirmed"),
    meetUrl: text("meet_url"),
    calendarOwner: text("calendar_owner").notNull(), // member email
    organizer: text("organizer"),
    attendees: text("attendees").array().notNull().default([]),
    organizationId: uuid("organization_id").references(() => organization.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => project.id, { onDelete: "set null" }),
    personId: uuid("person_id").references(() => person.id, { onDelete: "set null" }),
    googleEventId: text("google_event_id"),
    htmlLink: text("html_link"),
    /** Google recurring series id (recurringEventId) shared by every occurrence */
    seriesId: text("series_id"),
    /** human readable recurrence of the series, e.g. "Chaque semaine (lun.)" */
    recurrence: text("recurrence"),
    /** meeting | call | personal | all_day | travel | deadline | other */
    kind: text("kind"),
    /** internal ERP note (not synced to Google) */
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("event_series_idx").on(t.seriesId), uniqueIndex("event_google_uq").on(t.calendarOwner, t.googleEventId), index("event_start_idx").on(t.startAt)],
);

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per LLM call — cost tracking (Settings → IA). */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    feature: text("feature").notNull(),
    workspaceId: uuid("workspace_id"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** USD */
    cost: numeric("cost", { precision: 12, scale: 6 }).notNull().default("0"),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);
