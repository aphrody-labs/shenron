#!/usr/bin/env bash
# Shenron Docker image build on the vps: clean worktree at origin/main, sealed dist/, image.
set -euo pipefail
export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
W=$HOME/shenron-docker
git -C "$HOME/shenron" fetch -q origin
if [ -d "$W/.git" ] || [ -f "$W/.git" ]; then git -C "$W" checkout -q -f --detach origin/main; git -C "$W" clean -fdq -e target -e node_modules;
else git -C "$HOME/shenron" worktree add -f --detach "$W" origin/main; fi
cd "$W"; SHA=$(git rev-parse HEAD); echo "== commit $SHA"
echo "== bun install"; bun install --frozen-lockfile
echo "== cargo"; flock /srv/aphrody-build/locks/heavy.lock bash -c 'nice -n 5 cargo build --release -p shenron-mcp && nice -n 5 cargo build --release -p shenron-ffi --lib'
echo "== wasm"; bun packages/koharu/scripts/build-wasm.ts; bun packages/pipeline/scripts/build-re-wasm.ts
echo "== vfs"; mkdir -p dist/vfs; scp -q dbfr:/srv/shenron/shared/server/data/7b26187/shenron-vfs.public.sqlite dist/vfs/shenron-vfs.public.sqlite
echo "== bot"; bun scripts/build/bot.ts --target linux-x64
echo "== server"; bun scripts/build/server.ts --flavor production --target linux-x64
install -D -m 0755 target/release/shenron-mcp dist/mcp/linux-x64/shenron-mcp
install -D -m 0755 target/release/libshenron_ffi.so dist/server/linux-x64/native/libshenron_ffi.so
echo "== image"; docker build -q -f deploy/docker/Dockerfile --build-arg SHENRON_REVISION="$SHA" -t "localhost/shenron:$SHA" -t localhost/shenron:local .
docker run --rm "localhost/shenron:$SHA" version
docker run --rm --entrypoint /usr/local/bin/shenron-bot "localhost/shenron:$SHA" --smoke
echo "{\"commit\":\"$SHA\",\"image\":\"$(docker image inspect -f '{{.Id}}' localhost/shenron:$SHA)\"}"
