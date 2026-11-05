#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Per-service activation of one Shenron image on the production host. Template owned by this
# repository, installed and run by Aphrody Infra (it replaces /srv/shenron/bin/deploy-image.sh,
# which /root/deploy-shenron-image.sh links to). Runbook: docs/operations/AUTO-DEPLOY.md.
#
#   activate.sh <sha> [image-tar]
#
# Environment:
#   SHENRON_SERVICES      services to switch, in this order (default: ACTIVATION_ORDER, "site bot");
#                         scripts/deploy/ship-image.sh passes only the services the change reaches
#   SHENRON_ROOT          default /srv/shenron
#   SHENRON_COMPOSE_FILE  default $SHENRON_ROOT/compose.yaml (deploy/prod/compose.yaml)
#   SHENRON_ACTIVATION_ENV  service table (default: activation.env next to this script, emitted by
#                         `bun scripts/deploy/environment.ts --emit activation`; built-in defaults
#                         below are the same values)
#
# Guarantees:
# - Every switch is `docker compose up -d --no-deps --wait <service>`: postgres, redis, embed,
#   compute, chat and cloudflared are never started, stopped or recreated, so a missing model or an
#   unhealthy dependency cannot take the site down (the 2026-11-04 outage).
# - Each service keeps its own image tag (SHENRON_SITE_TAG, SHENRON_BOT_TAG in .env): a bot-only
#   release leaves the site container untouched, and the reverse.
# - A service whose container does not become healthy, or whose probe fails, is switched back to
#   its previous tag at once; the other services keep what they run. Exit 1 on any rollback.
# - Static assets: the new release directory carries the previous release's hashed _next/static
#   files as hard links, and the gateway is switched before the site, so neither the old nor the
#   new HTML ever references a missing chunk.
# - No database migration runs here, ever.
set -euo pipefail

usage() { sed -n '7,8p' "$0" >&2; exit 64; }
[ $# -ge 1 ] && [ $# -le 2 ] || usage
SHA=$1
TAR=${2:-}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "error: invalid revision: $SHA" >&2; exit 64; }

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=${SHENRON_ROOT:-/srv/shenron}
COMPOSE=${SHENRON_COMPOSE_FILE:-$ROOT/compose.yaml}
ENV_FILE=$ROOT/.env
IMAGE_REPO=${SHENRON_IMAGE:-localhost/shenron}
IMAGE=$IMAGE_REPO:$SHA

# Service table (same values as deploy/environment.json).
ACTIVATION_ORDER='site bot'
KEEP_IMAGES=4
KEEP_RELEASES=6
CONTAINER_SITE=shenron-site HEALTH_SITE=http://127.0.0.1:5011/api/local/health HEALTH_HOST_SITE= WAIT_SITE=150
CONTAINER_BOT=shenron-bot HEALTH_BOT=http://127.0.0.1:5006/health HEALTH_HOST_BOT= WAIT_BOT=150
CONTAINER_GATEWAY=shenron-gateway HEALTH_GATEWAY=https://127.0.0.1/api/health HEALTH_HOST_GATEWAY=dragonballfr.com WAIT_GATEWAY=90
TABLE=${SHENRON_ACTIVATION_ENV:-$HERE/activation.env}
# shellcheck disable=SC1090
[ ! -f "$TABLE" ] || . "$TABLE"
SERVICES=${SHENRON_SERVICES:-$ACTIVATION_ORDER}

STARTED=$SECONDS
phase() { echo "== $1 (+$((SECONDS - STARTED))s)"; }
die() { echo "error: $*" >&2; exit 1; }

exec 8>"$ROOT/.activate.lock"
flock -w 900 8 || die "another activation holds $ROOT/.activate.lock"

grep -q 'SHENRON_SITE_TAG' "$COMPOSE" ||
  die "$COMPOSE has no per-service tags: install deploy/prod/compose.yaml first (docs/operations/AUTO-DEPLOY.md)"
for service in $SERVICES; do
  case " $ACTIVATION_ORDER " in *" $service "*) ;; *) die "unknown service: $service" ;; esac
done

if [ -n "$TAR" ]; then
  [ -s "$TAR" ] || die "image archive $TAR is empty"
  phase "load $TAR"
  docker load -q -i "$TAR"
  case "$TAR" in /tmp/shenron-*.tar) rm -f "$TAR" ;; esac
fi
docker image inspect "$IMAGE" >/dev/null 2>&1 || die "image not found: $IMAGE"

# The image must run before anything switches: same checks as the build (build-image.sh).
phase "verify $IMAGE"
timeout 60 docker run --rm --network none "$IMAGE" version >/dev/null
case " $SERVICES " in *" bot "*)
  timeout 60 docker run --rm --network none --entrypoint /usr/local/bin/shenron-bot "$IMAGE" --smoke >/dev/null ;;
esac

dc() { docker compose -f "$COMPOSE" --env-file "$ENV_FILE" "$@"; }

env_get() { # key
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1
}

env_set() { # key value: atomic rewrite, other keys kept
  local temporary
  temporary=$(mktemp "$ROOT/.env.XXXXXX")
  { [ ! -f "$ENV_FILE" ] || grep -v "^$1=" "$ENV_FILE" || true; echo "$1=$2"; } > "$temporary"
  chmod 600 "$temporary"
  mv -f "$temporary" "$ENV_FILE"
}

probe() { # service: poll its health URL until WAIT_<SERVICE> seconds
  local upper=${1^^} url host wait deadline
  url=HEALTH_$upper host=HEALTH_HOST_$upper wait=WAIT_$upper
  deadline=$((SECONDS + ${!wait}))
  local args=(-fsS -o /dev/null --max-time 5)
  [ -z "${!host}" ] || args+=(-k -H "Host: ${!host}")
  until curl "${args[@]}" "${!url}"; do
    [ "$SECONDS" -lt "$deadline" ] || return 1
    sleep 2
  done
}

switch() { # service tag: recreate that service alone and wait for its own health
  local upper=${1^^} wait
  wait=WAIT_$upper
  env_set "SHENRON_${upper}_TAG" "$2"
  dc up -d --no-deps --wait --wait-timeout "${!wait}" "$1" && probe "$1"
}

swap_current() { # release directory
  ln -sfn "$1" "$ROOT/current.tmp"
  mv -Tf "$ROOT/current.tmp" "$ROOT/current"
}

recreate_gateway() {
  # The gateway bind-mounts current/, resolved when the container is created.
  dc up -d --no-deps --force-recreate --wait --wait-timeout "$WAIT_GATEWAY" gateway && probe gateway
}

# Release directory of the site: nginx config, public files and hashed chunks of this image, plus
# the previous release's chunks (hard links), so in-flight pages keep loading during the switch.
# Sets RELEASE. Every step is checked explicitly: `set -e` does not apply inside a function
# called from an `if` or `||` list.
RELEASE=
prepare_release() { # previous release directory (may be empty)
  local staging artifact cid
  RELEASE=$ROOT/releases/docker-$SHA
  [ ! -d "$RELEASE" ] || return 0
  staging=$(mktemp -d "$ROOT/releases/.staging-XXXXXX") || return 1
  mkdir -p "$staging/nginx" "$staging/public" "$staging/cdn/_next/static" || return 1
  cp -a "$ROOT/config/nginx/." "$staging/nginx/" || return 1
  artifact=$ROOT/build/artifacts/$SHA
  if [ -f "$artifact/REVISION" ] && [ "$(cat "$artifact/REVISION")" = "$SHA" ]; then
    (cd "$artifact" && sha256sum --check --quiet SHA256SUMS) || return 1
    cp -a "$artifact/cdn/site/." "$staging/public/" || return 1
    cp -a "$artifact/cdn/_next/static/." "$staging/cdn/_next/static/" || return 1
    cp "$artifact/cdn/BUILD_ID" "$staging/BUILD_ID" || return 1
  else
    cid=$(docker create "$IMAGE") || return 1
    docker cp -q "$cid:/app/apps/site/public/." "$staging/public/" 2>/dev/null ||
      docker cp -q "$cid:/usr/local/share/shenron-site/public/." "$staging/public/" 2>/dev/null || true
    docker cp -q "$cid:/app/apps/site/.next/static/." "$staging/cdn/_next/static/" 2>/dev/null ||
      docker cp -q "$cid:/usr/local/share/shenron-site/_next/static/." "$staging/cdn/_next/static/" 2>/dev/null || true
    docker rm -f "$cid" >/dev/null
  fi
  # Hashed names never collide: the old chunks are added, never overwrite a new one.
  if [ -n "$1" ] && [ -d "$1/cdn/_next/static" ]; then
    cp -al -n "$1/cdn/_next/static/." "$staging/cdn/_next/static/" 2>/dev/null || true
  fi
  mv -T "$staging" "$RELEASE"
}

activate_site() {
  local previous_tag previous_release
  previous_tag=$(env_get SHENRON_SITE_TAG)
  previous_tag=${previous_tag:-$(env_get SHENRON_IMAGE_TAG)}
  [ "$previous_tag" != "$SHA" ] || { echo "== site already runs $SHA"; return 0; }
  previous_release=$(readlink -f "$ROOT/current" 2>/dev/null || true)
  phase "site: release directory"
  prepare_release "$previous_release" || { echo "!! cannot assemble the release directory of $SHA" >&2; return 1; }
  phase "site: gateway follows $RELEASE"
  swap_current "$RELEASE"
  if ! recreate_gateway; then
    echo "!! gateway unhealthy on the new release directory: restoring $previous_release" >&2
    [ -z "$previous_release" ] || swap_current "$previous_release"
    recreate_gateway || echo "!! gateway still unhealthy after restore" >&2
    return 1
  fi
  phase "site: switch to $SHA"
  if switch site "$SHA"; then
    phase "site healthy on $SHA"
    return 0
  fi
  echo "!! site unhealthy on $SHA: rolling back to ${previous_tag:-nothing}" >&2
  if [ -n "$previous_tag" ]; then
    switch site "$previous_tag" || echo "!! site rollback to $previous_tag is unhealthy too" >&2
  fi
  [ -z "$previous_release" ] || { swap_current "$previous_release"; recreate_gateway || true; }
  return 1
}

activate_bot() {
  local previous_tag
  previous_tag=$(env_get SHENRON_BOT_TAG)
  previous_tag=${previous_tag:-$(env_get SHENRON_IMAGE_TAG)}
  [ "$previous_tag" != "$SHA" ] || { echo "== bot already runs $SHA"; return 0; }
  phase "bot: switch to $SHA"
  if switch bot "$SHA"; then
    phase "bot healthy on $SHA"
    return 0
  fi
  echo "!! bot unhealthy on $SHA: rolling back to ${previous_tag:-nothing}" >&2
  if [ -n "$previous_tag" ]; then
    switch bot "$previous_tag" || echo "!! bot rollback to $previous_tag is unhealthy too" >&2
  fi
  return 1
}

failed=
for service in $SERVICES; do
  "activate_$service" || failed="$failed $service"
done

# Compatibility keys: the newest activated revision (read by the rollback guard of ship-image.sh).
if [ -z "$failed" ]; then
  env_set SHENRON_IMAGE_TAG "$SHA"
  env_set SHENRON_REVISION "$SHA"
fi

# Retention: release directories and images no service references; never volumes, never --force.
in_use="$(env_get SHENRON_SITE_TAG) $(env_get SHENRON_BOT_TAG) $(env_get SHENRON_IMAGE_TAG)"
current=$(readlink -f "$ROOT/current" 2>/dev/null || true)
find "$ROOT/releases" -maxdepth 1 -name 'docker-*' -type d -printf '%T@ %p\n' 2>/dev/null | sort -rn |
  awk -v keep="$KEEP_RELEASES" 'NR > keep {print $2}' | while read -r old; do
    [ "$old" = "$current" ] || case " $in_use " in *" ${old##*/docker-} "*) ;; *) rm -rf "$old" ;; esac
  done
docker image ls --format '{{.Tag}}' "$IMAGE_REPO" | grep -E '^[0-9a-f]{40}$' |
  awk -v keep="$KEEP_IMAGES" 'NR > keep' | while read -r tag; do
    case " $in_use " in *" $tag "*) ;; *) docker image rm "$IMAGE_REPO:$tag" >/dev/null 2>&1 || true ;; esac
  done

if [ -n "$failed" ]; then
  echo "!! release $SHA rolled back for:$failed" >&2
  exit 1
fi
phase "release $SHA active and healthy for: $SERVICES"
