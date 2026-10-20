#!/usr/bin/env bash
# Shenron Docker image build on the vps: one reusable worktree, sealed dist/, bounded image retention.
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
SOURCE=${SHENRON_SOURCE_REPO:-$HOME/src/shenron}
W=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
LOCK=${SHENRON_BUILD_LOCK:-$HOME/build/locks/heavy.lock}
APHRODY_SOURCE=${APHRODY_SOURCE_REPO:-$(dirname "$SOURCE")/aphrody}
FACTORY_CONFIG=${APHRODY_FACTORY_CONFIG:-$APHRODY_SOURCE/tools/config/build-factory.json}
CARGO_SERIAL=${APHRODY_CARGO_SERIAL:-$APHRODY_SOURCE/scripts/build/rust/cargo-serial.sh}
test -f "$CARGO_SERIAL" || { echo "Aphrody Cargo owner is unavailable" >&2; exit 1; }
test -f "$FACTORY_CONFIG" || { echo "Aphrody factory configuration is unavailable: $FACTORY_CONFIG" >&2; exit 1; }
export APHRODY_BUILD_HOST=${APHRODY_BUILD_HOST:-${SHENRON_BUILDER_ID:-vps}}
export APHRODY_FACTORY_LOCK_PATH="$LOCK"
# A compiled production binary must embed a self-contained release runtime.
export SHENRON_COMPILE_BUN=${SHENRON_COMPILE_BUN:-$(command -v bun)}
COMPILE_BUN_VERSION=$("$SHENRON_COMPILE_BUN" --version)
case "$COMPILE_BUN_VERSION" in
  *debug*) echo "Refusing a debug runtime for production compilation" >&2; exit 1 ;;
esac
bun() { "$SHENRON_COMPILE_BUN" "$@"; }
# The factory lease covers its declared transient root, not this build's child worktree.
export APHRODY_FACTORY_RESOURCE
APHRODY_FACTORY_RESOURCE=$(bun -e 'const config = await Bun.file(process.argv[1]).json(); if (!config.cleanup?.transientRoot) throw new Error("Factory transient resource is not configured"); console.log(config.cleanup.transientRoot);' "$FACTORY_CONFIG")
mkdir -p "$(dirname "$W")" "$(dirname "$LOCK")"
# Keep the flock owner alive in the process ancestry so Infra can verify the lease.
if ! bun "$APHRODY_SOURCE/packages/infra/workspace/src/build-factory-cleanup.ts" --held "$FACTORY_CONFIG"; then
  exec flock --exclusive --timeout "${SHENRON_BUILD_LOCK_TIMEOUT_SECS:-3600}" "$LOCK" bash "$0" "$@"
fi
cleanup() {
  git -C "$SOURCE" worktree prune >/dev/null 2>&1 || true
}
trap cleanup EXIT
git -C "$SOURCE" fetch -q origin
REVISION=$(git -C "$SOURCE" rev-parse --verify "${SHENRON_BUILD_REVISION:-origin/main}^{commit}")
git -C "$SOURCE" worktree prune
if [ -d "$W/.git" ] || [ -f "$W/.git" ]; then
  git -C "$W" checkout -q -f --detach "$REVISION"
  git -C "$W" clean -ffdq -e target -e node_modules -e '.next*' -e .cache -e .turbo
else
  git -C "$SOURCE" worktree add -f --detach "$W" "$REVISION"
fi
git -C "$W" submodule update --init --recursive --force
cd "$W"; SHA=$(git rev-parse HEAD); echo "== commit $SHA"
echo "== bun install"; bun install --frozen-lockfile
echo "== parallel: cargo | wasm | vfs | bot"
pids=()
( bash "$CARGO_SERIAL" build --release --locked -p shenron-mcp -p shenron-ffi && bash "$CARGO_SERIAL" build --release --locked -p koharu-library --bin koharu-sdk ) & pids+=($!)
(
  bun packages/koharu/scripts/build-wasm.ts & canvas_pid=$!
  bun packages/pipeline/scripts/build-re-wasm.ts & re_pid=$!
  status=0
  wait "$canvas_pid" || status=$?
  wait "$re_pid" || status=$?
  exit "$status"
) & pids+=($!)
( mkdir -p dist/vfs; scp -q dbfr:/home/ubuntu/apps/shenron/shared/server/data/7b26187/shenron-vfs.public.sqlite dist/vfs/shenron-vfs.public.sqlite ) & pids+=($!)
( bun scripts/build/bot.ts --target linux-x64 ) & pids+=($!)
build_status=0
for p in "${pids[@]}"; do wait "$p" || build_status=$?; done
if ((build_status != 0)); then
  echo "A parallel build lane failed (exit $build_status)" >&2
  exit "$build_status"
fi
echo "== server"; bun scripts/build/server.ts --flavor production --target linux-x64
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
install -D -m 0755 target/release/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
install -D -m 0755 target/release/koharu-sdk dist/server/linux-x64/native/koharu-sdk
echo "== image"; docker build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" -t "localhost/shenron:$SHA" -t localhost/shenron:local .
timeout 60 docker run --rm "localhost/shenron:$SHA" version
timeout 60 docker run --rm --entrypoint /usr/local/bin/shenron-bot "localhost/shenron:$SHA" --smoke
timeout 60 docker run --rm --entrypoint /usr/local/bin/koharu-sdk "localhost/shenron:$SHA" --help
# Keep the current image plus the three newest previous revisions; never touch volumes.
docker image ls --format '{{.Repository}}:{{.Tag}}' 'localhost/shenron:*' \
  | grep -v -F -e "localhost/shenron:$SHA" -e 'localhost/shenron:local' \
  | sed -n '4,$p' \
  | xargs -r -n1 docker image rm >/dev/null 2>&1 || true
echo "{\"commit\":\"$SHA\",\"image\":\"$(docker image inspect -f '{{.Id}}' localhost/shenron:$SHA)\"}"
