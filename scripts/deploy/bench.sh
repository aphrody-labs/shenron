#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# A/B timing of the old and the new build sequencing on the same worktree, commits and caches.
#
#   scripts/deploy/bench.sh        (env as build-image.sh; results in $SHENRON_BENCH_LOG)
#
# Throw-away commits on top of the current revision, never pushed: C1 touches a site file; C2 and
# C3 (children of C1) each touch a Rust crate. Site change: new(C1) then old(C1). Crate change:
# old(C2) then new(C3), so each pipeline pays its own Rust compilation (a shared target/ would
# otherwise favour whichever runs second). The old run sets the Turbopack cache aside (the old
# pipeline never had one) and puts it back afterwards.
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
W=${SHENRON_BUILD_REPO:-$HOME/build/shenron}
LOG=${SHENRON_BENCH_LOG:-$HOME/bench.log}
export SHENRON_BUILD_REPO=$W
: > "$LOG"
BASE=$(git -C "$W" rev-parse HEAD)
git -C "$W" -c user.name=bench -c user.email=bench@localhost clean -ffdq -e target -e node_modules -e '.next*' -e .cache -e dist
touch_commit() { # file message
  echo "// bench $(date +%s)" >> "$W/$1"
  git -C "$W" -c user.name=bench -c user.email=bench@localhost commit -q -am "$2"
  git -C "$W" rev-parse HEAD
}
timed() { # label command...
  local label=$1 start=$SECONDS
  shift
  "$@" > "$LOG.$label" 2>&1 || { echo "$label FAILED" | tee -a "$LOG"; return 1; }
  echo "$label $((SECONDS - start))s (load $(cut -d' ' -f1 /proc/loadavg))" | tee -a "$LOG"
}
old() {
  local cache="$W/apps/site/.next-standalone/cache"
  git -C "$W" checkout -q -f --detach "$1"
  git -C "$W" clean -ffdq -e target -e node_modules -e '.next*' -e .cache -e dist
  [ ! -d "$cache" ] || mv "$cache" "$W/.bench-turbopack-cache"
  bash "$HERE/bench-old-pipeline.sh"
  [ ! -d "$W/.bench-turbopack-cache" ] || mv "$W/.bench-turbopack-cache" "$cache"
}
git -C "$W" checkout -q -f --detach "$BASE"
# Warm start: every lane stamped at BASE, so the measured runs only pay for what their commit changes.
timed warmup bash "$HERE/build-image.sh" "$BASE"
C1=$(touch_commit apps/site/src/proxy.ts "bench: site file")
C2=$(touch_commit crates/shenron-cli/src/shenron_cmd.rs "bench: rust crate A")
C3=$(touch_commit crates/shenron-cli/src/shenron_cmd.rs "bench: rust crate B")
echo "base=$BASE c1=$C1 c2=$C2 c3=$C3" | tee -a "$LOG"
timed new-site-change bash "$HERE/build-image.sh" "$C1"
timed old-site-change old "$C1"
timed old-crate-change old "$C2"
timed new-crate-change bash "$HERE/build-image.sh" "$C3"
git -C "$W" checkout -q -f --detach "$BASE"
for sha in "$C1" "$C2" "$C3"; do
  "${SHENRON_CONTAINER:-docker}" image rm "${SHENRON_IMAGE:-localhost/shenron}:$sha" >/dev/null 2>&1 || true
done
echo "done" | tee -a "$LOG"
