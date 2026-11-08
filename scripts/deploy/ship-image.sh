#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Ship a Shenron image built by build-image.sh to a target and activate it there.
#
#   scripts/deploy/ship-image.sh [revision]        (default: HEAD of the build worktree)
#
# Targets (SHENRON_DEPLOY_TARGET):
#   ssh:<host>   stream the image over SSH (zstd -T0), then run SHENRON_DEPLOY_COMMAND there
#                with `<sha> [image-tar]`; default command: bash /root/deploy-shenron-image.sh
#                (the Infra activation entry on prod, a link to /srv/shenron/bin/deploy-image.sh).
#                Supports the fleet triad: vps (10.200.77.1), cdn (10.200.77.3 / 51.255.162.6),
#                and prod (10.200.77.5, Arch Linux 7.2.11).
#   registry:<repository>   tag and push to a registry, then run SHENRON_DEPLOY_COMMAND
#                locally with `<sha> <repository>:<sha>` when it is set
#   local        Compose on this host: deploy/docker/compose.yaml with SHENRON_IMAGE_TAG=<sha>
#                (override with SHENRON_COMPOSE_FILE), or SHENRON_DEPLOY_COMMAND when set
# Default target: ssh:prod.
#
# Services (SHENRON_SERVICES, default "site bot"): passed to the activation command in its
# environment; deploy/activation/activate.sh switches only those, each with --no-deps.
#
# Rollback guard (ssh and local targets, through scripts/deploy/active-release.sh):
# SHENRON_ACTIVE_COMMAND prints the active release; the first 40-hex commit in its output must be an ancestor of the shipped commit unless
# SHENRON_ALLOW_ROLLBACK=1. Default: the revision the running containers were created from
# (the image tag of shenron-site, then SHENRON_IMAGE_TAG of /srv/shenron/.env), not
# /srv/shenron/current, which only names the static release directory and lagged the image
# until 2026-11-03 (audit surface-2026-11-05 E2). Empty disables the guard.
#
# Database migrations are never applied here: a release whose diff touches them is held by
# scripts/deploy/release.sh --auto, and Aphrody Infra applies them by its runbook. The previous
# automatic step remains for manual use only, behind SHENRON_REMOTE_MIGRATE=1.
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
W=${SHENRON_BUILD_REPO:-$HOME/build/shenron}
IMAGE=${SHENRON_IMAGE:-localhost/shenron}
ENGINE=${SHENRON_CONTAINER:-$(command -v docker >/dev/null 2>&1 && echo docker || echo podman)}
TARGET=${SHENRON_DEPLOY_TARGET:-ssh:${SHENRON_DEPLOY_HOST:-prod}}
resolve_host() {
  case "$1" in
    vps) echo "${SHENRON_VPS_HOST:-vps}" ;;
    cdn | bunos) echo "${SHENRON_CDN_HOST:-cdn}" ;;
    prod) echo "${SHENRON_PROD_HOST:-prod}" ;;
    *) echo "$1" ;;
  esac
}
SHA=$(git -C "$W" rev-parse --verify "${1:-HEAD}^{commit}")
"$ENGINE" image inspect "$IMAGE:$SHA" >/dev/null
SSH=(ssh -o ConnectTimeout=15 -o BatchMode=yes -o Compression=no)
STARTED=$SECONDS
SERVICES=${SHENRON_SERVICES:-site bot}
case "$SERVICES" in *[!a-z\ ]* | "") echo "Invalid SHENRON_SERVICES: $SERVICES" >&2; exit 64 ;; esac
phase() { echo "== $1 (+$((SECONDS - STARTED))s)"; }

guard_rollback() {
  local active
  [ "${SHENRON_ALLOW_ROLLBACK:-0}" = 1 ] && return
  active=$(bash "$HERE/active-release.sh" site)
  [ -n "$active" ] || return 0
  if ! git -C "$W" cat-file -e "$active^{commit}" 2>/dev/null; then
    git -C "$W" fetch -q origin || true
  fi
  git -C "$W" merge-base --is-ancestor "$active" "$SHA" || {
    echo "Refusing to ship $SHA: the active release $active is not one of its ancestors (SHENRON_ALLOW_ROLLBACK=1 to override)" >&2
    exit 3
  }
}

case "$TARGET" in
  ssh:*)
    host=$(resolve_host "${TARGET#ssh:}")
    guard_rollback
    phase "transfer to $host"
    tar=/tmp/shenron-$SHA.tar
    if [ "${SHENRON_STREAM_LOAD:-0}" = 1 ]; then
      "$ENGINE" save "$IMAGE:$SHA" | zstd -q -T0 -3 | "${SSH[@]}" "$host" "zstd -q -d -T0 | docker load -q"
      tar=
    else
      "$ENGINE" save "$IMAGE:$SHA" | zstd -q -T0 -3 | "${SSH[@]}" "$host" "zstd -q -d -T0 -o $tar"
    fi
    # Pending site migrations go first, after a dump, in one transaction each; a failure aborts the
    # release before it is activated. The script and the SQL come from the shipped revision itself.
    if [ "${SHENRON_REMOTE_MIGRATE:-0}" = 1 ] && git -C "$W" cat-file -e "$SHA:deploy/prod/apply-migrations.py" 2>/dev/null; then
      phase "migrate on $host"
      mig=/tmp/shenron-migrations-$SHA
      git -C "$W" archive "$SHA" apps/site/src/db/migrations deploy/prod/apply-migrations.py \
        | "${SSH[@]}" "$host" "rm -rf $mig && mkdir -p $mig && tar -x -C $mig \
          && python3 $mig/deploy/prod/apply-migrations.py $mig/apps/site/src/db/migrations; rc=\$?; rm -rf $mig; exit \$rc"
    fi
    phase "activate on $host"
    "${SSH[@]}" "$host" "SHENRON_SERVICES='$SERVICES' ${SHENRON_DEPLOY_COMMAND:-bash /root/deploy-shenron-image.sh} $SHA $tar"
    # Keep the newest SHENRON_REMOTE_KEEP_IMAGES revisions (rollback targets); an image in use
    # is never removed (no --force). Each image is about 1.8 GiB on the target root disk.
    keep=${SHENRON_REMOTE_KEEP_IMAGES:-4}
    [ "$keep" = 0 ] || "${SSH[@]}" "$host" "DOCKER=\$([ \"\$(id -u)\" = 0 ] && echo docker || echo 'sudo -n docker'); \$DOCKER image ls --format '{{.Repository}}:{{.Tag}}' localhost/shenron \
      | grep -vE ':(local|active)\$' | sed -n '$((keep + 1)),\$p' \
      | xargs -r -n1 \$DOCKER image rm >/dev/null 2>&1 || true"
    ;;
  registry:*)
    repository=${TARGET#registry:}
    phase "push $repository:$SHA"
    "$ENGINE" tag "$IMAGE:$SHA" "$repository:$SHA"
    "$ENGINE" push "$repository:$SHA"
    [ -z "${SHENRON_DEPLOY_COMMAND:-}" ] || SHENRON_SERVICES=$SERVICES bash -c "$SHENRON_DEPLOY_COMMAND \"\$@\"" _ "$SHA" "$repository:$SHA"
    ;;
  local)
    guard_rollback
    phase "activate locally"
    if [ -n "${SHENRON_DEPLOY_COMMAND:-}" ]; then
      SHENRON_SERVICES=$SERVICES bash -c "$SHENRON_DEPLOY_COMMAND \"\$@\"" _ "$SHA" "$IMAGE:$SHA"
    else
      SHENRON_IMAGE_TAG=$SHA SHENRON_REVISION=$SHA "$ENGINE" compose \
        -f "${SHENRON_COMPOSE_FILE:-$HERE/../../deploy/docker/compose.yaml}" up -d --no-build
    fi
    ;;
  *)
    echo "Unknown SHENRON_DEPLOY_TARGET: $TARGET (ssh:<host> | registry:<repository> | local)" >&2
    exit 64
    ;;
esac
phase "shipped $SHA to $TARGET"
