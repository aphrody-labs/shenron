#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Print the revision production actually runs, read-only, for SHENRON_DEPLOY_TARGET.
#
#   scripts/deploy/active-release.sh [site|bot]      (default: site)
#
# Order: the image tag of the running container (what serves traffic), then the per-service tag,
# then SHENRON_IMAGE_TAG of /srv/shenron/.env. /srv/shenron/current is never used: it only names
# the static release directory of the gateway and lagged the image until 2026-11-03 (audit
# surface-2026-11-05 E2). SHENRON_ACTIVE_COMMAND replaces the probe; empty prints nothing.
# Prints nothing (exit 0) when no revision is found, e.g. on a first install.
set -euo pipefail
service=${1:-site}
case "$service" in site | bot) ;; *) echo "unknown service: $service" >&2; exit 64 ;; esac
TARGET=${SHENRON_DEPLOY_TARGET:-ssh:${SHENRON_DEPLOY_HOST:-prod}}
resolve_host() {
  case "$1" in
    vps) echo "${SHENRON_VPS_HOST:-vps}" ;;
    cdn | bunos) echo "${SHENRON_CDN_HOST:-cdn}" ;;
    prod) echo "${SHENRON_PROD_HOST:-prod}" ;;
    *) echo "$1" ;;
  esac
}
upper=$(printf '%s' "$service" | tr a-z A-Z)
probe="docker inspect -f '{{.Config.Image}}' shenron-$service 2>/dev/null | sed -n 's/.*://p'
sed -n 's/^SHENRON_${upper}_TAG=//p; s/^SHENRON_IMAGE_TAG=//p' /srv/shenron/.env 2>/dev/null"
command=${SHENRON_ACTIVE_COMMAND-$probe}
[ -n "$command" ] || exit 0
case "$TARGET" in
  ssh:*) output=$(ssh -o ConnectTimeout=15 -o BatchMode=yes "$(resolve_host "${TARGET#ssh:}")" "$command" || true) ;;
  *) output=$(bash -c "$command" || true) ;;
esac
printf '%s\n' "$output" | grep -oE '^[0-9a-f]{40}$' | head -1 || true
