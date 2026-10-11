#!/usr/bin/env bash
# Usage: deploy-shenron-image.sh SHA IMAGE_TAR  (on dbfr)
set -euo pipefail
SHA=$1; TAR=$2
sudo -n docker load -i "$TAR" | tail -1
IMG=$(sudo -n docker image inspect -f '{{.Id}}' "localhost/shenron:$SHA")
rm -f "$TAR"
R=/srv/shenron/releases/docker-$SHA
sudo -n python3 ~/assemble-shenron.py "$SHA" "$IMG"
M=$(python3 - <<'PY'
import json;m=json.load(open("/srv/shenron/current/release.json"));i=m["images"]
a=["--public-vfs",m["publicVfs"]["path"],"--gateway-image-id",i["gateway"]["id"],"--gateway-commit",i["gateway"]["commit"]]
for r in ("postgres","redis","chat"):
    if r in i: a+=["--service-image",r,i[r]["id"],i[r]["commit"]]
print(" ".join(a))
PY
)
sudo -n python3 ~/seal-shenron-docker-release.py "$R" --commit "$SHA" --image-id "$IMG" $M
sudo -n /usr/local/sbin/aphrody-infra-deploy-shenron verify "$R"
sudo -n /usr/local/sbin/aphrody-infra-deploy-shenron activate "$R" 2>&1 | tail -15
echo "== DEPLOYED $SHA $IMG"
