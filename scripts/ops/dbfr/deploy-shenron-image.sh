#!/usr/bin/env bash
# Usage: deploy-shenron-image.sh SHA IMAGE_TAR  (on dbfr)
# SHENRON_ROOT: host root of the production layout (deploy/README.md), required.
set -euo pipefail
: "${SHENRON_ROOT:?set SHENRON_ROOT (see deploy/README.md)}"
export SHENRON_ROOT
SHA=$1; TAR=$2
sudo -n docker load -i "$TAR" | tail -1
IMG=$(sudo -n docker image inspect -f '{{.Id}}' "localhost/shenron:$SHA")
rm -f "$TAR"
R=$SHENRON_ROOT/releases/docker-$SHA
sudo -n env SHENRON_ROOT="$SHENRON_ROOT" python3 ~/assemble-shenron.py "$SHA" "$IMG"
M=$(python3 - <<'PY'
import json,os;m=json.load(open(os.environ["SHENRON_ROOT"]+"/current/release.json"));i=m["images"]
a=["--public-vfs",m["publicVfs"]["path"],"--gateway-image-id",i["gateway"]["id"],"--gateway-commit",i["gateway"]["commit"]]
for r in ("postgres","redis","chat"):
    if r in i: a+=["--service-image",r,i[r]["id"],i[r]["commit"]]
print(" ".join(a))
PY
)
sudo -n python3 ~/seal-shenron-docker-release.py "$R" --commit "$SHA" --image-id "$IMG" $M
sudo -n /usr/local/sbin/shenron-infra-deploy-shenron verify "$R"
sudo -n /usr/local/sbin/shenron-infra-deploy-shenron activate "$R" 2>&1 | tail -15
echo "== DEPLOYED $SHA $IMG"
