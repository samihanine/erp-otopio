import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { db, schema } from "@erp/db";
import { magicLink } from "better-auth/plugins/magic-link";
import { env } from "./env";
import { isKnownEmail } from "./workspace";
import { mailLayout, sendMail } from "./mail";

/** Members of a workspace (or of an allowed domain) and invited portal clients only. */
async function assertAllowedEmail(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (env.allowedDomains.includes(domain)) return;
  if (await isKnownEmail(email)) return;
  throw new APIError("FORBIDDEN", { message: "Cette adresse n'a pas accès à l'ERP. Demande une invitation à Otopio." });
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
      ? { google: { clientId: env.googleClientId, clientSecret: env.googleClientSecret, prompt: "select_account" } as never }
      : undefined,
  user: { additionalFields: { role: { type: "string", defaultValue: "member", input: false }, locale: { type: "string", defaultValue: "fr" } } },
  session: { expiresIn: 60 * 60 * 24 * 30, cookieCache: { enabled: true, maxAge: 300 } },
  advanced: { useSecureCookies: env.authUrl.startsWith("https") },
  plugins: [
    magicLink({
      expiresIn: 15 * 60,
      sendMagicLink: async ({ email, url }) => {
        await assertAllowedEmail(email);
        await sendMail(email, "Ton lien de connexion Otopio", mailLayout("Connexion à ton espace", "Clique sur le bouton ci-dessous pour te connecter. Le lien est valable 15 minutes et ne peut servir qu'une fois.", { label: "Me connecter", url }));
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          await assertAllowedEmail(user.email);
          return { data: user };
        },
      },
    },
  },
});

export const authEnabledProviders = () => ({ google: Boolean(env.googleClientId && env.googleClientSecret), password: true, magicLink: true });

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
