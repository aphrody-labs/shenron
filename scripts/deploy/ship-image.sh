#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Ship a Shenron image built by build-image.sh to a target and activate it there.
#
#   scripts/deploy/ship-image.sh [revision]        (default: HEAD of the build worktree)
#
# Targets (SHENRON_DEPLOY_TARGET):
#   ssh:<host>   stream the image over SSH (zstd), then run SHENRON_DEPLOY_COMMAND there
#                with `<sha> <image tar>`; default command: bash ~/deploy-shenron-image.sh
#                (the Infra activation entry of DBFR)
#   registry:<repository>   tag and push to a registry, then run SHENRON_DEPLOY_COMMAND
#                locally with `<sha> <repository>:<sha>` when it is set
#   local        Compose on this host: deploy/docker/compose.yaml with SHENRON_IMAGE_TAG=<sha>
#                (override with SHENRON_COMPOSE_FILE), or SHENRON_DEPLOY_COMMAND when set
# Default target: ssh:dbfr.
#
# Rollback guard (ssh targets): SHENRON_ACTIVE_COMMAND prints the active release; the first
# 40-hex commit in its output must be an ancestor of the shipped commit unless
# SHENRON_ALLOW_ROLLBACK=1. Default: basename of /srv/shenron/current. Empty disables the guard.
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
W=${SHENRON_BUILD_REPO:-$HOME/build/shenron}
IMAGE=${SHENRON_IMAGE:-localhost/shenron}
ENGINE=${SHENRON_CONTAINER:-$(command -v docker >/dev/null 2>&1 && echo docker || echo podman)}
TARGET=${SHENRON_DEPLOY_TARGET:-ssh:${SHENRON_DEPLOY_HOST:-dbfr}}
SHA=$(git -C "$W" rev-parse --verify "${1:-HEAD}^{commit}")
"$ENGINE" image inspect "$IMAGE:$SHA" >/dev/null
SSH=(ssh -o ConnectTimeout=15 -o BatchMode=yes)
STARTED=$SECONDS
phase() { echo "== $1 (+$((SECONDS - STARTED))s)"; }

guard_rollback() {
  local active
  [ "${SHENRON_ALLOW_ROLLBACK:-0}" = 1 ] && return
  active=$("$@" | grep -oE '[0-9a-f]{40}' | head -1 || true)
  [ -n "$active" ] || return 0
  git -C "$W" fetch -q origin || true
  git -C "$W" merge-base --is-ancestor "$active" "$SHA" || {
    echo "Refusing to ship $SHA: the active release $active is not one of its ancestors (SHENRON_ALLOW_ROLLBACK=1 to override)" >&2
    exit 3
  }
}

case "$TARGET" in
  ssh:*)
    host=${TARGET#ssh:}
    active_command=${SHENRON_ACTIVE_COMMAND-'basename "$(readlink -f /srv/shenron/current)"'}
    [ -z "$active_command" ] || guard_rollback "${SSH[@]}" "$host" "$active_command"
    phase "transfer to $host"
    tar=/tmp/shenron-$SHA.tar
    "$ENGINE" save "$IMAGE:$SHA" | zstd -q -T0 -1 | "${SSH[@]}" "$host" "zstd -q -d -o $tar"
    phase "activate on $host"
    "${SSH[@]}" "$host" "${SHENRON_DEPLOY_COMMAND:-bash ~/deploy-shenron-image.sh} $SHA $tar"
    ;;
  registry:*)
    repository=${TARGET#registry:}
    phase "push $repository:$SHA"
    "$ENGINE" tag "$IMAGE:$SHA" "$repository:$SHA"
    "$ENGINE" push "$repository:$SHA"
    [ -z "${SHENRON_DEPLOY_COMMAND:-}" ] || bash -c "$SHENRON_DEPLOY_COMMAND \"\$@\"" _ "$SHA" "$repository:$SHA"
    ;;
  local)
    phase "activate locally"
    if [ -n "${SHENRON_DEPLOY_COMMAND:-}" ]; then
      bash -c "$SHENRON_DEPLOY_COMMAND \"\$@\"" _ "$SHA" "$IMAGE:$SHA"
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
