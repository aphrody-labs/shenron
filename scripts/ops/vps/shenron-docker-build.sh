#!/usr/bin/env bash
# Shenron Docker image build on the vps: one reusable worktree, sealed dist/, bounded image retention.
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
SOURCE=${SHENRON_SOURCE_REPO:-$HOME/src/shenron}
W=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
LOCK=${SHENRON_BUILD_LOCK:-$HOME/build/locks/heavy.lock}
# A compiled production binary must embed a self-contained release runtime.
export SHENRON_COMPILE_BUN=${SHENRON_COMPILE_BUN:-$(command -v bun)}
COMPILE_BUN_VERSION=$("$SHENRON_COMPILE_BUN" --version)
case "$COMPILE_BUN_VERSION" in
  *debug*) echo "Refusing a debug runtime for production compilation" >&2; exit 1 ;;
esac
bun() { "$SHENRON_COMPILE_BUN" "$@"; }
mkdir -p "$(dirname "$W")" "$(dirname "$LOCK")"
exec 9>"$LOCK"
flock -n 9 || { echo "shenron build already running" >&2; exit 75; }
cleanup() {
  git -C "$SOURCE" worktree prune >/dev/null 2>&1 || true
}
trap cleanup EXIT
git -C "$SOURCE" fetch -q origin
git -C "$SOURCE" worktree prune
if [ -d "$W/.git" ] || [ -f "$W/.git" ]; then
  git -C "$W" checkout -q -f --detach origin/main
  git -C "$W" clean -ffdq -e target -e node_modules -e '.next*' -e .cache -e .turbo
else
  git -C "$SOURCE" worktree add -f --detach "$W" origin/main
fi
git -C "$W" submodule update --init --recursive --force
cd "$W"; SHA=$(git rev-parse HEAD); echo "== commit $SHA"
echo "== bun install"; bun install --frozen-lockfile
echo "== parallel: cargo | wasm | vfs | bot"
pids=()
( nice -n 5 cargo build --release -p shenron-mcp -p shenron-ffi ) & pids+=($!)
( bun packages/koharu/scripts/build-wasm.ts & bun packages/pipeline/scripts/build-re-wasm.ts & wait -n; wait ) & pids+=($!)
( mkdir -p dist/vfs; scp -q dbfr:/home/ubuntu/apps/shenron/shared/server/data/7b26187/shenron-vfs.public.sqlite dist/vfs/shenron-vfs.public.sqlite ) & pids+=($!)
( bun scripts/build/bot.ts --target linux-x64 ) & pids+=($!)
for p in "${pids[@]}"; do wait "$p"; done
echo "== server"; bun scripts/build/server.ts --flavor production --target linux-x64
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
install -D -m 0755 target/release/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
echo "== image"; docker build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" -t "localhost/shenron:$SHA" -t localhost/shenron:local .
timeout 60 docker run --rm "localhost/shenron:$SHA" version
timeout 60 docker run --rm --entrypoint /usr/local/bin/shenron-bot "localhost/shenron:$SHA" --smoke
# Keep the current image plus the three newest previous revisions; never touch volumes.
docker image ls --format '{{.Repository}}:{{.Tag}}' 'localhost/shenron:*' \
  | grep -v -F -e "localhost/shenron:$SHA" -e 'localhost/shenron:local' \
  | sed -n '4,$p' \
  | xargs -r -n1 docker image rm >/dev/null 2>&1 || true
echo "{\"commit\":\"$SHA\",\"image\":\"$(docker image inspect -f '{{.Id}}' localhost/shenron:$SHA)\"}"
