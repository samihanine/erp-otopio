# Front-end (Vite + React) served by nginx; /api is routed to the server by Traefik
FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/google/package.json packages/google/
COPY packages/ai/package.json packages/ai/
COPY scripts/package.json scripts/
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages packages
COPY apps/web apps/web
RUN cd apps/web && bunx vite build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
