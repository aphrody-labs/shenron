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
#   SHENRON_COMPILE_BUN   Bun used to compile the release binaries (default: bun on PATH)
#   SHENRON_CARGO_JOBS    Cargo jobs (default: all CPUs)
#   SHENRON_SITE_BUILD_CPUS, SHENRON_SITE_BUILD_MIN_GIB, SHENRON_PAYLOAD_ZSTD_LEVEL,
#   SHENRON_NEXT_BUILD_CACHE (1), SHENRON_FORCE_RUST (0), SHENRON_KEEP_IMAGES (3)
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE=${SHENRON_SOURCE_REPO:-$(git -C "$HERE" rev-parse --show-toplevel)}
W=${SHENRON_BUILD_REPO:-$HOME/build/shenron}
LOCK=${SHENRON_BUILD_LOCK:-$W.lock}
IMAGE=${SHENRON_IMAGE:-localhost/shenron}
ENGINE=${SHENRON_CONTAINER:-$(command -v docker >/dev/null 2>&1 && echo docker || echo podman)}
command -v "$ENGINE" >/dev/null 2>&1 || { echo "No container engine: install docker or podman" >&2; exit 1; }
export SHENRON_COMPILE_BUN=${SHENRON_COMPILE_BUN:-$(command -v bun)}
case "$("$SHENRON_COMPILE_BUN" --version)" in
  *debug*) echo "Refusing a debug runtime for production compilation" >&2; exit 1 ;;
esac
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
git -C "$W" submodule update --init --recursive --force
cd "$W"
SHA=$(git rev-parse HEAD)
STARTED=$SECONDS
phase() { echo "== $1 (+$((SECONDS - STARTED))s)"; }
echo "== commit $SHA"

phase "bun install"
bun install --frozen-lockfile

# Rust lane: skipped when every Rust input (workspace, toolchain, crates and the data files they
# embed with include_str!) matches the stamp of the binaries already in target/release.
RUST_OUTPUTS=(target/release/shenron-mcp target/release/libshenron_ffi.so target/release/koharu-sdk)
RUST_STAMP=target/release/.shenron-rust-inputs
RUST_KEY=$({
  git ls-tree HEAD -- Cargo.toml Cargo.lock .cargo rust-toolchain.toml crates data/lexique-db-canonique.json data/lexicon
  rustc -V
} | sha256sum | cut -d' ' -f1)
rust_fresh() {
  [ "$(cat "$RUST_STAMP" 2>/dev/null)" = "$RUST_KEY" ] || return 1
  local output
  for output in "${RUST_OUTPUTS[@]}"; do [ -s "$output" ] || return 1; done
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

build_site() {
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
  phase "wasm done"
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
  phase "site done"
}

build_rust() {
  if [ "${SHENRON_FORCE_RUST:-0}" != 1 ] && rust_fresh; then
    echo "== cargo: Rust inputs unchanged, reusing target/release"
    return
  fi
  rm -f "$RUST_STAMP"
  local jobs=${SHENRON_CARGO_JOBS:-$(nproc)}
  cargo build --release --locked -j "$jobs" -p shenron-mcp -p shenron-ffi
  cargo build --release --locked -j "$jobs" -p koharu-library --bin koharu-sdk
  printf '%s\n' "$RUST_KEY" > "$RUST_STAMP"
  phase "cargo done"
}

phase "parallel: cargo | wasm then site | vfs | bot"
pids=()
build_rust & pids+=($!)
build_site & pids+=($!)
fetch_vfs & pids+=($!)
{ bun scripts/build/bot.ts --target linux-x64 && phase "bot done"; } & pids+=($!)
status=0
for pid in "${pids[@]}"; do wait "$pid" || status=$?; done
((status == 0)) || { echo "A parallel build lane failed (exit $status)" >&2; exit "$status"; }

phase "server package"
SHENRON_PAYLOAD_ZSTD_LEVEL=${SHENRON_PAYLOAD_ZSTD_LEVEL:-6} \
  bun scripts/build/server.ts --skip-site --flavor production --target linux-x64
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
install -D -m 0755 target/release/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
install -D -m 0755 target/release/koharu-sdk dist/server/linux-x64/native/koharu-sdk

phase "image"
"$ENGINE" build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" \
  -t "$IMAGE:$SHA" -t "$IMAGE:local" .
timeout 60 "$ENGINE" run --rm "$IMAGE:$SHA" version
timeout 60 "$ENGINE" run --rm --entrypoint /usr/local/bin/shenron-bot "$IMAGE:$SHA" --smoke
timeout 60 "$ENGINE" run --rm --entrypoint /usr/local/bin/koharu-sdk "$IMAGE:$SHA" --help >/dev/null
# Keep the current image plus the newest previous revisions; never touch volumes.
"$ENGINE" image ls --format '{{.Repository}}:{{.Tag}}' "$IMAGE" \
  | grep -v -F -e "$IMAGE:$SHA" -e "$IMAGE:local" \
  | sed -n "$(( ${SHENRON_KEEP_IMAGES:-3} + 1 )),\$p" \
  | xargs -r -n1 "$ENGINE" image rm >/dev/null 2>&1 || true
phase "image verified"
echo "{\"commit\":\"$SHA\",\"image\":\"$("$ENGINE" image inspect -f '{{.Id}}' "$IMAGE:$SHA")\"}"
