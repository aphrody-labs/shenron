#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Build, verify and ship one Shenron revision: build-image.sh then ship-image.sh.
#
#   scripts/deploy/release.sh [--build-only | --ship-only] [revision]
#
# Every setting is an environment variable of those two scripts (see their headers); run it
# on any Linux x64 builder, for any target (ssh:<host>, registry:<repository>, local).
set -euo pipefail
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mode=all
case "${1:-}" in
  --build-only) mode=build; shift ;;
  --ship-only) mode=ship; shift ;;
  -h | --help) sed -n '3,8p' "$0"; exit 0 ;;
esac
if [ "$mode" != ship ]; then
  bash "$HERE/build-image.sh" "$@"
fi
if [ "$mode" != build ]; then
  # Ship exactly the revision the build worktree holds.
  bash "$HERE/ship-image.sh"
fi
