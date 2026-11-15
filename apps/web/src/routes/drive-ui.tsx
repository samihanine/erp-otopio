import { FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Presentation } from "lucide-react";
import type { Row } from "@/lib/api";
import { cn } from "@/lib/utils";

export function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  if (mime === "application/vnd.google-apps.folder") return <Folder className={cn(cls, "fill-amber-200 text-amber-500")} />;
  if (mime === "application/pdf") return <FileText className={cn(cls, "text-rose-500")} />;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return <FileSpreadsheet className={cn(cls, "text-emerald-600")} />;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return <Presentation className={cn(cls, "text-amber-600")} />;
  if (mime.includes("document") || mime.includes("word")) return <FileText className={cn(cls, "text-blue-600")} />;
  if (mime.startsWith("image/")) return <FileImage className={cn(cls, "text-violet-500")} />;
  if (mime.startsWith("video/")) return <FileVideo className={cn(cls, "text-pink-500")} />;
  if (mime.includes("zip")) return <FileArchive className={cn(cls, "text-zinc-500")} />;
  return <FileText className={cn(cls, "text-zinc-400")} />;
}

/** Embeddable preview: Google Docs/Sheets/Slides are editable in place, others use Drive's previewer. */
export function filePreviewUrl(d: Row) {
  const id = String(d.driveFileId ?? d.googleDocId ?? "");
  if (!id) return null;
  const mime = String(d.mimeType ?? "");
  if (mime === "application/vnd.google-apps.document") return `https://docs.google.com/document/d/${id}/edit?rm=minimal`;
  if (mime === "application/vnd.google-apps.spreadsheet") return `https://docs.google.com/spreadsheets/d/${id}/edit?rm=minimal`;
  if (mime === "application/vnd.google-apps.presentation") return `https://docs.google.com/presentation/d/${id}/edit?rm=minimal`;
  return `https://drive.google.com/file/d/${id}/preview`;
}

export const humanSize = (n: unknown) => {
  const v = Number(n ?? 0);
  if (!v) return "";
  if (v < 1024) return `${v} o`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} Ko`;
  if (v < 1024 ** 3) return `${(v / 1024 ** 2).toFixed(1)} Mo`;
  return `${(v / 1024 ** 3).toFixed(1)} Go`;
};
