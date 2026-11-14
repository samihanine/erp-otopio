import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db, schema } from "@erp/db";
import { env } from "./env";

function assertAllowedEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!env.allowedDomains.includes(domain)) {
    throw new APIError("FORBIDDEN", { message: `Seuls les comptes @${env.allowedDomains.join(", @")} peuvent se connecter.` });
  }
}

export const auth = betterAuth({
  appName: "Otopio ERP",
  baseURL: env.authUrl,
  basePath: "/api/auth",
  secret: env.authSecret,
  trustedOrigins: [env.appUrl, env.authUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
  }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  socialProviders:
    env.googleClientId && env.googleClientSecret
      ? { google: { clientId: env.googleClientId, clientSecret: env.googleClientSecret, prompt: "select_account", hd: env.allowedDomains[0] } as never }
      : undefined,
  user: { additionalFields: { role: { type: "string", defaultValue: "member", input: false }, locale: { type: "string", defaultValue: "fr" } } },
  session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true, maxAge: 300 } },
  advanced: { useSecureCookies: env.authUrl.startsWith("https") },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertAllowedEmail(user.email);
          return { data: user };
        },
      },
    },
  },
});

export const authEnabledProviders = () => ({ google: Boolean(env.googleClientId && env.googleClientSecret), password: true });

/** Creates the initial admin account (email/password) when ADMIN_PASSWORD is set. */
export async function ensureAdmin() {
  if (!env.adminEmail || !env.adminPassword) return;
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(env.adminEmail);
  if (existing) return;
  const hash = await ctx.password.hash(env.adminPassword);
  const createUser = ctx.internalAdapter.createUser as unknown as (u: Record<string, unknown>) => Promise<{ id: string }>;
  const user = await createUser({ email: env.adminEmail, name: env.adminEmail.split("@")[0]!, emailVerified: true, role: "admin" });
  await (ctx.internalAdapter.linkAccount as (a: unknown) => Promise<unknown>)({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  console.log(`[auth] admin account created for ${env.adminEmail}`);
}
