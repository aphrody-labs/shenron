#!/usr/bin/env bash
# After shenron-docker-build.sh: ship the image to the configured Infra target and activate it.
set -euo pipefail
W=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
DEPLOY_HOST=${SHENRON_DEPLOY_HOST:-dbfr}
SHA=$(git -C "$W" rev-parse HEAD)
docker image inspect "localhost/shenron:$SHA" >/dev/null
# Never move production backwards by accident: two sessions may build different revisions at once.
# The active release must be an ancestor of the shipped commit; SHENRON_ALLOW_ROLLBACK=1 for a
# deliberate rollback.
ACTIVE=$(ssh -o ConnectTimeout=15 -o BatchMode=yes "$DEPLOY_HOST" 'basename "$(readlink -f /srv/shenron/current)"' | sed -n 's/^docker-\([0-9a-f]\{40\}\)$/\1/p')
if [ -n "$ACTIVE" ] && [ "${SHENRON_ALLOW_ROLLBACK:-0}" != 1 ]; then
  git -C "$W" fetch -q origin || true
  if ! git -C "$W" merge-base --is-ancestor "$ACTIVE" "$SHA"; then
    echo "Refusing to ship $SHA: the active release $ACTIVE is not one of its ancestors (SHENRON_ALLOW_ROLLBACK=1 to override)" >&2
    exit 3
  fi
fi
# Stream: save | zstd | ssh | decompress, no intermediate file.
timeout 3600 docker save "localhost/shenron:$SHA" | zstd -q -T0 -1   | ssh -o ConnectTimeout=15 -o BatchMode=yes "$DEPLOY_HOST" "zstd -q -d -o /tmp/shenron-$SHA.tar"
timeout 3600 ssh -o ConnectTimeout=15 -o BatchMode=yes "$DEPLOY_HOST" "bash ~/deploy-shenron-image.sh $SHA /tmp/shenron-$SHA.tar"
