# hunt — local-first job-hunt platform.
#
# The image has to satisfy one promise: `git clone && docker compose up` gives a
# working app on a machine with nothing installed. That means Tectonic ships
# inside the image (LaTeX rendering with no TeX Live install), and the app
# migrates its own database on boot.

ARG NODE_VERSION=20-bookworm-slim
ARG TECTONIC_VERSION=0.16.9

# ---- Tectonic -----------------------------------------------------------
# Static musl builds run fine on glibc, so one fetch covers both architectures.
FROM debian:bookworm-slim AS tectonic
ARG TECTONIC_VERSION
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN case "${TARGETARCH}" in \
      amd64) TARGET=x86_64-unknown-linux-musl ;; \
      arm64) TARGET=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${TARGET}.tar.gz" \
 && tar -xzf /tmp/tectonic.tar.gz -C /usr/local/bin tectonic \
 && chmod +x /usr/local/bin/tectonic

# ---- Dependencies -------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# better-sqlite3 is a native addon and compiles from source here.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall runs `prisma generate`, which needs the schema above.
RUN pnpm install --frozen-lockfile

# ---- Build --------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
# Standalone is opt-in (it disables `next start`, which local dev and e2e use).
ENV HUNT_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- Runtime ------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HUNT_DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=tectonic /usr/local/bin/tectonic /usr/local/bin/tectonic

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# ensureSchema() reads these at boot to build the database.
COPY --from=builder /app/prisma/migrations ./prisma/migrations

# The database and the key-encryption secret live here. Mount it to keep them.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME /data
USER node

EXPOSE 3000
CMD ["node", "server.js"]
