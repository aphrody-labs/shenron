#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build, verify and ship one Shenron revision: build-image.sh then ship-image.sh.
#
#   scripts/deploy/release.sh [--build-only | --ship-only | --auto | --plan] [revision]
#
#   --plan   print what --auto would do against the revisions production runs, change nothing
#   --auto   the auto-deploy entry: compare the revision (default origin/main) with what each
#            service runs (scripts/deploy/active-release.sh), then build only the changed lanes
#            and switch only the services they reach. Exit 0 with nothing to do; exit 78 when the
#            diff touches database migrations (held: Infra applies them, then rerun with
#            SHENRON_ACCEPT_HOLDS=1); exit 65 when a changed path is not classified.
#
# Every setting is an environment variable of those scripts (see their headers); run it on any
# Linux x64 builder, for any target (ssh:<host>, registry:<repository>, local).
# Runbook: docs/operations/AUTO-DEPLOY.md.
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mode=all
case "${1:-}" in
  --build-only) mode=build; shift ;;
  --ship-only) mode=ship; shift ;;
  --auto) mode=auto; shift ;;
  --plan) mode=plan; shift ;;
  -h | --help) sed -n '3,16p' "$0"; exit 0 ;;
esac

if [ "$mode" = auto ] || [ "$mode" = plan ]; then
  SOURCE=${SHENRON_SOURCE_REPO:-$(git -C "$HERE" rev-parse --show-toplevel)}
  git -C "$SOURCE" fetch -q origin
  head=$(git -C "$SOURCE" rev-parse --verify "${1:-${SHENRON_BUILD_REVISION:-origin/main}}^{commit}")
  lanes() { bun "$HERE/lanes.ts" "$@"; }
  services=
  holds=
  for service in site bot; do
    base=$(bash "$HERE/active-release.sh" "$service")
    if [ -z "$base" ]; then
      echo "== $service: no active revision found, full release"
      services="$services $service"
      continue
    fi
    git -C "$SOURCE" cat-file -e "$base^{commit}" 2>/dev/null || {
      echo "== $service runs $base, unknown to this clone: full release"
      services="$services $service"
      continue
    }
    plan=$(cd "$SOURCE" && lanes plan --base "$base" --head "$head" --format json)
    echo "== $service: $base -> $head"
    (cd "$SOURCE" && lanes plan --base "$base" --head "$head" --format text) | sed 's/^/   /'
    PLAN="$plan" SERVICE="$service" bun -e '
      const plan = JSON.parse(process.env.PLAN);
      if (plan.unclassified.length) process.exit(65);
    ' || { echo "Unclassified paths: classify them in deploy/environment.json" >&2; exit 65; }
    if PLAN="$plan" SERVICE="$service" bun -e 'process.exit(JSON.parse(process.env.PLAN).services.includes(process.env.SERVICE) ? 0 : 1)'; then
      services="$services $service"
    fi
    held=$(PLAN="$plan" bun -e 'console.log(Object.keys(JSON.parse(process.env.PLAN).holds).join(" "))')
    [ -z "$held" ] || holds="$held"
  done
  services=${services# }
  if [ -z "$services" ]; then
    echo "== nothing to deploy: no service artifact changes at $head"
    exit 0
  fi
  if [ -n "$holds" ] && [ "${SHENRON_ACCEPT_HOLDS:-0}" != 1 ]; then
    echo "== HOLD ($holds): apply them through the Aphrody Infra runbook, then rerun with SHENRON_ACCEPT_HOLDS=1" >&2
    exit 78
  fi
  echo "== release $head for: $services"
  [ "$mode" = auto ] || exit 0
  bash "$HERE/build-image.sh" "$head"
  SHENRON_SERVICES=$services bash "$HERE/ship-image.sh"
  exit 0
fi

if [ "$mode" != ship ]; then
  bash "$HERE/build-image.sh" "$@"
fi
if [ "$mode" != build ]; then
  # Ship exactly the revision the build worktree holds.
  bash "$HERE/ship-image.sh"
fi
