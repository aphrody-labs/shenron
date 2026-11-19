#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Idempotent Garage installer, run as root on a node:
#   [GARAGE_DATA_DIR=...] [GARAGE_META_DIR=...] install.sh <version> <sha256> <url> [--rpc-secret-stdin] [--low-priority]
# Installs the pinned binary (sha256 verified), the garage user, the directories, the root-only
# secrets (generated here, never printed) and the systemd unit. The node config is rendered by
# scripts/ops/garage-config.ts and written to /etc/garage/garage.toml before `systemctl enable --now garage`.
set -euo pipefail
version=$1 sha256=$2 url=${3//\{version\}/$1}
shift 3
rpc_stdin=0 low_priority=0
for arg in "$@"; do
  case $arg in
    --rpc-secret-stdin) rpc_stdin=1 ;;
    --low-priority) low_priority=1 ;;
  esac
done
unit_src=$(dirname "$(readlink -f "$0")")/garage.service

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/garage" "$url"
echo "$sha256  $tmp/garage" | sha256sum -c --quiet -
install -m 0755 "$tmp/garage" /usr/local/bin/garage

id garage >/dev/null 2>&1 || useradd --system --home-dir /var/lib/garage --shell /usr/sbin/nologin garage
data_dir=${GARAGE_DATA_DIR:-/var/lib/garage/data}
meta_dir=${GARAGE_META_DIR:-/var/lib/garage/meta}
install -d -o garage -g garage -m 0750 /var/lib/garage "$(dirname "$data_dir")" "$data_dir" "$meta_dir"
# LMDB on a copy-on-write filesystem: no copy-on-write for the metadata directory (new files only).
if [[ $(stat -f -c %T "$meta_dir") == btrfs ]]; then chattr +C "$meta_dir"; fi
install -d -o root -g garage -m 0750 /etc/garage


umask 0077
if [[ ! -s /etc/garage/rpc_secret ]]; then
  if [[ $rpc_stdin == 1 ]]; then cat >/etc/garage/rpc_secret; else openssl rand -hex 32 >/etc/garage/rpc_secret; fi
fi
[[ -s /etc/garage/admin_token ]] || openssl rand -base64 32 >/etc/garage/admin_token
# Garage refuses secrets readable by group or others: owned by the service user, mode 0600.
chown garage:garage /etc/garage/rpc_secret /etc/garage/admin_token
chmod 0600 /etc/garage/rpc_secret /etc/garage/admin_token

install -m 0644 "$unit_src" /etc/systemd/system/garage.service
if [[ $low_priority == 1 ]]; then
  install -d /etc/systemd/system/garage.service.d
  install -m 0644 "$(dirname "$unit_src")/garage-lowprio.conf" /etc/systemd/system/garage.service.d/lowprio.conf
fi
systemctl daemon-reload
/usr/local/bin/garage --version
