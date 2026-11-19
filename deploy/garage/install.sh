#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Idempotent Garage installer, run as root on a node:
#   install.sh <version> <sha256> <url> [--rpc-secret-stdin]
# Installs the pinned binary (sha256 verified), the garage user, the directories, the root-only
# secrets (generated here, never printed) and the systemd unit. The node config is rendered by
# scripts/ops/garage-config.ts and written to /etc/garage/garage.toml before `systemctl enable --now garage`.
set -euo pipefail
version=$1 sha256=$2 url=${3//\{version\}/$1}
shift 3
unit_src=$(dirname "$(readlink -f "$0")")/garage.service

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/garage" "$url"
echo "$sha256  $tmp/garage" | sha256sum -c --quiet -
install -m 0755 "$tmp/garage" /usr/local/bin/garage

id garage >/dev/null 2>&1 || useradd --system --home-dir /var/lib/garage --shell /usr/sbin/nologin garage
install -d -o garage -g garage -m 0750 /var/lib/garage /var/lib/garage/meta /var/lib/garage/data
install -d -o root -g garage -m 0750 /etc/garage


umask 0077
if [[ ! -s /etc/garage/rpc_secret ]]; then
  if [[ ${1:-} == --rpc-secret-stdin ]]; then cat >/etc/garage/rpc_secret; else openssl rand -hex 32 >/etc/garage/rpc_secret; fi
fi
[[ -s /etc/garage/admin_token ]] || openssl rand -base64 32 >/etc/garage/admin_token
# Garage refuses secrets readable by group or others: owned by the service user, mode 0600.
chown garage:garage /etc/garage/rpc_secret /etc/garage/admin_token
chmod 0600 /etc/garage/rpc_secret /etc/garage/admin_token

install -m 0644 "$unit_src" /etc/systemd/system/garage.service
systemctl daemon-reload
/usr/local/bin/garage --version
