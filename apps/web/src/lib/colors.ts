import type { Color } from "@erp/shared";

/** Soft badge styles per option color — light & dark. */
export const BADGE: Record<Color, string> = {
  gray: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  blue: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900",
  sky: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  yellow: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  orange: "bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-900",
  red: "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  purple: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
  pink: "bg-pink-50 text-pink-700 ring-pink-100 dark:bg-pink-950 dark:text-pink-300 dark:ring-pink-900",
  teal: "bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-900",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900",
};

export const DOT: Record<Color, string> = {
  gray: "bg-zinc-400",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-rose-500",
  purple: "bg-violet-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
  indigo: "bg-indigo-500",
};

/** Solid tile used for table icons in the sidebar / rail */
export const TILE: Record<Color, string> = {
  gray: "bg-zinc-500",
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  orange: "bg-orange-500",
  red: "bg-rose-500",
  purple: "bg-violet-500",
  pink: "bg-pink-500",
  teal: "bg-teal-500",
  indigo: "bg-indigo-500",
};

export const HEX: Record<Color, string> = {
  gray: "#a1a1aa",
  blue: "#3b82f6",
  sky: "#0ea5e9",
  green: "#10b981",
  yellow: "#f59e0b",
  orange: "#f97316",
  red: "#f43f5e",
  purple: "#8b5cf6",
  pink: "#ec4899",
  teal: "#14b8a6",
  indigo: "#6366f1",
};
