#!/usr/bin/env bash
# After shenron-docker-build.sh: ship the image to the configured Infra target and activate it.
set -euo pipefail
W=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
DEPLOY_HOST=${SHENRON_DEPLOY_HOST:-dbfr}
SHA=$(git -C "$W" rev-parse HEAD)
docker image inspect "localhost/shenron:$SHA" >/dev/null
# Stream: save | zstd | ssh | decompress, no intermediate file.
timeout 3600 docker save "localhost/shenron:$SHA" | zstd -q -T0 -1   | ssh -o ConnectTimeout=15 -o BatchMode=yes "$DEPLOY_HOST" "zstd -q -d -o /tmp/shenron-$SHA.tar"
timeout 3600 ssh -o ConnectTimeout=15 -o BatchMode=yes "$DEPLOY_HOST" "bash ~/deploy-shenron-image.sh $SHA /tmp/shenron-$SHA.tar"
