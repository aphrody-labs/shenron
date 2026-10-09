#!/usr/bin/env bash
# On the vps, after ~/shenron-docker-build.sh: ship the image to dbfr and activate it.
set -euo pipefail
SHA=$(git -C ~/shenron-docker rev-parse HEAD)
docker save "localhost/shenron:$SHA" | zstd -q -T0 -3 > /tmp/shenron-$SHA.tar.zst
for t in 1 2 3 4 5; do scp -q /tmp/shenron-$SHA.tar.zst dbfr:/tmp/ && break; sleep 10; done
rm -f /tmp/shenron-$SHA.tar.zst
ssh dbfr "zstd -q -d --rm /tmp/shenron-$SHA.tar.zst && bash ~/deploy-shenron-image.sh $SHA /tmp/shenron-$SHA.tar"
