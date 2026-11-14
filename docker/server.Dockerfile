# API (Hono + better-auth) — runs DB migrations + initial seed on boot
FROM oven/bun:1.4.4 AS base
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages packages
COPY apps/server apps/server
ARG GIT_SHA=dev
ENV NODE_ENV=production GIT_SHA=$GIT_SHA PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "bun packages/db/src/migrate.ts && bun packages/db/src/seed.ts && exec bun apps/server/src/index.ts"]
