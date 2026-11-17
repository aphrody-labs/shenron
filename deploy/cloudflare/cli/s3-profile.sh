#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
set -eu
exec sudo -n /usr/bin/env CLOUDFLARE_API_TOKEN_FILE=/etc/shenron/cloudflare/api-token BUN_DEBUG_QUIET_LOGS=1 /usr/local/bin/bun /etc/shenron/cloudflare/cli/s3-profile.ts "$@" --manifest "$HOME/.config/aphrody/cloudflare/manifest.json" --profile /etc/shenron/cloudflare/shenron-s3.json
