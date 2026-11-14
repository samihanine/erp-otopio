# Background worker (BullMQ): PDF rendering with Chromium + pg_dump backups to R2
FROM postgres:17-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=oven/bun:1.4.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --ignore-scripts
COPY packages packages
COPY apps/worker apps/worker
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium
USER postgres
ENTRYPOINT []
CMD ["bun", "apps/worker/src/index.ts"]
