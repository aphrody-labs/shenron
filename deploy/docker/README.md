<!-- SPDX-License-Identifier: Apache-2.0 -->
# Shenron Docker production release

One immutable image contains the Next.js 16 standalone server, Discord bot, MCP
sidecar, native FFI and bot migrations. Build application artifacts on the VPS;
WSL holds source only. Aphrody Infra activates the image on DBFR and owns nginx,
PostgreSQL, Redis, certificates, secrets and protected persistent stores.

```sh
bun scripts/data/build-vfs.ts --profile public --rag-source wiki --vectors none
bun scripts/build/server.ts --flavor production --target linux-x64
bun scripts/build/bot.ts --target linux-x64
# Use the serialized Cargo factory for a changed MCP/native component.
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
# Embedded server packaging removes extracted native files; seal the bot copy.
install -D -m 0755 target/release/libshenron_ffi.so \
  dist/server/linux-x64/native/libshenron_ffi.so
docker build -f deploy/docker/Dockerfile \
  --build-arg SHENRON_REVISION="$(git rev-parse HEAD)" \
  -t "localhost/shenron:$(git rev-parse HEAD)" .
```

The public VFS builder uses read-only PostgreSQL connections. Its wiki source
indexes the visible editorial snapshot and public agent template, without private
knowledge databases. This mode supports lexical retrieval; embeddings require a
separately qualified embedding service. Production server packaging refuses a
missing, private or empty public VFS. Private conversations, model weights and
credentials never enter the image or build context.

Infra mounts `/srv/shenron/shared/server` at `/var/lib/shenron`; the public snapshot
is `/var/lib/shenron/data/shenron-vfs.sqlite`. Bot state and read-only assets have
separate mounts. Compose loads protected host environment files and overrides the
native library path to the image's `/usr/local/lib/libshenron_ffi.so`. Both apps
listen on host loopback. The site starts its embedded MCP sidecar.

```sh
docker run --rm localhost/shenron:<revision> version
docker run --rm --entrypoint /usr/local/bin/shenron-bot \
  localhost/shenron:<revision> --smoke
docker compose -f deploy/docker/compose.yaml config --quiet
```

Set `SHENRON_IMAGE_TAG` to the full immutable revision and `SHENRON_REVISION` to
the same commit. Infra provisions the shared directories, environment files
(0600), backend endpoints and ingress before activation. Readiness requires public
RAG and MCP availability; complete production qualification also covers editorial
pages, Discord readiness and actual Aphrody backend requests.
