#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Run only through Infra SSH after transferring the exact reviewed artifacts.
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_dir="$HOME/.local/share/aphrody/cloudflare-cli/orchestration"
test -x "$HOME/.local/share/aphrody/cloudflare-cli/runtime/bun"
test -x "$HOME/.local/bin/wrangler"
umask 077
mkdir -p "$target_dir" "$HOME/.local/state/aphrody/cloudflare" "$HOME/.config/aphrody/cloudflare"
for file in cloudflare-ops.ts register-infra.ts s3-profile.ts s3-profile.ps1 s3-profile.sh transfer.ts inventory-delta.ts publish-catalog.ts manifest.example.json shenron-cloudflare-audit.service shenron-cloudflare-audit.timer shenron-cloudflared.service shenron-cloudflare-s3-renew.service shenron-cloudflare-s3-renew.timer; do
  install -m 600 "$source_dir/$file" "$target_dir/$file"
done
catalog_source="$source_dir/public-cdn-catalog.ts"
if [ ! -f "$catalog_source" ]; then
  catalog_source="$source_dir/../../../scripts/ops/public-cdn-catalog.ts"
fi
install -m 600 "$catalog_source" "$target_dir/public-cdn-catalog.ts"
mkdir -p "$HOME/.local/bin"
printf '%s\n' '#!/bin/sh' 'exec "$HOME/.local/share/aphrody/cloudflare-cli/runtime/bun" "$HOME/.local/share/aphrody/cloudflare-cli/orchestration/cloudflare-ops.ts" "$@"' > "$HOME/.local/bin/cloudflare-ops"
chmod 700 "$HOME/.local/bin/cloudflare-ops"
install -m 700 "$source_dir/s3-profile.sh" "$HOME/.local/bin/cloudflare-s3"
printf '%s\n' '#!/bin/sh' 'exec sudo -n /usr/bin/env BUN_DEBUG_QUIET_LOGS=1 /home/ubuntu/.local/share/aphrody/cloudflare-cli/runtime/bun /etc/aphrody/cloudflare/cli/transfer.ts "$@"' > "$HOME/.local/bin/cloudflare-transfer"
chmod 700 "$HOME/.local/bin/cloudflare-transfer"
if [ "${1:-}" = "--install-owner-s3" ]; then
  # Explicit Infra SSH owner phase; require the existing credential, never create one.
  sudo -n test -r /etc/aphrody/cloudflare/api-token
  sudo -n mkdir -p /etc/aphrody/cloudflare/cli
  sudo -n install -o root -g root -m 600 "$target_dir/s3-profile.ts" "$target_dir/cloudflare-ops.ts" "$target_dir/transfer.ts" "$target_dir/inventory-delta.ts" "$target_dir/publish-catalog.ts" "$target_dir/public-cdn-catalog.ts" /etc/aphrody/cloudflare/cli/
  sudo -n install -o root -g root -m 644 "$target_dir/shenron-cloudflare-s3-renew.service" "$target_dir/shenron-cloudflare-s3-renew.timer" /etc/systemd/system/
  sudo -n systemd-analyze verify /etc/systemd/system/shenron-cloudflare-s3-renew.service /etc/systemd/system/shenron-cloudflare-s3-renew.timer
  sudo -n systemctl daemon-reload
fi
"$HOME/.local/bin/cloudflare-ops" --help
# No credentials, real manifest or DNS are changed; activation remains with Infra.

