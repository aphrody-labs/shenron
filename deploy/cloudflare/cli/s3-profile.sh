#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
exec sudo -n /usr/bin/env CLOUDFLARE_API_TOKEN_FILE=/etc/aphrody/cloudflare/api-token BUN_DEBUG_QUIET_LOGS=1 /home/ubuntu/.local/share/aphrody/cloudflare-cli/runtime/bun /etc/aphrody/cloudflare/cli/s3-profile.ts "$@" --manifest /home/ubuntu/.config/aphrody/cloudflare/manifest.json --profile /etc/aphrody/cloudflare/shenron-s3.json
