import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { I18n, Locale } from "@erp/shared";

const dict = {
  // navigation
  home: { fr: "Accueil", en: "Home" },
  database: { fr: "Base de données", en: "Database" },
  databaseShort: { fr: "Données", en: "Data" },
  documents: { fr: "Documents", en: "Documents" },
  finance: { fr: "Finance", en: "Finance" },
  website: { fr: "Site web", en: "Website" },
  settings: { fr: "Paramètres", en: "Settings" },
  search: { fr: "Rechercher…", en: "Search…" },
  searchAnything: { fr: "Rechercher des projets, clients, factures…", en: "Search projects, clients, invoices…" },
  newRecord: { fr: "Nouvel élément", en: "New item" },
  new: { fr: "Nouveau", en: "New" },
  tables: { fr: "Tables", en: "Tables" },
  views: { fr: "Vues", en: "Views" },
  workspace: { fr: "Espace", en: "Workspace" },
  favorites: { fr: "Raccourcis", en: "Shortcuts" },
  signOut: { fr: "Se déconnecter", en: "Sign out" },
  language: { fr: "Langue", en: "Language" },
  theme: { fr: "Thème", en: "Theme" },
  light: { fr: "Clair", en: "Light" },
  dark: { fr: "Sombre", en: "Dark" },
  // views
  table: { fr: "Table", en: "Table" },
  kanban: { fr: "Kanban", en: "Board" },
  gantt: { fr: "Gantt", en: "Timeline" },
  calendar: { fr: "Calendrier", en: "Calendar" },
  gallery: { fr: "Galerie", en: "Gallery" },
  list: { fr: "Liste", en: "List" },
  allRecords: { fr: "Tout", en: "All" },
  addView: { fr: "Ajouter une vue", en: "Add view" },
  saveView: { fr: "Enregistrer la vue", en: "Save view" },
  saveAsNew: { fr: "Enregistrer comme nouvelle vue", en: "Save as new view" },
  resetView: { fr: "Réinitialiser", en: "Reset" },
  renameView: { fr: "Renommer", en: "Rename" },
  deleteView: { fr: "Supprimer la vue", en: "Delete view" },
  viewName: { fr: "Nom de la vue", en: "View name" },
  unsaved: { fr: "Modifications non enregistrées", en: "Unsaved changes" },
  // toolbar
  filter: { fr: "Filtrer", en: "Filter" },
  filters: { fr: "Filtres", en: "Filters" },
  sort: { fr: "Trier", en: "Sort" },
  group: { fr: "Grouper", en: "Group" },
  fields: { fr: "Champs", en: "Fields" },
  addFilter: { fr: "Ajouter un filtre", en: "Add filter" },
  addSort: { fr: "Ajouter un tri", en: "Add sort" },
  where: { fr: "Où", en: "Where" },
  and: { fr: "et", en: "and" },
  or: { fr: "ou", en: "or" },
  ascending: { fr: "Croissant", en: "Ascending" },
  descending: { fr: "Décroissant", en: "Descending" },
  clear: { fr: "Effacer", en: "Clear" },
  value: { fr: "Valeur", en: "Value" },
  none: { fr: "Aucun", en: "None" },
  empty: { fr: "Vide", en: "Empty" },
  noResults: { fr: "Aucun résultat", en: "No results" },
  noRecords: { fr: "Aucun élément ne correspond à cette vue.", en: "No items match this view." },
  records: { fr: "éléments", en: "items" },
  showAll: { fr: "Tout afficher", en: "Show all" },
  hideAll: { fr: "Tout masquer", en: "Hide all" },
  groupBy: { fr: "Grouper par", en: "Group by" },
  dateField: { fr: "Champ date", en: "Date field" },
  startField: { fr: "Début", en: "Start" },
  endField: { fr: "Fin", en: "End" },
  noDate: { fr: "Sans date", en: "No date" },
  today: { fr: "Aujourd'hui", en: "Today" },
  week: { fr: "Semaine", en: "Week" },
  month: { fr: "Mois", en: "Month" },
  quarter: { fr: "Trimestre", en: "Quarter" },
  // record
  open: { fr: "Ouvrir", en: "Open" },
  openFull: { fr: "Ouvrir en pleine page", en: "Open full page" },
  delete: { fr: "Supprimer", en: "Delete" },
  duplicate: { fr: "Dupliquer", en: "Duplicate" },
  confirmDelete: { fr: "Supprimer cet élément ?", en: "Delete this item?" },
  deleted: { fr: "Élément supprimé", en: "Item deleted" },
  saved: { fr: "Enregistré", en: "Saved" },
  created: { fr: "Élément créé", en: "Item created" },
  properties: { fr: "Propriétés", en: "Properties" },
  related: { fr: "Éléments liés", en: "Related" },
  activity: { fr: "Activité", en: "Activity" },
  comment: { fr: "Ajouter un commentaire…", en: "Add a comment…" },
  send: { fr: "Envoyer", en: "Send" },
  copyLink: { fr: "Copier le lien", en: "Copy link" },
  linkCopied: { fr: "Lien copié", en: "Link copied" },
  untitled: { fr: "Sans titre", en: "Untitled" },
  cancel: { fr: "Annuler", en: "Cancel" },
  save: { fr: "Enregistrer", en: "Save" },
  create: { fr: "Créer", en: "Create" },
  close: { fr: "Fermer", en: "Close" },
  select: { fr: "Sélectionner…", en: "Select…" },
  connect: { fr: "Connecter", en: "Connect" },
  connected: { fr: "Connecté", en: "Connected" },
  notConnected: { fr: "Non connecté", en: "Not connected" },
  comingSoon: { fr: "Bientôt", en: "Soon" },
  demoData: { fr: "Données de démonstration", en: "Demo data" },
  // finance
  revenue: { fr: "Chiffre d'affaires", en: "Revenue" },
  collected: { fr: "Encaissé", en: "Collected" },
  outstanding: { fr: "À encaisser", en: "Outstanding" },
  overdue: { fr: "En retard", en: "Overdue" },
  expenses: { fr: "Dépenses", en: "Expenses" },
  margin: { fr: "Marge", en: "Margin" },
  allEntities: { fr: "Toutes les structures", en: "All entities" },
  consolidated: { fr: "Consolidé en CAD", en: "Consolidated in CAD" },
  reconciliation: { fr: "Rapprochement", en: "Reconciliation" },
  // misc
  greetingMorning: { fr: "Bonjour", en: "Good morning" },
  greetingEvening: { fr: "Bonsoir", en: "Good evening" },
} satisfies Record<string, I18n>;

export type DictKey = keyof typeof dict;

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (k: DictKey) => string; tr: (v: I18n | undefined | null) => string };
const I18nCtx = createContext<Ctx | null>(null);

const read = (): Locale => {
  try {
    const v = localStorage.getItem("erp.locale");
    if (v === "fr" || v === "en") return v;
  } catch {}
  return "fr";
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(read);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale: (l) => {
        setLocaleState(l);
        try {
          localStorage.setItem("erp.locale", l);
        } catch {}
      },
      t: (k) => dict[k]?.[locale] ?? String(k),
      tr: (v) => (v ? v[locale] : ""),
    }),
    [locale],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}

export function fmtDate(d: unknown, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "";
  const s = String(d);
  const date = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(date.getTime())) return s;
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", opts);
}

export function fmtRelative(d: unknown, locale: Locale) {
  if (!d) return "";
  const date = new Date(String(d));
  const diff = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return fmtDate(d, locale);
}

export function fmtNumber(n: unknown, locale: Locale, opts?: Intl.NumberFormatOptions) {
  if (n == null || n === "") return "";
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", opts).format(Number(n));
}
