#!/usr/bin/env bash
# Retries shenron-docker-build.sh while earlyoom interrupts the Next site step (exit 143),
# which happens when other factory jobs hold memory. Other failures stop at once.
#   shenron-build-retry.sh <log> [helper]
set -uo pipefail
log=${1:?log file}
helper=${2:-$(dirname "$0")/shenron-docker-build.sh}
for attempt in $(seq 1 "${SHENRON_BUILD_ATTEMPTS:-12}"); do
  echo "== attempt $attempt $(date -u +%FT%TZ)" >> "$log"
  bash "$helper" >> "$log" 2>&1; code=$?
  [ "$code" -eq 0 ] && { echo "EXIT_CODE=0" >> "$log"; exit 0; }
  tail -40 "$log" | grep -q "site-build-standalone failed" || { echo "EXIT_CODE=$code" >> "$log"; exit "$code"; }
  sleep "${SHENRON_BUILD_RETRY_SECONDS:-60}"
done
echo "EXIT_CODE=143" >> "$log"
exit 143
