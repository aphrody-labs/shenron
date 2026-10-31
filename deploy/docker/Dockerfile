# SPDX-License-Identifier: Apache-2.0
# Runtime packaging for owner-sealed `dist/server` and `dist/bot` artifacts.
# Build from the repository root: podman build -f deploy/docker/Dockerfile .
FROM ubuntu:26.10

ENV SHENRON_HOME=/var/lib/shenron \
    SHENRON_PROFILE=production \
    PORT=5011 \
    HOSTNAME=127.0.0.1 \
    API_PORT=5006 \
    API_HOST=127.0.0.1 \
    DATABASE_PATH=/app/data/bot.db \
    SHENRON_FFI_LIB=/usr/local/lib/libshenron_ffi.so \
    SHENRON_BOT_ASSETS_DIR=/usr/local/share/shenron-bot \
    SHENRON_STUDIO_SDK_BIN=/usr/local/bin/koharu-sdk \
    SHENRON_STUDIO_HOME=/var/lib/shenron/data/studio \
    NAPI_RS_NATIVE_LIBRARY_PATH=/usr/local/bin/skia.linux-x64-gnu.node \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl fonts-noto-color-emoji fonts-wqy-microhei jq libfontconfig1 libgcc-s1 libsqlite3-0 libvulkan1 mesa-vulkan-drivers \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 shenron \
 && useradd --uid 10001 --gid 10001 --home-dir /var/lib/shenron --no-create-home --shell /usr/sbin/nologin shenron \
 && install -d -o 10001 -g 10001 /app/data /app/assets /var/lib/shenron \
 && install -d -o 10001 -g 10001 /var/lib/shenron/config /var/lib/shenron/cache /var/lib/shenron/data /var/lib/shenron/logs

# Revision metadata after the system layer, so that layer stays cached and identical across releases.
ARG SHENRON_REVISION=unknown
LABEL org.opencontainers.image.title="Shenron" \
      org.opencontainers.image.description="Shenron site/server and Discord bot runtime" \
      org.opencontainers.image.revision="$SHENRON_REVISION" \
      org.opencontainers.image.source="https://github.com/aphrody-labs/shenron"

# Stable layers first, the per-release binaries last.
COPY --chown=10001:10001 --chmod=644 dist/bot/linux-x64/skia.linux-x64-gnu.node /usr/local/bin/skia.linux-x64-gnu.node
# Canvas fonts and banners (`apps/bot/scripts/ship-canvas-assets.ts`), outside the /app/assets mount.
COPY --chown=10001:10001 --chmod=755 dist/bot/linux-x64/share /usr/local/share/shenron-bot
COPY --chown=10001:10001 --chmod=755 dist/bot/linux-x64/src/db/migrations /app/src/db/migrations
COPY --chown=10001:10001 --chmod=644 dist/bot/linux-x64/pipeline-build-receipt.json /usr/local/lib/shenron/pipeline-build-receipt.json
COPY --chown=10001:10001 --chmod=644 dist/bot/linux-x64/pipeline.mjs /usr/local/lib/shenron/pipeline.mjs
COPY --chown=10001:10001 --chmod=755 dist/server/linux-x64/native/koharu-sdk /usr/local/bin/koharu-sdk
COPY --chown=10001:10001 --chmod=755 dist/server/linux-x64/native/libshenron_ffi.so /usr/local/lib/libshenron_ffi.so
COPY --chown=10001:10001 --chmod=755 dist/mcp/linux-x64/shenron-mcp /usr/local/bin/shenron-mcp
COPY --chown=10001:10001 --chmod=755 dist/bot/linux-x64/shenron-bot /usr/local/bin/shenron-bot
COPY --chown=10001:10001 --chmod=755 dist/server/linux-x64/shenron-server /usr/local/bin/shenron-server

WORKDIR /app
USER 10001:10001
EXPOSE 5011 5006
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/shenron-server"]
CMD ["version"]
