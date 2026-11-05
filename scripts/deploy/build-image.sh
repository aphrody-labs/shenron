#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build and verify the Shenron container image of one revision, on any Linux x64 host with
# Git, Bun, Rust (rustup) and Docker or Podman.
#
#   scripts/deploy/build-image.sh [revision]        (default: origin/main)
#
# Environment (all optional):
#   SHENRON_SOURCE_REPO   Git checkout to build from (default: this repository)
#   SHENRON_BUILD_REPO    reusable build worktree (default: $HOME/build/shenron); it keeps
#                         target/, node_modules and the Turbopack cache between builds
#   SHENRON_BUILD_LOCK    flock file serializing builds of one worktree (default: <worktree>.lock)
#   SHENRON_VFS_SOURCE    public VFS: local file, http(s) URL or scp `host:path`
#                         (default: dist/vfs/shenron-vfs.public.sqlite already in the worktree)
#   SHENRON_CONTAINER     docker | podman (default: whichever is installed, docker first)
#   SHENRON_IMAGE         image name (default: localhost/shenron)
#   SHENRON_COMPILE_BUN   Bun used to compile the release binaries, must be >= 1.4.6 (default: bun-1.4.6, else bun on PATH)
#   SHENRON_WBG_DIR       directory of the wasm-bindgen CLI pinned by Cargo.lock (default: $HOME/build/tools/wbg-<version>/bin)
#   SHENRON_CARGO_JOBS    Cargo jobs (default: all CPUs)
#   SHENRON_SITE_BUILD_CPUS, SHENRON_SITE_BUILD_MIN_GIB, SHENRON_PAYLOAD_ZSTD_LEVEL,
#   SHENRON_NEXT_BUILD_CACHE (1), SHENRON_KEEP_IMAGES (3)
#   SHENRON_FORCE_SITE / SHENRON_FORCE_BOT / SHENRON_FORCE_RUST (0): rebuild a lane whose inputs
#                         are unchanged (stamps in <worktree>/.cache/shenron-build-stamps)
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE=${SHENRON_SOURCE_REPO:-$(git -C "$HERE" rev-parse --show-toplevel)}
W=${SHENRON_BUILD_REPO:-$HOME/build/shenron}
LOCK=${SHENRON_BUILD_LOCK:-$W.lock}
IMAGE=${SHENRON_IMAGE:-localhost/shenron}
ENGINE=${SHENRON_CONTAINER:-$(command -v docker >/dev/null 2>&1 && echo docker || echo podman)}
command -v "$ENGINE" >/dev/null 2>&1 || { echo "No container engine: install docker or podman" >&2; exit 1; }
if [ -z "${SHENRON_COMPILE_BUN:-}" ]; then
  if [ -x "$HOME/build/tools/bun-1.4.6/bin/bun" ]; then
    SHENRON_COMPILE_BUN="$HOME/build/tools/bun-1.4.6/bin/bun"
  elif command -v bun-1.4.6 >/dev/null 2>&1; then
    SHENRON_COMPILE_BUN="$(command -v bun-1.4.6)"
  else
    SHENRON_COMPILE_BUN="$(command -v bun)"
  fi
fi
export SHENRON_COMPILE_BUN
case "$("$SHENRON_COMPILE_BUN" --version)" in
  *debug*) echo "Refusing a debug runtime for production compilation" >&2; exit 1 ;;
esac
# A server compiled with Bun older than 1.4.6 starts but cannot launch the Next standalone.
MIN_COMPILE_BUN=1.4.6
COMPILE_BUN_VERSION=$("$SHENRON_COMPILE_BUN" --version)
if [ "$(printf '%s
%s
' "$MIN_COMPILE_BUN" "${COMPILE_BUN_VERSION%%-*}" | sort -V | head -n1)" != "$MIN_COMPILE_BUN" ]; then
  echo "Refusing Bun $COMPILE_BUN_VERSION to compile: need >= $MIN_COMPILE_BUN (set SHENRON_COMPILE_BUN)" >&2
  exit 1
fi
bun() { "$SHENRON_COMPILE_BUN" "$@"; }

mkdir -p "$(dirname "$W")" "$(dirname "$LOCK")"
exec 9>"$LOCK"
flock -n 9 || { echo "== waiting for $LOCK"; flock 9; }

git -C "$SOURCE" fetch -q origin
REVISION=$(git -C "$SOURCE" rev-parse --verify "${1:-${SHENRON_BUILD_REVISION:-origin/main}}^{commit}")
git -C "$SOURCE" worktree prune
if [ -e "$W/.git" ]; then
  git -C "$W" checkout -q -f --detach "$REVISION"
  git -C "$W" clean -ffdq -e target -e node_modules -e '.next*' -e .cache -e dist/vfs
else
  git -C "$SOURCE" worktree add -f --detach "$W" "$REVISION"
fi
# No submodule is required (vendored trees come from npm); a revision that still declares some is
# hydrated so older commits keep building.
if [ -f "$W/.gitmodules" ]; then git -C "$W" submodule update --init --recursive --force; fi
cd "$W"
SHA=$(git rev-parse HEAD)

# wasm-bindgen-cli must match the wasm-bindgen crate of Cargo.lock. The pinned CLI goes before
# ~/.cargo/bin in PATH (SHENRON_WBG_DIR, default $HOME/build/tools/wbg-<version>/bin).
WBG_VERSION=$(awk '/^name = "wasm-bindgen"$/ {getline; gsub(/[^0-9.]/, "", $0); print; exit}' Cargo.lock)
WBG_DIR=${SHENRON_WBG_DIR:-$HOME/build/tools/wbg-$WBG_VERSION/bin}
if [ -n "$WBG_VERSION" ]; then
  [ -x "$WBG_DIR/wasm-bindgen" ] && export PATH="$WBG_DIR:$PATH"
  case "$(wasm-bindgen --version 2>/dev/null)" in
    "wasm-bindgen $WBG_VERSION") ;;
    *) echo "wasm-bindgen $WBG_VERSION required (Cargo.lock), found: $(wasm-bindgen --version 2>&1); install it in $WBG_DIR" >&2; exit 1 ;;
  esac
fi
STARTED=$SECONDS
phase() { echo "== $1 (+$((SECONDS - STARTED))s)"; }
echo "== commit $SHA"

# One environment for every path (deploy/environment.json): cache locations, sccache, artifact
# store. A toolchain that differs from the pins is reported; SHENRON_STRICT_TOOLCHAIN=1 refuses it.
eval "$(bun scripts/deploy/environment.ts --emit shell)"
if command -v sccache >/dev/null 2>&1; then export RUSTC_WRAPPER=${RUSTC_WRAPPER:-sccache}; fi
if ! bun scripts/deploy/environment.ts --verify-host; then
  [ "${SHENRON_STRICT_TOOLCHAIN:-0}" != 1 ] || exit 1
  echo "== warning: toolchain differs from deploy/environment.json (artifact keys record the real one)"
fi

phase "bun install"
bun install --frozen-lockfile

# Incremental, content-addressed lanes (scripts/deploy/lanes.ts, lanes of deploy/environment.json).
# A lane key hashes the Git listing of the lane's inputs (tests excluded), the real compiler
# identity and its upstream keys. A lane is reused when the worktree already holds its outputs
# for that key, restored from the artifact store when any earlier build produced that key (a
# revert or a rebuilt branch costs a copy), and built otherwise. SHENRON_FORCE_<LANE>=1 rebuilds.
STAMPS=.cache/shenron-build-stamps
mkdir -p "$STAMPS"
LANES=scripts/deploy/lanes.ts
STORE=scripts/deploy/artifacts.ts
# Shipped Rust is built with --profile production (fat LTO, one codegen unit, stripped); the fast
# lane for quick iterations is SHENRON_CARGO_PROFILE=release. Cargo writes a profile to
# target/<profile> ("dev" excepted, which nothing here uses).
CARGO_PROFILE=${SHENRON_CARGO_PROFILE:-production}
EXTRAS=(--extra "rustc=$(rustc -V) $CARGO_PROFILE" --extra "bun=$(bun --revision)")
eval "$(bun "$LANES" keys --rev HEAD --format shell "${EXTRAS[@]}")"

lane_outputs() { # lane: its outputs, one per line
  LANE=$1 bun -e 'const e = await Bun.file("deploy/environment.json").json(); console.log(e.lanes[process.env.LANE].outputs.join("\n"))'
}
lane_ready() { # lane key: 0 when the outputs of that key are in the worktree
  local lane=$1 key=$2 force output missing=0
  force=SHENRON_FORCE_${lane^^}
  [ "${!force:-0}" != 1 ] || return 1
  while read -r output; do [ -e "$output" ] || missing=1; done < <(lane_outputs "$lane")
  if [ "$missing" = 0 ] && [ "$(cat "$STAMPS/$lane" 2>/dev/null)" = "$key" ]; then
    echo "== $lane: ${key:0:12} already in the worktree"
    return 0
  fi
  if bun "$STORE" has "$lane" "$key"; then
    bun "$STORE" get "$lane" "$key"
    echo "$key" > "$STAMPS/$lane"
    return 0
  fi
  rm -f "$STAMPS/$lane"
  return 1
}
lane_store() { # lane key
  local outputs
  mapfile -t outputs < <(lane_outputs "$1")
  bun "$STORE" put "$1" "$2" "${outputs[@]}"
  echo "$2" > "$STAMPS/$1"
}

fetch_vfs() {
  local out=dist/vfs/shenron-vfs.public.sqlite source=${SHENRON_VFS_SOURCE:-}
  mkdir -p dist/vfs
  case "$source" in
    "") ;;
    http://* | https://*) curl -fsSL --retry 3 -o "$out.part" "$source" && mv "$out.part" "$out" ;;
    *:*) scp -q "$source" "$out.part" && mv "$out.part" "$out" ;;
    *) cp "$source" "$out.part" && mv "$out.part" "$out" ;;
  esac
  test -s "$out" || { echo "No public VFS: set SHENRON_VFS_SOURCE" >&2; exit 1; }
}

build_wasm() {
  lane_ready wasm "$LANE_KEY_WASM" && return
  bun packages/koharu/scripts/build-wasm.ts &
  local canvas=$!
  bun packages/pipeline/scripts/build-re-wasm.ts &
  local re=$!
  if bun wasm --help >/dev/null 2>&1; then
    bun packages/engine/scripts/build-wasm.ts
  else
    # Only the Aphrody Bun fork has `bun wasm`: otherwise the module tracked in Git is used.
    test -s packages/engine/src/wasm/shenron_engine_bg.wasm || { echo "engine wasm missing" >&2; exit 1; }
  fi
  wait "$canvas"
  wait "$re"
  lane_store wasm "$LANE_KEY_WASM"
  phase "wasm done"
}

build_site() {
  build_wasm
  lane_ready site "$LANE_KEY_SITE" && return
  # The Next build only needs the installed workspace and the wasm modules, so it overlaps the
  # Rust, VFS and bot lanes. It peaks near 14 GiB RSS: start it only with enough headroom.
  local min_kib=$(( ${SHENRON_SITE_BUILD_MIN_GIB:-20} * 1024 * 1024 ))
  until [ "$(awk '/MemAvailable/ {print $2}' /proc/meminfo)" -ge "$min_kib" ]; do
    echo "== site waits for ${SHENRON_SITE_BUILD_MIN_GIB:-20} GiB available memory"
    sleep 15
  done
  SHENRON_NEXT_BUILD_CACHE=${SHENRON_NEXT_BUILD_CACHE:-1} \
    BUILD_CPUS=${SHENRON_SITE_BUILD_CPUS:-6} \
    bun scripts/build/server.ts --site-only --flavor production --target linux-x64
  lane_store site "$LANE_KEY_SITE"
  phase "site done"
}

build_rust() {
  lane_ready rust "$LANE_KEY_RUST" && return
  local jobs=${SHENRON_CARGO_JOBS:-$(nproc)}
  cargo build --profile "$CARGO_PROFILE" --locked -j "$jobs" -p shenron-mcp -p shenron-ffi
  cargo build --profile "$CARGO_PROFILE" --locked -j "$jobs" -p koharu-library --bin koharu-sdk
  lane_store rust "$LANE_KEY_RUST"
  sccache --show-stats 2>/dev/null | grep -E 'Cache (hits|misses)' || true
  phase "cargo done"
}

build_bot() {
  lane_ready bot "$LANE_KEY_BOT" && return
  bun scripts/build/bot.ts --target linux-x64
  lane_store bot "$LANE_KEY_BOT"
  phase "bot done"
}

phase "parallel: cargo | wasm then site | vfs | bot"
pids=()
build_rust & pids+=($!)
build_site & pids+=($!)
fetch_vfs & pids+=($!)
build_bot & pids+=($!)
status=0
for pid in "${pids[@]}"; do wait "$pid" || status=$?; done
((status == 0)) || { echo "A parallel build lane failed (exit $status)" >&2; exit "$status"; }

# The server package and the image also depend on the public VFS.
VFS_ID=$(sha256sum dist/vfs/shenron-vfs.public.sqlite | cut -d' ' -f1)
eval "$(bun "$LANES" keys --rev HEAD --format shell "${EXTRAS[@]}" --extra "vfs=$VFS_ID")"

if ! lane_ready server "$LANE_KEY_SERVER"; then
  phase "server package"
  SHENRON_PAYLOAD_ZSTD_LEVEL=${SHENRON_PAYLOAD_ZSTD_LEVEL:-6} \
    bun scripts/build/server.ts --skip-site --flavor production --target linux-x64
  install -D -m 0755 target/$CARGO_PROFILE/shenron-mcp dist/mcp/linux-x64/shenron-mcp
  install -D -m 0755 target/$CARGO_PROFILE/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
  install -D -m 0755 target/$CARGO_PROFILE/koharu-sdk dist/server/linux-x64/native/koharu-sdk
  lane_store server "$LANE_KEY_SERVER"
fi

# Stable layers first, per-release binaries last (deploy/docker/Dockerfile): with unchanged lanes
# every COPY layer is a cache hit, and a registry or delta ship only moves the changed tail.
phase "image"
"$ENGINE" build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" \
  --label "dev.shenron.image-key=$LANE_KEY_IMAGE" -t "$IMAGE:$SHA" -t "$IMAGE:local" .
timeout 60 "$ENGINE" run --rm --network none "$IMAGE:$SHA" version
timeout 60 "$ENGINE" run --rm --network none --entrypoint /usr/local/bin/shenron-bot "$IMAGE:$SHA" --smoke
timeout 60 "$ENGINE" run --rm --network none --entrypoint /usr/local/bin/koharu-sdk "$IMAGE:$SHA" --help >/dev/null
# Keep the current image plus the newest previous revisions; never touch volumes.
"$ENGINE" image ls --format '{{.Repository}}:{{.Tag}}' "$IMAGE" \
  | grep -v -F -e "$IMAGE:$SHA" -e "$IMAGE:local" \
  | sed -n "$(( ${SHENRON_KEEP_IMAGES:-3} + 1 )),\$p" \
  | xargs -r -n1 "$ENGINE" image rm >/dev/null 2>&1 || true
bun "$STORE" prune --keep "${SHENRON_ARTIFACT_KEEP:-8}" >/dev/null
phase "image verified"
echo "{\"commit\":\"$SHA\",\"image\":\"$("$ENGINE" image inspect -f '{{.Id}}' "$IMAGE:$SHA")\",\"imageKey\":\"$LANE_KEY_IMAGE\"}"
