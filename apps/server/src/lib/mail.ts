/** Transactional emails (portal invitations, magic links) sent from contact@otopio.ca through Gmail. */
import { gmail, googleConfigured } from "@erp/google";

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function mailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;border:1px solid #e5e7eb;padding:28px">
<div style="font-weight:700;font-size:15px;color:#1c3266;margin-bottom:18px">Otopio</div>
<h1 style="font-size:19px;margin:0 0 12px">${esc(title)}</h1>
<div style="font-size:14px;line-height:1.6;color:#334155">${body}</div>
${cta ? `<p style="margin:24px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#1c3266;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;font-size:14px">${esc(cta.label)}</a></p><p style="font-size:12px;color:#94a3b8;word-break:break-all">${esc(cta.url)}</p>` : ""}
</div></body></html>`;
}

export async function sendMail(to: string, subject: string, html: string) {
  if (!googleConfigured()) {
    console.log(`[mail] (Google non configuré) → ${to} : ${subject} ${html.match(/href="([^"]+)"/)?.[1] ?? ""}`);
    return false;
  }
  await gmail.send("contact@otopio.ca", to, subject, html, "Otopio");
  return true;
}

export { esc };
