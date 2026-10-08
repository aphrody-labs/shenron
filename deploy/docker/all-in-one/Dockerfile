# SPDX-License-Identifier: Apache-2.0
# Complete all-in-one container for Shenron (dragonballfr.com).
# Houses:
# - PostgreSQL 16/18 database with extensions
# - Redis 8 cache & state
# - Shenron Server (Next.js 16, Studio, Desktop web, MCP, APIs)
# - Shenron Bot (Discord gateway & slash commands)
# - Nginx reverse-proxy & CDN caching gateway
# - VFS SQLite and Drizzle migrations

FROM ubuntu:24.04

ARG SHENRON_REVISION=unknown
# Bun runtime: release of the aphrody-labs/bun fork (package.json#packageManager).
ARG BUN_VERSION=1.4.3-aphrody.1

LABEL org.opencontainers.image.title="Shenron Complete" \
      org.opencontainers.image.description="All-in-one container for Dragon Ball FR (Site, Bot, Studio, DB, Redis, Nginx)" \
      org.opencontainers.image.revision="${SHENRON_REVISION}" \
      org.opencontainers.image.source="https://github.com/aphrody-labs/shenron"

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    SHENRON_PROFILE=production \
    SHENRON_HOME=/var/lib/shenron \
    PORT=5011 \
    HOSTNAME=127.0.0.1 \
    API_PORT=5006 \
    API_HOST=127.0.0.1 \
    DATABASE_URL=postgres://shenron@127.0.0.1:5432/shenron_site \
    DATABASE_PATH=/app/data/bot.db \
    REDIS_URL=redis://127.0.0.1:6379 \
    SHENRON_FFI_LIB=/usr/local/lib/libshenron_ffi.so \
    NEXT_TELEMETRY_DISABLED=1

# Install system dependencies, PostgreSQL, Redis, Nginx and utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    jq \
    libgcc-s1 \
    libsqlite3-0 \
    procps \
    unzip \
    sqlite3 \
    nginx \
    redis-server \
    redis-tools \
    postgresql \
    postgresql-contrib \
 && rm -rf /var/lib/apt/lists/*

# Install Bun (aphrody-labs/bun fork)
RUN arch="$(uname -m)"; case "$arch" in x86_64) asset=bun-linux-x64 ;; aarch64) asset=bun-linux-aarch64 ;; *) exit 1 ;; esac \
 && curl -fsSL -o /tmp/bun.zip "https://github.com/aphrody-labs/bun/releases/download/aphrody-v${BUN_VERSION}/${asset}.zip" \
 && unzip -q /tmp/bun.zip -d /tmp/bun \
 && install -m 0755 "/tmp/bun/${asset}/bun" /usr/local/bin/bun \
 && ln -sf bun /usr/local/bin/bunx \
 && rm -rf /tmp/bun /tmp/bun.zip \
 && bun --revision

# Create shenron user and directories
RUN groupadd --gid 10001 shenron \
 && useradd --uid 10001 --gid 10001 --home-dir /var/lib/shenron --no-create-home --shell /bin/bash shenron \
 && install -d -m 0755 -o shenron -g shenron /app /app/data /app/assets /var/lib/shenron \
 && install -d -m 0755 -o shenron -g shenron /var/lib/shenron/config /var/lib/shenron/cache /var/lib/shenron/data /var/lib/shenron/logs \
 && install -d -m 0755 /srv/shenron-cdn /srv/shenron-cdn/site /srv/shenron-cdn/assets /srv/shenron-cdn/wiki /srv/shenron-cdn/site-extra

WORKDIR /app

# Copy application configuration and migrations
COPY apps/site/src/db/migrations /app/site-migrations
COPY apps/bot/src/db/migrations /app/src/db/migrations
COPY scripts/ops /app/scripts/ops

# Copy Nginx config and entrypoint script
COPY deploy/docker/all-in-one/nginx.conf /etc/nginx/nginx.conf
COPY deploy/docker/all-in-one/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Copy binaries if available from release build
# (Fallback to source execution via Bun if binary is not pre-packaged)
COPY --chown=shenron:shenron package.json bunfig.toml tsconfig.json* /app/
COPY --chown=shenron:shenron apps /app/apps
COPY --chown=shenron:shenron packages /app/packages
COPY --chown=shenron:shenron data /app/data-canonique

# Expose all DBFR ports:
# 80: Nginx HTTP Gateway
# 443: Nginx HTTPS Gateway
# 5011: Shenron Server / Site / Studio
# 5006: Shenron Bot API
# 5432: PostgreSQL Database
# 6379: Redis Cache
# 8790: Local Studio API Bridge
EXPOSE 80 443 5011 5006 5432 6379 8790

STOPSIGNAL SIGTERM

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
