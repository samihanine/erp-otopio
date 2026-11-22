/**
 * Table metadata — single source of truth for the generic data API and every
 * front-end view (table, kanban, gantt, calendar, gallery, detail).
 */

export type Locale = "fr" | "en";
export type I18n = { fr: string; en: string };

export type Color = "gray" | "blue" | "sky" | "green" | "yellow" | "orange" | "red" | "purple" | "pink" | "teal" | "indigo";

export type SelectOption = { value: string; label: I18n; color: Color };

export type FieldType =
  | "text"
  | "longtext"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "select"
  | "tags"
  | "relation"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "repo"
  | "lines"
  /** structured page blocks (website artifacts) */
  | "sections"
  /** image URL with upload to Cloudflare R2 */
  | "image";

export type FieldDef = {
  key: string;
  label: I18n;
  type: FieldType;
  options?: SelectOption[];
  /** relation target table */
  relation?: TableKey;
  /** restrict relation choices, e.g. "employees" = people with an @otopio.ca address */
  relationScope?: "employees";
  /** for currency fields, the key of the field holding the ISO currency */
  currencyField?: string;
  required?: boolean;
  readOnly?: boolean;
  /** hidden by default in table views */
  hidden?: boolean;
  width?: number;
};

export type TableKey =
  | "organization"
  | "person"
  | "communication"
  | "project"
  | "task"
  | "ticket"
  | "quote"
  | "transaction"
  | "article"
  | "post"
  | "document"
  | "event"
  | "legal_entity"
  | "artifact"
  | "team_member"
  | "credit_card";

export type ViewType = "table" | "kanban" | "gantt" | "calendar" | "gallery" | "list";

export type TableDef = {
  key: TableKey;
  label: I18n;
  singular: I18n;
  icon: string; // lucide icon name
  color: Color;
  group: "crm" | "delivery" | "finance" | "marketing" | "settings";
  primary: string;
  /** fields that can be translated (stored in the `translations` json column, base = French) */
  translatable?: string[];
  /** secondary field shown under the title (cards, relation chips) */
  subtitle?: string;
  fields: FieldDef[];
  views: ViewType[];
  kanbanField?: string;
  dateField?: string;
  startField?: string;
  endField?: string;
  coverField?: string;
  searchFields: string[];
  defaultSort?: { field: string; dir: "asc" | "desc" };
};

const L = (fr: string, en: string): I18n => ({ fr, en });
const o = (value: string, fr: string, en: string, color: Color): SelectOption => ({ value, label: L(fr, en), color });

/* -------------------------------------------------------------------------- */
/*  Shared option sets                                                        */
/* -------------------------------------------------------------------------- */

export const PRIORITY_OPTIONS = [
  o("low", "Basse", "Low", "gray"),
  o("medium", "Moyenne", "Medium", "blue"),
  o("high", "Haute", "High", "orange"),
  o("urgent", "Urgente", "Urgent", "red"),
];

export const CURRENCY_OPTIONS = [o("CAD", "CAD", "CAD", "red"), o("EUR", "EUR", "EUR", "blue"), o("USD", "USD", "USD", "green")];

export const CONTENT_STATUS_OPTIONS = [
  o("idea", "Idée", "Idea", "gray"),
  o("draft", "Brouillon", "Draft", "yellow"),
  o("review", "Relecture", "Review", "orange"),
  o("scheduled", "Planifié", "Scheduled", "blue"),
  o("published", "Publié", "Published", "green"),
  o("archived", "Archivé", "Archived", "gray"),
];

const timestampsFields: FieldDef[] = [
  { key: "createdAt", label: L("Créé le", "Created"), type: "datetime", readOnly: true, hidden: true },
  { key: "updatedAt", label: L("Modifié le", "Updated"), type: "datetime", readOnly: true, hidden: true },
];

/* -------------------------------------------------------------------------- */
/*  Tables                                                                    */
/* -------------------------------------------------------------------------- */

export const TABLES: Record<TableKey, TableDef> = {
  organization: {
    key: "organization",
    label: L("Organisations", "Organizations"),
    singular: L("Organisation", "Organization"),
    icon: "Building2",
    color: "blue",
    group: "crm",
    primary: "name",
    subtitle: "website",
    views: ["table", "kanban", "gallery", "list"],
    kanbanField: "status",
    coverField: "logoUrl",
    searchFields: ["name", "legalName", "website", "email", "city"],
    defaultSort: { field: "name", dir: "asc" },
    fields: [
      { key: "name", label: L("Nom", "Name"), type: "text", required: true, width: 220 },
      {
        key: "type",
        label: L("Type", "Type"),
        type: "select",
        options: [
          o("client", "Client", "Client", "green"),
          o("lead", "Lead", "Lead", "blue"),
          o("supplier", "Fournisseur", "Supplier", "purple"),
          o("partner", "Partenaire", "Partner", "teal"),
          o("internal", "Interne", "Internal", "indigo"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      {
        key: "status",
        label: L("Statut", "Status"),
        type: "select",
        options: [
          o("active", "Actif", "Active", "green"),
          o("prospect", "Prospect", "Prospect", "blue"),
          o("former", "Ancien", "Former", "gray"),
          o("no_contact", "Sans contact", "No contact", "yellow"),
          o("lost", "Perdu", "Lost", "red"),
        ],
      },
      { key: "industry", label: L("Secteur", "Industry"), type: "text" },
      { key: "website", label: L("Site web", "Website"), type: "url", width: 200 },
      { key: "email", label: L("Courriel", "Email"), type: "email" },
      { key: "phone", label: L("Téléphone", "Phone"), type: "phone", hidden: true },
      { key: "city", label: L("Ville", "City"), type: "text" },
      { key: "country", label: L("Pays", "Country"), type: "text", width: 90 },
      { key: "legalName", label: L("Raison sociale", "Legal name"), type: "text", hidden: true },
      { key: "addressLine1", label: L("Adresse", "Address"), type: "text", hidden: true },
      { key: "postalCode", label: L("Code postal", "Postal code"), type: "text", hidden: true },
      { key: "registrationNumber", label: L("N° d'entreprise", "Registration #"), type: "text", hidden: true },
      { key: "vatNumber", label: L("N° de TVA / taxes", "Tax number"), type: "text", hidden: true },
      { key: "defaultEntityId", label: L("Structure de facturation", "Billing entity"), type: "relation", relation: "legal_entity" },
      { key: "firstMetAt", label: L("1re rencontre", "First met"), type: "date", hidden: true },
      { key: "tags", label: L("Étiquettes", "Tags"), type: "tags" },
      { key: "logoUrl", label: L("Logo", "Logo"), type: "url", hidden: true },
      { key: "driveFolderId", label: L("Dossier Drive", "Drive folder"), type: "text", hidden: true, readOnly: true },
      { key: "notes", label: L("Notes", "Notes"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  person: {
    key: "person",
    label: L("Personnes", "People"),
    singular: L("Personne", "Person"),
    icon: "Users",
    color: "purple",
    group: "crm",
    primary: "firstName",
    subtitle: "jobTitle",
    views: ["table", "gallery", "list"],
    coverField: "avatarUrl",
    searchFields: ["firstName", "lastName", "email", "jobTitle"],
    defaultSort: { field: "firstName", dir: "asc" },
    fields: [
      { key: "firstName", label: L("Prénom", "First name"), type: "text", required: true, width: 150 },
      { key: "lastName", label: L("Nom", "Last name"), type: "text", width: 150 },
      { key: "organizationId", label: L("Organisation", "Organization"), type: "relation", relation: "organization", width: 180 },
      { key: "jobTitle", label: L("Rôle", "Role"), type: "text" },
      { key: "email", label: L("Courriel", "Email"), type: "email", width: 220 },
      { key: "phone", label: L("Téléphone", "Phone"), type: "phone" },
      { key: "linkedinUrl", label: L("LinkedIn", "LinkedIn"), type: "url", hidden: true },
      { key: "isPrimaryContact", label: L("Contact principal", "Primary contact"), type: "checkbox" },
      { key: "avatarUrl", label: L("Photo", "Photo"), type: "url", hidden: true },
      { key: "notes", label: L("Notes", "Notes"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  communication: {
    key: "communication",
    label: L("Communications", "Communications"),
    singular: L("Communication", "Communication"),
    icon: "MessagesSquare",
    color: "teal",
    group: "crm",
    primary: "subject",
    subtitle: "personId",
    views: ["table", "list", "calendar", "kanban"],
    kanbanField: "type",
    dateField: "occurredAt",
    searchFields: ["subject", "summary", "nextSteps"],
    defaultSort: { field: "occurredAt", dir: "desc" },
    fields: [
      { key: "subject", label: L("Objet", "Subject"), type: "text", required: true, width: 280 },
      {
        key: "type",
        label: L("Canal", "Channel"),
        type: "select",
        options: [
          o("email", "Courriel", "Email", "blue"),
          o("google_meet", "Google Meet", "Google Meet", "green"),
          o("teams", "Teams", "Teams", "indigo"),
          o("zoom", "Zoom", "Zoom", "sky"),
          o("phone", "Appel", "Call", "orange"),
          o("whatsapp", "WhatsApp", "WhatsApp", "teal"),
          o("sms", "SMS", "SMS", "yellow"),
          o("linkedin", "LinkedIn", "LinkedIn", "purple"),
          o("in_person", "En personne", "In person", "pink"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      {
        key: "direction",
        label: L("Sens", "Direction"),
        type: "select",
        options: [o("inbound", "Reçu", "Inbound", "green"), o("outbound", "Envoyé", "Outbound", "blue"), o("internal", "Interne", "Internal", "gray")],
      },
      { key: "occurredAt", label: L("Date", "Date"), type: "datetime", width: 170 },
      { key: "personId", label: L("Personne", "Person"), type: "relation", relation: "person", width: 170 },
      { key: "organizationId", label: L("Organisation", "Organization"), type: "relation", relation: "organization", width: 160 },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project" },
      { key: "durationMinutes", label: L("Durée (min)", "Duration (min)"), type: "number", hidden: true },
      { key: "meetingUrl", label: L("Lien de réunion", "Meeting link"), type: "url", hidden: true },
      { key: "sourceUrl", label: L("Source (Gmail…)", "Source (Gmail…)"), type: "url" },
      { key: "eventId", label: L("Événement", "Event"), type: "relation", relation: "event", hidden: true },
      { key: "aiSummary", label: L("Résumé IA", "AI summary"), type: "longtext", hidden: true, readOnly: true },
      { key: "mailbox", label: L("Boîte", "Mailbox"), type: "text", hidden: true },
      { key: "externalId", label: L("Identifiant source", "Source id"), type: "text", hidden: true },
      { key: "participants", label: L("Participants", "Participants"), type: "tags", hidden: true },
      { key: "attachments", label: L("Pièces jointes", "Attachments"), type: "tags" },
      { key: "attachmentUrl", label: L("Lien pièce jointe", "Attachment link"), type: "url", hidden: true },
      { key: "summary", label: L("Résumé", "Summary"), type: "longtext", hidden: true },
      { key: "nextSteps", label: L("Prochaines étapes", "Next steps"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  project: {
    key: "project",
    label: L("Projets", "Projects"),
    singular: L("Projet", "Project"),
    icon: "FolderKanban",
    color: "orange",
    group: "delivery",
    primary: "name",
    subtitle: "organizationId",
    views: ["table", "kanban", "gantt", "calendar", "gallery"],
    kanbanField: "status",
    dateField: "dueDate",
    startField: "startDate",
    endField: "dueDate",
    searchFields: ["name", "code", "description", "githubRepo"],
    defaultSort: { field: "startDate", dir: "desc" },
    fields: [
      { key: "name", label: L("Nom", "Name"), type: "text", required: true, width: 220 },
      { key: "organizationId", label: L("Client", "Client"), type: "relation", relation: "organization", width: 170 },
      {
        key: "status",
        label: L("Statut", "Status"),
        type: "select",
        options: [
          o("idea", "Idée", "Idea", "gray"),
          o("planned", "Planifié", "Planned", "sky"),
          o("in_progress", "En cours", "In progress", "blue"),
          o("on_hold", "En pause", "On hold", "yellow"),
          o("delivered", "Livré", "Delivered", "green"),
          o("maintenance", "Maintenance", "Maintenance", "teal"),
          o("cancelled", "Annulé", "Cancelled", "red"),
        ],
      },
      { key: "priority", label: L("Priorité", "Priority"), type: "select", options: PRIORITY_OPTIONS },
      { key: "progress", label: L("Avancement", "Progress"), type: "percent", width: 120 },
      { key: "startDate", label: L("Début", "Start"), type: "date" },
      { key: "dueDate", label: L("Échéance", "Due"), type: "date" },
      { key: "budget", label: L("Budget", "Budget"), type: "currency", currencyField: "currency" },
      { key: "currency", label: L("Devise", "Currency"), type: "select", options: CURRENCY_OPTIONS, hidden: true },
      { key: "legalEntityId", label: L("Structure", "Entity"), type: "relation", relation: "legal_entity" },
      { key: "leadId", label: L("Responsable", "Lead"), type: "relation", relation: "person" },
      { key: "githubRepo", label: L("Repo GitHub", "GitHub repo"), type: "repo", width: 200 },
      { key: "websiteUrl", label: L("URL", "URL"), type: "url", hidden: true },
      { key: "code", label: L("Code", "Code"), type: "text", hidden: true },
      { key: "description", label: L("Description", "Description"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  task: {
    key: "task",
    label: L("Tâches", "Tasks"),
    singular: L("Tâche", "Task"),
    icon: "CircleCheck",
    color: "green",
    group: "delivery",
    primary: "title",
    subtitle: "projectId",
    views: ["table", "kanban", "gantt", "calendar", "list"],
    kanbanField: "status",
    dateField: "dueDate",
    startField: "startDate",
    endField: "dueDate",
    searchFields: ["title", "description"],
    defaultSort: { field: "dueDate", dir: "asc" },
    fields: [
      { key: "title", label: L("Titre", "Title"), type: "text", required: true, width: 260 },
      {
        key: "status",
        label: L("Statut", "Status"),
        type: "select",
        options: [
          o("backlog", "Backlog", "Backlog", "gray"),
          o("todo", "À faire", "To do", "sky"),
          o("in_progress", "En cours", "In progress", "blue"),
          o("in_review", "En revue", "In review", "purple"),
          o("done", "Terminé", "Done", "green"),
          o("cancelled", "Annulé", "Cancelled", "red"),
        ],
      },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project", width: 180 },
      { key: "assigneeId", label: L("Assigné à", "Assignee"), type: "relation", relation: "person", relationScope: "employees", width: 160 },
      { key: "priority", label: L("Priorité", "Priority"), type: "select", options: PRIORITY_OPTIONS },
      { key: "estimateHours", label: L("Estimé (h)", "Estimate (h)"), type: "number", width: 110 },
      { key: "spentHours", label: L("Passé (h)", "Spent (h)"), type: "number", width: 110 },
      { key: "startDate", label: L("Début", "Start"), type: "date" },
      { key: "dueDate", label: L("Échéance", "Due"), type: "date" },
      { key: "completedAt", label: L("Terminé le", "Completed"), type: "date", hidden: true },
      { key: "labels", label: L("Étiquettes", "Labels"), type: "tags" },
      { key: "ticketId", label: L("Ticket", "Ticket"), type: "relation", relation: "ticket", hidden: true },
      { key: "description", label: L("Description", "Description"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  ticket: {
    key: "ticket",
    label: L("Tickets", "Tickets"),
    singular: L("Ticket", "Ticket"),
    icon: "LifeBuoy",
    color: "red",
    group: "delivery",
    primary: "title",
    subtitle: "projectId",
    views: ["table", "kanban", "calendar", "list"],
    kanbanField: "status",
    dateField: "dueDate",
    searchFields: ["title", "description"],
    defaultSort: { field: "createdAt", dir: "desc" },
    fields: [
      { key: "number", label: L("N°", "#"), type: "number", readOnly: true, width: 70 },
      { key: "title", label: L("Titre", "Title"), type: "text", required: true, width: 260 },
      {
        key: "status",
        label: L("Statut", "Status"),
        type: "select",
        options: [
          o("new", "Nouveau", "New", "sky"),
          o("triaged", "Qualifié", "Triaged", "indigo"),
          o("in_progress", "En cours", "In progress", "blue"),
          o("waiting_client", "Attente client", "Waiting on client", "yellow"),
          o("resolved", "Résolu", "Resolved", "green"),
          o("closed", "Fermé", "Closed", "gray"),
        ],
      },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project", width: 180 },
      { key: "organizationId", label: L("Client", "Client"), type: "relation", relation: "organization" },
      { key: "requesterId", label: L("Demandé par", "Requested by"), type: "relation", relation: "person" },
      { key: "assigneeId", label: L("Responsable", "Assignee"), type: "relation", relation: "person", relationScope: "employees" },
      { key: "priority", label: L("Priorité", "Priority"), type: "select", options: PRIORITY_OPTIONS },
      {
        key: "category",
        label: L("Catégorie", "Category"),
        type: "select",
        options: [
          o("bug", "Bug", "Bug", "red"),
          o("feature", "Fonctionnalité", "Feature", "purple"),
          o("content", "Contenu", "Content", "teal"),
          o("support", "Support", "Support", "blue"),
          o("billing", "Facturation", "Billing", "orange"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      { key: "clientVisible", label: L("Visible client", "Client visible"), type: "checkbox" },
      { key: "dueDate", label: L("Échéance", "Due"), type: "date" },
      { key: "resolvedAt", label: L("Résolu le", "Resolved"), type: "date", hidden: true },
      { key: "description", label: L("Description", "Description"), type: "longtext", hidden: true },
      { key: "acceptanceCriteria", label: L("Critères de validation", "Acceptance criteria"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  quote: {
    key: "quote",
    label: L("Devis", "Quotes"),
    singular: L("Devis", "Quote"),
    icon: "FilePenLine",
    color: "indigo",
    group: "finance",
    primary: "number",
    subtitle: "title",
    views: ["table", "kanban", "calendar", "gallery"],
    kanbanField: "status",
    dateField: "issueDate",
    searchFields: ["number", "title"],
    defaultSort: { field: "issueDate", dir: "desc" },
    fields: [
      { key: "number", label: L("Numéro", "Number"), type: "text", required: true, width: 140 },
      { key: "title", label: L("Titre", "Title"), type: "text", width: 240 },
      { key: "organizationId", label: L("Client", "Client"), type: "relation", relation: "organization", width: 170 },
      {
        key: "status",
        label: L("Statut", "Status"),
        type: "select",
        options: [
          o("draft", "Brouillon", "Draft", "gray"),
          o("sent", "Envoyé", "Sent", "blue"),
          o("accepted", "Accepté", "Accepted", "green"),
          o("rejected", "Refusé", "Rejected", "red"),
          o("expired", "Expiré", "Expired", "yellow"),
        ],
      },
      { key: "legalEntityId", label: L("Structure", "Entity"), type: "relation", relation: "legal_entity" },
      { key: "subtotal", label: L("Total HT", "Subtotal"), type: "currency", currencyField: "currency", readOnly: true },
      { key: "total", label: L("Total TTC", "Total"), type: "currency", currencyField: "currency", readOnly: true },
      { key: "currency", label: L("Devise", "Currency"), type: "select", options: CURRENCY_OPTIONS, width: 90 },
      { key: "issueDate", label: L("Émis le", "Issued"), type: "date" },
      { key: "validUntil", label: L("Valide jusqu'au", "Valid until"), type: "date" },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project" },
      { key: "contactId", label: L("Contact", "Contact"), type: "relation", relation: "person", hidden: true },
      { key: "lines", label: L("Lignes", "Lines"), type: "lines", hidden: true },
      { key: "introduction", label: L("Introduction", "Introduction"), type: "longtext", hidden: true },
      { key: "scope", label: L("Cahier des charges", "Scope"), type: "longtext", hidden: true },
      { key: "terms", label: L("Conditions", "Terms"), type: "longtext", hidden: true },
      { key: "googleDocId", label: L("Google Doc", "Google Doc"), type: "text", hidden: true },
      { key: "fileUrl", label: L("PDF", "PDF"), type: "url", hidden: true },
      ...timestampsFields,
    ],
  },

  transaction: {
    key: "transaction",
    label: L("Transactions", "Transactions"),
    singular: L("Transaction", "Transaction"),
    icon: "ArrowLeftRight",
    color: "teal",
    group: "finance",
    primary: "label",
    subtitle: "organizationId",
    views: ["table", "kanban", "calendar", "list"],
    kanbanField: "status",
    dateField: "date",
    searchFields: ["label", "number", "counterparty", "notes"],
    defaultSort: { field: "date", dir: "desc" },
    fields: [
      { key: "date", label: L("Date", "Date"), type: "date", required: true, width: 125 },
      {
        key: "kind",
        label: L("Type", "Type"),
        type: "select",
        width: 130,
        options: [o("invoice", "Facture client", "Sales invoice", "green"), o("expense", "Dépense", "Expense", "pink"), o("movement", "Mouvement bancaire", "Bank movement", "gray")],
      },
      { key: "label", label: L("Libellé", "Label"), type: "text", required: true, width: 260 },
      { key: "organizationId", label: L("Client / fournisseur", "Client / supplier"), type: "relation", relation: "organization", width: 170 },
      { key: "total", label: L("Montant TTC", "Total"), type: "currency", currencyField: "currency", width: 120 },
      {
        key: "status",
        label: L("Statut", "Status"),
        type: "select",
        width: 120,
        options: [
          o("draft", "Brouillon", "Draft", "gray"),
          o("sent", "Envoyée", "Sent", "blue"),
          o("partial", "Partiellement payée", "Partially paid", "yellow"),
          o("to_pay", "À payer", "To pay", "orange"),
          o("scheduled", "Programmée", "Scheduled", "blue"),
          o("paid", "Payée", "Paid", "green"),
          o("overdue", "En retard", "Overdue", "red"),
          o("lost", "En perte", "Written off", "gray"),
          o("cancelled", "Annulée", "Cancelled", "gray"),
        ],
      },
      { key: "fileUrl", label: L("Justificatif", "Receipt"), type: "url", width: 110 },
      {
        key: "category",
        label: L("Catégorie", "Category"),
        type: "select",
        options: [
          o("software", "Logiciel / SaaS", "Software", "blue"),
          o("hosting", "Hébergement", "Hosting", "indigo"),
          o("ai", "IA", "AI", "purple"),
          o("subcontracting", "Sous-traitance", "Subcontracting", "orange"),
          o("legal", "Juridique", "Legal", "red"),
          o("accounting", "Comptabilité", "Accounting", "teal"),
          o("marketing", "Marketing", "Marketing", "pink"),
          o("office", "Bureau", "Office", "yellow"),
          o("travel", "Déplacement", "Travel", "sky"),
          o("subscription", "Abonnement", "Subscription", "indigo"),
          o("transport", "Transport", "Transport", "sky"),
          o("flight", "Billet d'avion", "Flight", "sky"),
          o("accommodation", "Hébergement voyage", "Accommodation", "teal"),
          o("restaurant", "Restaurant", "Restaurant", "orange"),
          o("groceries", "Épicerie", "Groceries", "green"),
          o("shopping", "Achats", "Shopping", "pink"),
          o("concert", "Concert / spectacle", "Concert / show", "purple"),
          o("leisure", "Loisirs", "Leisure", "purple"),
          o("health", "Santé", "Health", "red"),
          o("housing", "Logement", "Housing", "yellow"),
          o("utilities", "Énergie / charges", "Utilities", "yellow"),
          o("telecom", "Téléphone / internet", "Telecom", "blue"),
          o("education", "Études", "Education", "indigo"),
          o("bank_fees", "Frais bancaires", "Bank fees", "gray"),
          o("taxes", "Impôts / taxes", "Taxes", "red"),
          o("gift", "Cadeau", "Gift", "pink"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      { key: "legalEntityId", label: L("Structure", "Entity"), type: "relation", relation: "legal_entity", width: 150 },
      { key: "number", label: L("Numéro", "Number"), type: "text", width: 130 },
      { key: "subtotal", label: L("Montant HT", "Subtotal"), type: "currency", currencyField: "currency", hidden: true },
      { key: "taxTotal", label: L("Taxes", "Taxes"), type: "currency", currencyField: "currency", hidden: true },
      { key: "amountPaid", label: L("Payé", "Paid"), type: "currency", currencyField: "currency", hidden: true },
      { key: "currency", label: L("Devise", "Currency"), type: "select", options: CURRENCY_OPTIONS, width: 80 },
      {
        key: "side",
        label: L("Sens", "Direction"),
        type: "select",
        hidden: true,
        options: [o("credit", "Entrée", "In", "green"), o("debit", "Sortie", "Out", "red")],
      },
      { key: "dueDate", label: L("Échéance", "Due"), type: "date", hidden: true },
      { key: "paidAt", label: L("Payée le", "Paid on"), type: "date", hidden: true },
      {
        key: "scope",
        label: L("Perso / pro", "Personal / pro"),
        type: "select",
        hidden: true,
        options: [o("pro", "Pro", "Pro", "blue"), o("perso", "Perso", "Personal", "pink"), o("mixed", "Mixte", "Mixed", "purple")],
        width: 100,
      },
      {
        key: "paidBy",
        label: L("Payé par", "Paid by"),
        type: "select",
        hidden: true,
        options: [o("entity", "Nous", "Us", "blue"), o("client", "Le client", "The client", "green"), o("reimburse", "Carte perso — à rembourser", "Personal card — to reimburse", "orange"), o("other", "Autre", "Other", "gray")],
        width: 120,
      },
      { key: "cardId", label: L("Carte", "Card"), type: "relation", relation: "credit_card", width: 150, hidden: true },
      { key: "clientId", label: L("Client concerné", "Related client"), type: "relation", relation: "organization", width: 160, hidden: true },
      {
        key: "recurrence",
        label: L("Récurrence", "Recurrence"),
        type: "select",
        hidden: true,
        options: [o("none", "Ponctuelle", "One-off", "gray"), o("monthly", "Mensuelle", "Monthly", "blue"), o("quarterly", "Trimestrielle", "Quarterly", "purple"), o("yearly", "Annuelle", "Yearly", "teal")],
      },
      { key: "active", label: L("Abonnement en cours", "Active subscription"), type: "checkbox", hidden: true },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project", hidden: true },
      { key: "quoteId", label: L("Devis", "Quote"), type: "relation", relation: "quote", hidden: true },
      { key: "lines", label: L("Lignes", "Lines"), type: "lines", hidden: true },
      {
        key: "nature",
        label: L("Nature", "Nature"),
        type: "select",
        hidden: true,
        options: [o("operating", "Exploitation", "Operating", "blue"), o("capital", "Capital social", "Share capital", "purple"), o("transfer", "Virement interne", "Internal transfer", "gray"), o("tax", "Impôts / taxes", "Taxes", "red")],
        width: 130,
      },
      { key: "counterparty", label: L("Libellé bancaire", "Bank label"), type: "text", hidden: true },
      {
        key: "source",
        label: L("Source", "Source"),
        type: "select",
        hidden: true,
        options: [o("qonto", "Qonto", "Qonto", "purple"), o("quickbooks", "QuickBooks", "QuickBooks", "green"), o("none", "Manuel", "Manual", "gray"), o("other", "Autre", "Other", "gray")],
      },
      { key: "paymentMethod", label: L("Moyen de paiement", "Payment method"), type: "text", hidden: true },
      { key: "bankRef", label: L("Identifiant banque", "Bank id"), type: "text", hidden: true },
      { key: "externalRef", label: L("Référence source", "Source ref"), type: "text", hidden: true },
      { key: "notes", label: L("Notes", "Notes"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  article: {
    key: "article",
    label: L("Articles", "Articles"),
    singular: L("Article", "Article"),
    icon: "Newspaper",
    color: "sky",
    group: "marketing",
    primary: "title",
    subtitle: "excerpt",
    views: ["table", "kanban", "calendar", "gallery"],
    kanbanField: "status",
    dateField: "publishedAt",
    coverField: "coverUrl",
    searchFields: ["title", "excerpt", "targetQuery"],
    defaultSort: { field: "updatedAt", dir: "desc" },
    translatable: ["title", "excerpt", "content", "category"],
    fields: [
      { key: "title", label: L("Titre", "Title"), type: "text", required: true, width: 300 },
      { key: "status", label: L("Statut", "Status"), type: "select", options: CONTENT_STATUS_OPTIONS },
      { key: "category", label: L("Catégorie", "Category"), type: "text", width: 150 },
      { key: "publishedAt", label: L("Publication", "Published"), type: "date" },
      { key: "authorId", label: L("Auteur", "Author"), type: "relation", relation: "person" },
      { key: "coverUrl", label: L("Couverture", "Cover"), type: "image" },
      { key: "slug", label: L("Slug (URL)", "Slug (URL)"), type: "text" },
      { key: "excerpt", label: L("Chapô", "Excerpt"), type: "longtext", hidden: true },
      { key: "content", label: L("Contenu (markdown)", "Content (markdown)"), type: "longtext", hidden: true },
      { key: "readingMinutes", label: L("Temps de lecture (min)", "Reading time (min)"), type: "number", hidden: true },
      { key: "targetQuery", label: L("Requête cible", "Target query"), type: "text", width: 200, hidden: true },
      { key: "keywords", label: L("Mots-clés", "Keywords"), type: "tags", width: 220, hidden: true },
      { key: "seoScore", label: L("Score SEO/GEO", "SEO/GEO score"), type: "number", hidden: true },
      { key: "locale", label: L("Langue d'origine", "Source language"), type: "select", options: [o("fr", "Français", "French", "blue"), o("en", "Anglais", "English", "red")], hidden: true },
      ...timestampsFields,
    ],
  },

  artifact: {
    key: "artifact",
    label: L("Réalisations", "Showcase"),
    singular: L("Réalisation", "Showcase item"),
    icon: "Sparkles",
    color: "purple",
    group: "marketing",
    primary: "title",
    subtitle: "customer",
    views: ["gallery", "table", "kanban", "list"],
    kanbanField: "status",
    coverField: "imageUrl",
    searchFields: ["title", "customer", "summary"],
    defaultSort: { field: "position", dir: "asc" },
    translatable: ["title", "summary", "description", "tags", "sections"],
    fields: [
      { key: "title", label: L("Titre", "Title"), type: "text", required: true, width: 260 },
      { key: "customer", label: L("Client affiché", "Displayed client"), type: "text", width: 150 },
      { key: "status", label: L("Statut", "Status"), type: "select", options: CONTENT_STATUS_OPTIONS },
      { key: "tags", label: L("Catégories", "Categories"), type: "tags", width: 240 },
      { key: "position", label: L("Ordre", "Order"), type: "number", width: 80 },
      { key: "imageUrl", label: L("Image principale", "Main image"), type: "image" },
      { key: "url", label: L("Lien du projet", "Project link"), type: "url" },
      { key: "startedAt", label: L("Début", "Start"), type: "date" },
      { key: "endedAt", label: L("Fin", "End"), type: "date", hidden: true },
      { key: "organizationId", label: L("Organisation", "Organization"), type: "relation", relation: "organization", hidden: true },
      { key: "projectId", label: L("Projet ERP", "ERP project"), type: "relation", relation: "project", hidden: true },
      { key: "slug", label: L("Slug (URL)", "Slug (URL)"), type: "text", hidden: true },
      { key: "hexColor", label: L("Couleur", "Color"), type: "text", hidden: true },
      { key: "lucideIcon", label: L("Icône (lucide)", "Icon (lucide)"), type: "text", hidden: true },
      { key: "summary", label: L("Résumé", "Summary"), type: "longtext", hidden: true },
      { key: "description", label: L("Description", "Description"), type: "longtext", hidden: true },
      { key: "sections", label: L("Sections de la page", "Page sections"), type: "sections", hidden: true },
      ...timestampsFields,
    ],
  },

  team_member: {
    key: "team_member",
    label: L("Équipe", "Team"),
    singular: L("Membre", "Member"),
    icon: "UsersRound",
    color: "teal",
    group: "marketing",
    primary: "name",
    subtitle: "role",
    views: ["gallery", "table", "list"],
    coverField: "imageUrl",
    searchFields: ["name", "role", "bio"],
    defaultSort: { field: "position", dir: "asc" },
    translatable: ["role", "bio"],
    fields: [
      { key: "name", label: L("Nom", "Name"), type: "text", required: true, width: 200 },
      { key: "role", label: L("Rôle", "Role"), type: "text", width: 240 },
      {
        key: "group",
        label: L("Groupe", "Group"),
        type: "select",
        options: [o("founders", "Fondateurs", "Founders", "indigo"), o("team", "L'équipe", "Team", "teal")],
      },
      { key: "status", label: L("Statut", "Status"), type: "select", options: CONTENT_STATUS_OPTIONS },
      { key: "position", label: L("Ordre", "Order"), type: "number", width: 80 },
      { key: "imageUrl", label: L("Photo", "Photo"), type: "image" },
      { key: "linkedin", label: L("LinkedIn", "LinkedIn"), type: "url" },
      { key: "personId", label: L("Contact ERP", "ERP contact"), type: "relation", relation: "person", hidden: true },
      { key: "slug", label: L("Identifiant", "Identifier"), type: "text", hidden: true },
      { key: "bio", label: L("Bio", "Bio"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  credit_card: {
    key: "credit_card",
    label: L("Cartes de paiement", "Payment cards"),
    singular: L("Carte", "Card"),
    icon: "CreditCard",
    color: "gray",
    group: "finance",
    primary: "label",
    subtitle: "last4",
    views: ["table", "gallery"],
    searchFields: ["label", "issuer", "last4"],
    defaultSort: { field: "label", dir: "asc" },
    fields: [
      { key: "label", label: L("Nom", "Name"), type: "text", required: true, width: 200 },
      {
        key: "brand",
        label: L("Réseau", "Network"),
        type: "select",
        options: [
          o("visa", "Visa", "Visa", "blue"),
          o("mastercard", "Mastercard", "Mastercard", "orange"),
          o("amex", "American Express", "American Express", "sky"),
          o("interac", "Interac", "Interac", "yellow"),
          o("paypal", "PayPal", "PayPal", "indigo"),
          o("apple_pay", "Apple Pay", "Apple Pay", "gray"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      { key: "last4", label: L("4 derniers chiffres", "Last 4"), type: "text", width: 110 },
      { key: "issuer", label: L("Banque", "Issuer"), type: "text" },
      { key: "holder", label: L("Titulaire", "Holder"), type: "text" },
      { key: "expiry", label: L("Expiration", "Expiry"), type: "text", width: 90 },
      {
        key: "scope",
        label: L("Usage", "Usage"),
        type: "select",
        options: [o("perso", "Perso", "Personal", "pink"), o("pro", "Pro", "Pro", "blue"), o("mixed", "Mixte", "Mixed", "purple")],
      },
      { key: "legalEntityId", label: L("Structure", "Entity"), type: "relation", relation: "legal_entity" },
      { key: "active", label: L("Active", "Active"), type: "checkbox" },
      { key: "notes", label: L("Notes", "Notes"), type: "longtext", hidden: true },
      ...timestampsFields,
    ],
  },

  post: {
    key: "post",
    label: L("Posts", "Posts"),
    singular: L("Post", "Post"),
    icon: "Megaphone",
    color: "yellow",
    group: "marketing",
    primary: "title",
    subtitle: "network",
    views: ["table", "kanban", "calendar", "gallery"],
    kanbanField: "status",
    dateField: "scheduledAt",
    coverField: "imageUrl",
    searchFields: ["title", "content"],
    defaultSort: { field: "scheduledAt", dir: "desc" },
    fields: [
      { key: "title", label: L("Titre", "Title"), type: "text", required: true, width: 260 },
      {
        key: "network",
        label: L("Réseau", "Network"),
        type: "select",
        options: [
          o("linkedin", "LinkedIn", "LinkedIn", "blue"),
          o("instagram", "Instagram", "Instagram", "pink"),
          o("x", "X", "X", "gray"),
          o("facebook", "Facebook", "Facebook", "indigo"),
          o("tiktok", "TikTok", "TikTok", "purple"),
          o("youtube", "YouTube", "YouTube", "red"),
        ],
      },
      { key: "status", label: L("Statut", "Status"), type: "select", options: CONTENT_STATUS_OPTIONS },
      { key: "scheduledAt", label: L("Planifié le", "Scheduled"), type: "datetime" },
      { key: "authorId", label: L("Auteur", "Author"), type: "relation", relation: "person" },
      { key: "articleId", label: L("Article lié", "Linked article"), type: "relation", relation: "article" },
      { key: "url", label: L("URL", "URL"), type: "url" },
      { key: "content", label: L("Contenu", "Content"), type: "longtext", hidden: true },
      { key: "imageUrl", label: L("Visuel", "Image"), type: "url", hidden: true },
      { key: "publishedAt", label: L("Publié le", "Published"), type: "datetime", hidden: true },
      ...timestampsFields,
    ],
  },

  document: {
    key: "document",
    label: L("Documents", "Documents"),
    singular: L("Document", "Document"),
    icon: "FileText",
    color: "sky",
    group: "settings",
    primary: "title",
    subtitle: "organizationId",
    views: ["table", "list", "gallery"],
    searchFields: ["title", "path"],
    defaultSort: { field: "modifiedAt", dir: "desc" },
    fields: [
      { key: "title", label: L("Nom", "Name"), type: "text", required: true, width: 320 },
      {
        key: "type",
        label: L("Type", "Type"),
        type: "select",
        options: [
          o("quote", "Devis", "Quote", "indigo"),
          o("invoice", "Facture", "Invoice", "green"),
          o("contract", "Contrat", "Contract", "orange"),
          o("sow", "SOW / CDC", "SOW", "sky"),
          o("nda", "NDA", "NDA", "gray"),
          o("report", "Compte-rendu", "Report", "pink"),
          o("free", "Autre", "Other", "gray"),
        ],
      },
      { key: "organizationId", label: L("Client", "Client"), type: "relation", relation: "organization", width: 170 },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project" },
      { key: "invoiceId", label: L("Facture", "Invoice"), type: "relation", relation: "transaction" },
      { key: "quoteId", label: L("Devis", "Quote"), type: "relation", relation: "quote" },
      { key: "billId", label: L("Dépense", "Expense"), type: "relation", relation: "transaction" },
      { key: "communicationId", label: L("Communication", "Communication"), type: "relation", relation: "communication", hidden: true },
      { key: "path", label: L("Emplacement", "Location"), type: "text", readOnly: true, width: 240 },
      { key: "mimeType", label: L("Format", "Format"), type: "text", readOnly: true, hidden: true },
      { key: "modifiedAt", label: L("Modifié le", "Modified"), type: "datetime", readOnly: true },
      { key: "webViewLink", label: L("Lien Drive", "Drive link"), type: "url", readOnly: true },
      ...timestampsFields,
    ],
  },

  event: {
    key: "event",
    label: L("Événements", "Events"),
    singular: L("Événement", "Event"),
    icon: "CalendarDays",
    color: "orange",
    group: "crm",
    primary: "title",
    subtitle: "organizationId",
    views: ["calendar", "table", "list"],
    dateField: "startAt",
    searchFields: ["title", "description", "location"],
    defaultSort: { field: "startAt", dir: "desc" },
    fields: [
      { key: "title", label: L("Titre", "Title"), type: "text", required: true, width: 260 },
      { key: "startAt", label: L("Début", "Start"), type: "datetime", width: 170 },
      { key: "endAt", label: L("Fin", "End"), type: "datetime", width: 170 },
      { key: "calendarOwner", label: L("Agenda", "Calendar"), type: "email", readOnly: true },
      { key: "organizationId", label: L("Client", "Client"), type: "relation", relation: "organization" },
      { key: "projectId", label: L("Projet", "Project"), type: "relation", relation: "project" },
      { key: "personId", label: L("Contact", "Contact"), type: "relation", relation: "person" },
      { key: "meetUrl", label: L("Lien visio", "Meeting link"), type: "url" },
      { key: "location", label: L("Lieu", "Location"), type: "text", hidden: true },
      { key: "attendees", label: L("Participants", "Attendees"), type: "tags" },
      { key: "isPrivate", label: L("Privé", "Private"), type: "checkbox", hidden: true },
      {
        key: "kind",
        label: L("Type", "Type"),
        type: "select",
        options: [
          o("meeting", "Réunion", "Meeting", "blue"),
          o("call", "Appel", "Call", "teal"),
          o("personal", "Perso / occupé", "Personal / busy", "gray"),
          o("all_day", "Journée entière", "All day", "purple"),
          o("travel", "Déplacement", "Travel", "sky"),
          o("deadline", "Échéance", "Deadline", "red"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      { key: "recurrence", label: L("Récurrence", "Recurrence"), type: "text", readOnly: true },
      { key: "seriesId", label: L("Série", "Series"), type: "text", readOnly: true, hidden: true },
      { key: "description", label: L("Description", "Description"), type: "longtext", hidden: true },
      { key: "notes", label: L("Note", "Note"), type: "longtext", hidden: true },
      { key: "htmlLink", label: L("Google Agenda", "Google Calendar"), type: "url", readOnly: true, hidden: true },
      ...timestampsFields,
    ],
  },

  legal_entity: {
    key: "legal_entity",
    label: L("Structures", "Entities"),
    singular: L("Structure", "Entity"),
    icon: "Landmark",
    color: "indigo",
    group: "settings",
    primary: "name",
    subtitle: "country",
    views: ["table", "gallery"],
    searchFields: ["name", "legalName", "code"],
    defaultSort: { field: "name", dir: "asc" },
    fields: [
      { key: "name", label: L("Nom", "Name"), type: "text", required: true, width: 180 },
      { key: "code", label: L("Code", "Code"), type: "text", required: true, width: 80 },
      { key: "legalName", label: L("Raison sociale", "Legal name"), type: "text", required: true, width: 220 },
      { key: "legalForm", label: L("Forme juridique", "Legal form"), type: "text" },
      { key: "country", label: L("Pays", "Country"), type: "text", width: 80 },
      { key: "currency", label: L("Devise", "Currency"), type: "select", options: CURRENCY_OPTIONS, width: 90 },
      {
        key: "accountingProvider",
        label: L("Banque / compta", "Accounting"),
        type: "select",
        options: [
          o("qonto", "Qonto", "Qonto", "purple"),
          o("quickbooks", "QuickBooks", "QuickBooks", "green"),
          o("none", "Aucun", "None", "gray"),
          o("other", "Autre", "Other", "gray"),
        ],
      },
      { key: "registrationNumber", label: L("N° d'immatriculation", "Registration #"), type: "text" },
      { key: "invoicePrefix", label: L("Préfixe factures", "Invoice prefix"), type: "text" },
      { key: "quotePrefix", label: L("Préfixe devis", "Quote prefix"), type: "text" },
      { key: "email", label: L("Courriel", "Email"), type: "email" },
      { key: "phone", label: L("Téléphone", "Phone"), type: "phone", hidden: true },
      { key: "addressLine1", label: L("Adresse", "Address"), type: "text", hidden: true },
      { key: "postalCode", label: L("Code postal", "Postal code"), type: "text", hidden: true },
      { key: "city", label: L("Ville", "City"), type: "text", hidden: true },
      { key: "region", label: L("Région", "Region"), type: "text", hidden: true },
      { key: "paymentTerms", label: L("Conditions de paiement", "Payment terms"), type: "longtext", hidden: true },
      { key: "legalMentions", label: L("Mentions légales", "Legal mentions"), type: "longtext", hidden: true },
      { key: "color", label: L("Couleur", "Color"), type: "text", hidden: true },
      ...timestampsFields,
    ],
  },
};

export const TABLE_KEYS = Object.keys(TABLES) as TableKey[];

export const TABLE_GROUPS: { key: TableDef["group"]; label: I18n }[] = [
  { key: "crm", label: L("CRM", "CRM") },
  { key: "delivery", label: L("Production", "Delivery") },
  { key: "finance", label: L("Finance", "Finance") },
  { key: "marketing", label: L("Marketing", "Marketing") },
  { key: "settings", label: L("Paramètres", "Settings") },
];

export function getField(table: TableKey, key: string): FieldDef | undefined {
  return TABLES[table].fields.find((f) => f.key === key);
}

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

export type FilterOp =
  | "contains"
  | "not_contains"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "is_empty"
  | "is_not_empty"
  | "before"
  | "after"
  | "this_week"
  | "this_month"
  | "this_year"
  | "past_due"
  | "is_true"
  | "is_false";

export const OPS_BY_TYPE: Record<FieldType, FilterOp[]> = {
  text: ["contains", "not_contains", "eq", "neq", "is_empty", "is_not_empty"],
  longtext: ["contains", "not_contains", "is_empty", "is_not_empty"],
  url: ["contains", "is_empty", "is_not_empty"],
  email: ["contains", "eq", "is_empty", "is_not_empty"],
  phone: ["contains", "is_empty", "is_not_empty"],
  repo: ["contains", "is_empty", "is_not_empty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  currency: ["eq", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"],
  percent: ["eq", "gt", "gte", "lt", "lte"],
  date: ["eq", "before", "after", "this_week", "this_month", "this_year", "past_due", "is_empty", "is_not_empty"],
  datetime: ["before", "after", "this_week", "this_month", "this_year", "is_empty", "is_not_empty"],
  select: ["in", "not_in", "is_empty", "is_not_empty"],
  tags: ["contains", "is_empty", "is_not_empty"],
  relation: ["in", "not_in", "is_empty", "is_not_empty"],
  checkbox: ["is_true", "is_false"],
  lines: ["is_empty", "is_not_empty"],
  sections: ["is_empty", "is_not_empty"],
  image: ["is_empty", "is_not_empty"],
};

export const OP_LABELS: Record<FilterOp, I18n> = {
  contains: L("contient", "contains"),
  not_contains: L("ne contient pas", "does not contain"),
  eq: L("est", "is"),
  neq: L("n'est pas", "is not"),
  gt: L(">", ">"),
  gte: L("≥", "≥"),
  lt: L("<", "<"),
  lte: L("≤", "≤"),
  in: L("est l'un de", "is any of"),
  not_in: L("n'est aucun de", "is none of"),
  is_empty: L("est vide", "is empty"),
  is_not_empty: L("n'est pas vide", "is not empty"),
  before: L("avant le", "before"),
  after: L("après le", "after"),
  this_week: L("cette semaine", "this week"),
  this_month: L("ce mois-ci", "this month"),
  this_year: L("cette année", "this year"),
  past_due: L("dépassée", "past due"),
  is_true: L("est coché", "is checked"),
  is_false: L("n'est pas coché", "is unchecked"),
};

export const VALUELESS_OPS: FilterOp[] = ["is_empty", "is_not_empty", "this_week", "this_month", "this_year", "past_due", "is_true", "is_false"];
