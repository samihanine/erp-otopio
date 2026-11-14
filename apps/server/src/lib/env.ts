const e = process.env;
export const env = {
  port: Number(e.PORT ?? 3000),
  appEnv: e.APP_ENV ?? "development",
  appUrl: e.APP_URL ?? "http://localhost:5173",
  redisUrl: e.REDIS_URL ?? "redis://localhost:6379",
  authSecret: e.BETTER_AUTH_SECRET ?? "dev-secret-change-me-dev-secret-change-me",
  authUrl: e.BETTER_AUTH_URL ?? e.APP_URL ?? "http://localhost:5173",
  allowedDomains: (e.ALLOWED_EMAIL_DOMAINS ?? "otopio.ca").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
  googleClientId: e.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: e.GOOGLE_CLIENT_SECRET ?? "",
  adminEmail: e.ADMIN_EMAIL ?? "",
  adminPassword: e.ADMIN_PASSWORD ?? "",
  githubToken: e.GITHUB_TOKEN ?? "",
  githubOrg: e.GITHUB_ORG ?? "otopio-org",
  r2: {
    endpoint: e.R2_ENDPOINT ?? "",
    accessKeyId: e.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: e.R2_SECRET_ACCESS_KEY ?? "",
    bucket: e.R2_BUCKET ?? "otopio-erp",
    publicUrl: e.R2_PUBLIC_URL ?? "",
  },
  cloudflareToken: e.CLOUDFLARE_API_TOKEN ?? "",
  qonto: Boolean(e.QONTO_LOGIN && e.QONTO_SECRET_KEY),
  quickbooks: Boolean(e.QUICKBOOKS_CLIENT_ID && e.QUICKBOOKS_CLIENT_SECRET),
};
export const r2Configured = () => Boolean(env.r2.endpoint && env.r2.accessKeyId && env.r2.secretAccessKey);
