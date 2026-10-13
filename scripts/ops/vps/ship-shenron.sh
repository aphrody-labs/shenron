#!/usr/bin/env bash
# On the vps, after shenron-docker-build.sh: ship the image to dbfr and activate it.
set -euo pipefail
W=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
SHA=$(git -C "$W" rev-parse HEAD)
docker image inspect "localhost/shenron:$SHA" >/dev/null
timeout 3600 docker save "localhost/shenron:$SHA" | zstd -q -T0 -3 > /tmp/shenron-$SHA.tar.zst
timeout 3600 scp -q -o ConnectTimeout=15 -o BatchMode=yes /tmp/shenron-$SHA.tar.zst dbfr:/tmp/
rm -f /tmp/shenron-$SHA.tar.zst
timeout 3600 ssh -o ConnectTimeout=15 -o BatchMode=yes dbfr "zstd -q -d --rm /tmp/shenron-$SHA.tar.zst && bash ~/deploy-shenron-image.sh $SHA /tmp/shenron-$SHA.tar"
