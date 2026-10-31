#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Reproduction of the pre-2026-10-30 factory sequencing, for A/B timing against build-image.sh on
# the very same worktree, commit and warm caches: Cargo, WASM, VFS and bot in parallel, then the
# Next build alone with no build cache, zstd 12, no lane skipping, then the image.
#
#   scripts/deploy/bench-old-pipeline.sh            (builds the revision checked out in $SHENRON_BUILD_REPO)
#
# Not a release path: it only exists to keep the speed claim reproducible.
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
W=${SHENRON_BUILD_REPO:-$HOME/build/shenron}
IMAGE=${SHENRON_IMAGE:-localhost/shenron}
ENGINE=${SHENRON_CONTAINER:-$(command -v docker >/dev/null 2>&1 && echo docker || echo podman)}
cd "$W"
SHA=$(git rev-parse HEAD)
STARTED=$SECONDS
phase() { echo "== $1 (+$((SECONDS - STARTED))s)"; }
phase "bun install"
bun install --frozen-lockfile
phase "parallel: cargo | wasm | vfs | bot"
pids=()
(
  cargo build --release --locked -j "$(nproc)" -p shenron-mcp -p shenron-ffi
  cargo build --release --locked -j "$(nproc)" -p koharu-library --bin koharu-sdk
) & pids+=($!)
(
  bun packages/koharu/scripts/build-wasm.ts & canvas=$!
  bun packages/pipeline/scripts/build-re-wasm.ts & re=$!
  wait "$canvas"
  wait "$re"
) & pids+=($!)
( mkdir -p dist/vfs; scp -q "${SHENRON_VFS_SOURCE:?}" dist/vfs/shenron-vfs.public.sqlite ) & pids+=($!)
( bun scripts/build/bot.ts --target linux-x64 ) & pids+=($!)
status=0
for pid in "${pids[@]}"; do wait "$pid" || status=$?; done
((status == 0)) || { echo "lane failed ($status)" >&2; exit "$status"; }
phase "server"
env -u SHENRON_NEXT_BUILD_CACHE BUILD_CPUS=6 SHENRON_PAYLOAD_ZSTD_LEVEL=12 \
  bun scripts/build/server.ts --flavor production --target linux-x64
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
install -D -m 0755 target/release/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
install -D -m 0755 target/release/koharu-sdk dist/server/linux-x64/native/koharu-sdk
phase "image"
"$ENGINE" build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" \
  -t "$IMAGE:$SHA" .
timeout 60 "$ENGINE" run --rm "$IMAGE:$SHA" version
timeout 60 "$ENGINE" run --rm --entrypoint /usr/local/bin/shenron-bot "$IMAGE:$SHA" --smoke
timeout 60 "$ENGINE" run --rm --entrypoint /usr/local/bin/koharu-sdk "$IMAGE:$SHA" --help >/dev/null
phase "image verified"
