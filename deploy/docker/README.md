<!-- SPDX-License-Identifier: Apache-2.0 -->

# Shenron Docker production release

One immutable image contains the Next.js 16 standalone server, Discord bot, MCP
sidecar, native FFI and bot migrations. Aphrody Infra activates the image on DBFR
and owns nginx, PostgreSQL, Redis, certificates, secrets and protected persistent
stores.

Build, verify and ship it with `scripts/deploy/release.sh` on any Linux x64 host
with Git, Bun, Rust and docker or podman (see the headers of
`scripts/deploy/build-image.sh` and `scripts/deploy/ship-image.sh`, and
`docs/operations/CONTAINER-COMPLET.md`):

```sh
SHENRON_VFS_SOURCE=<file|URL|host:path> scripts/deploy/release.sh [revision]
scripts/deploy/release.sh --build-only [revision]   # image localhost/shenron:<sha>, verified
scripts/deploy/release.sh --ship-only [revision]    # SHENRON_DEPLOY_TARGET, default ssh:prod
```

`build-image.sh` fetches the public VFS, builds the site, the bot and the native
components in a reusable worktree (`SHENRON_BUILD_REPO`), then runs
`docker build -f deploy/docker/Dockerfile` with `SHENRON_REVISION` set to the
commit. `ship-image.sh` streams the image to the target and runs its Infra
activation entry (`~/deploy-shenron-image.sh <sha> <tar>` on DBFR), or pushes it
to a registry, or starts this Compose file locally (`local`). A release changed
by hand after sealing blocks every activation: never copy files into it.

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
