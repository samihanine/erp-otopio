# Otopio ERP

ERP interne d'Otopio : CRM, projets, tâches, tickets, devis, factures, dépenses, contenus marketing — avec des vues façon Notion/Airtable (table éditable, kanban, Gantt, calendrier, galerie, liste), des filtres/tris et des vues sauvegardées, un module Documents (devis + cahier des charges, factures → PDF), un tableau de bord Finance multi-structures (Megascale 🇫🇷 / Otopio Inc. 🇨🇦) et un onglet Site web.

## Stack

| Couche | Techno |
| --- | --- |
| Front (`apps/web`) | React 19, Vite, TanStack Router + Query, Tailwind v4, composants Radix « shadcn-style », Recharts, cmdk |
| API (`apps/server`) | Bun, Hono, better-auth (Google Workspace + mot de passe), Drizzle ORM |
| Worker (`apps/worker`) | BullMQ (Redis) : génération PDF (Chromium), sauvegardes `pg_dump` → Cloudflare R2 |
| BDD (`packages/db`) | PostgreSQL 17, migrations Drizzle, seed initial (Airtable + Drive + Gmail) |
| Partagé (`packages/shared`) | Métadonnées des tables (champs, vues, filtres), calculs de taxes, template HTML des documents |

Les métadonnées de `packages/shared/src/tables.ts` pilotent à la fois l'API générique (`/api/data/:table`) et toutes les vues du front : ajouter un champ = l'ajouter au schéma Drizzle + à la métadonnée.

## Développement

```bash
bun install
cp .env.example .env            # puis ajuster DATABASE_URL / REDIS_URL
bun run db:migrate && bun run db:seed
ADMIN_PASSWORD=… bun run dev:server   # :3000
bun run dev:worker
bun run dev:web                       # :5173 (proxy /api → :3000)
```

`SEED_RESET=1 bun run db:seed` réinitialise les données métier.

## Modèle de données

`legal_entity` (structures qui facturent : Megascale SARL / Otopio Inc., extensible) · `organization` (client, lead, fournisseur, partenaire) · `person` · `project` (repo GitHub lié) · `task` (heures estimées/passées) · `ticket` · `quote` (lignes + cahier des charges) · `invoice` · `bill` (dépenses, justificatif) · `transaction` (flux Qonto / QuickBooks pour le rapprochement) · `article` · `post` · `document` (templates + documents libres / Google Docs) · `saved_view` · `activity`.

## Déploiement (Dokploy)

Projet Dokploy **Otopio ERP**, environnements `production` et `staging`, chacun avec : `postgres` (17), `redis`, `server` (`docker/server.Dockerfile`), `worker` (`docker/worker.Dockerfile`), `web` (`docker/web.Dockerfile`).

- prod : https://erp.otopio.ca — staging : https://staging.erp.otopio.ca
- Traefik route `/api` → `server:3000` et `/` → `web:80` sur le même domaine (cookies same-origin).
- Le serveur applique les migrations puis le seed (uniquement si la base est vide) au démarrage.
- Branches : `main` → production, `staging` → staging (auto-deploy Dokploy sur push).
- Cloudflare R2 : buckets `otopio-erp` (prod), `otopio-erp-staging`, `otopio-erp-backups` (dump quotidien du worker + backup Dokploy à 4 h).

### Connexion Google (OAuth)

Google Cloud Console → projet *otopio erp* → **APIs & Services → OAuth consent screen** (type *Internal*), puis **Credentials → Create credentials → OAuth client ID** (type *Web application*) :

- Authorized JavaScript origins : `https://erp.otopio.ca`, `https://staging.erp.otopio.ca`
- Authorized redirect URIs : `https://erp.otopio.ca/api/auth/callback/google`, `https://staging.erp.otopio.ca/api/auth/callback/google`

Renseigner ensuite `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans l'app `server` (prod + staging) et redéployer.

Variables d'environnement : voir `.env.example`.
