import { gfetch, SCOPES } from "./index";

const G = "https://gmail.googleapis.com/gmail/v1/users/me";
export type GmailHeader = { name: string; value: string };
export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[]; mimeType?: string; filename?: string; body?: { attachmentId?: string; size?: number; data?: string }; parts?: GmailMessage["payload"][] };
};
export type GmailThread = { id: string; messages: GmailMessage[] };
export type GmailLabel = { id: string; name: string; type: "system" | "user" };

export const gmail = {
  list: async (user: string, q: string, max = 5000) => {
    const ids: { id: string; threadId: string }[] = [];
    let pageToken: string | undefined;
    do {
      const r = await gfetch<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(
        user,
        SCOPES.gmail,
        `${G}/messages?maxResults=500&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      ids.push(...(r.messages ?? []));
      pageToken = r.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids;
  },
  listThreads: async (user: string, q: string, max = 5000) => {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const r = await gfetch<{ threads?: { id: string }[]; nextPageToken?: string }>(
        user,
        SCOPES.gmail,
        `${G}/threads?maxResults=500&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      ids.push(...(r.threads ?? []).map((t) => t.id));
      pageToken = r.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids;
  },
  thread: (user: string, id: string, format: "metadata" | "full" = "metadata") =>
    gfetch<GmailThread>(
      user,
      SCOPES.gmail,
      `${G}/threads/${id}?format=${format}${format === "metadata" ? "&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Id" : ""}`,
    ),
  message: (user: string, id: string) => gfetch<GmailMessage>(user, SCOPES.gmail, `${G}/messages/${id}?format=full`),
  attachment: (user: string, msgId: string, attId: string) => gfetch<{ data: string; size: number }>(user, SCOPES.gmail, `${G}/messages/${msgId}/attachments/${attId}`),
  labels: async (user: string) => (await gfetch<{ labels: GmailLabel[] }>(user, SCOPES.gmail, `${G}/labels`)).labels,
  createLabel: (user: string, name: string, color?: { backgroundColor: string; textColor: string }) =>
    gfetch<GmailLabel>(user, SCOPES.gmail, `${G}/labels`, { method: "POST", json: { name, labelListVisibility: "labelShow", messageListVisibility: "show", ...(color ? { color } : {}) } }),
  modifyThread: (user: string, id: string, add: string[], remove: string[] = []) =>
    gfetch(user, SCOPES.gmail, `${G}/threads/${id}/modify`, { method: "POST", json: { addLabelIds: add, removeLabelIds: remove } }),
  batchModify: (user: string, ids: string[], add: string[], remove: string[] = []) =>
    gfetch(user, SCOPES.gmail, `${G}/messages/batchModify`, { method: "POST", json: { ids, addLabelIds: add, removeLabelIds: remove } }),
  filters: async (user: string) => (await gfetch<{ filter?: { id: string; criteria: Record<string, string>; action: Record<string, unknown> }[] } | null>(user, SCOPES.gmailSettings, `${G}/settings/filters`))?.filter ?? [],
  createFilter: (user: string, criteria: Record<string, string>, action: { addLabelIds?: string[]; removeLabelIds?: string[] }) =>
    gfetch(user, SCOPES.gmailSettings, `${G}/settings/filters`, { method: "POST", json: { criteria, action } }),
  deleteFilter: (user: string, id: string) => gfetch(user, SCOPES.gmailSettings, `${G}/settings/filters/${id}`, { method: "DELETE" }),
  /** Sends a simple HTML email from `user` (RFC 2822, base64url). */
  send: (user: string, to: string, subject: string, html: string, fromName = "Otopio") => {
    const enc = (v: string) => `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`;
    const raw = [`From: ${enc(fromName)} <${user}>`, `To: ${to}`, `Subject: ${enc(subject)}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html).toString("base64")].join("\r\n");
    return gfetch<{ id: string }>(user, SCOPES.gmail, `${G}/messages/send`, { method: "POST", json: { raw: Buffer.from(raw).toString("base64url") } });
  },
  profile: (user: string) => gfetch<{ emailAddress: string; messagesTotal: number; historyId: string }>(user, SCOPES.gmail, `${G}/profile`),
  history: (user: string, startHistoryId: string) =>
    gfetch<{ history?: { messagesAdded?: { message: GmailMessage }[] }[]; historyId: string }>(user, SCOPES.gmail, `${G}/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded&maxResults=500`),
};

export const header = (m: GmailMessage, name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
export const addresses = (v: string) => [...v.matchAll(/[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0].toLowerCase());
export const displayName = (v: string) => v.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? null;

/** Plain text body (best effort) */
export function textBody(m: GmailMessage): string {
  const walk = (p: GmailMessage["payload"]): string => {
    if (!p) return "";
    if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const part of p.parts ?? []) {
      const t = walk(part);
      if (t) return t;
    }
    if (p.mimeType === "text/html" && p.body?.data)
      return Buffer.from(p.body.data, "base64url").toString("utf8").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    return "";
  };
  return walk(m.payload);
}

export function attachmentsOf(m: GmailMessage) {
  const out: { filename: string; mimeType: string; attachmentId: string; size: number }[] = [];
  const walk = (p: GmailMessage["payload"]) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) out.push({ filename: p.filename, mimeType: p.mimeType ?? "", attachmentId: p.body.attachmentId, size: p.body.size ?? 0 });
    (p.parts ?? []).forEach(walk);
  };
  walk(m.payload);
  return out;
}
