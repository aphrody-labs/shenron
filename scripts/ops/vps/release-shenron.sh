#!/usr/bin/env bash
# Pin, build, qualify and ship one Shenron Docker revision through Aphrody Infra.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE=${SHENRON_SOURCE_REPO:-$HOME/src/shenron}
BUILD_REPO=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
DEPLOY_HOST=${SHENRON_DEPLOY_HOST:-dbfr}
MODE=all
REVISION=${SHENRON_BUILD_REVISION:-}

usage() {
  cat <<'EOF'
Usage: release-shenron.sh [--revision <git-revision>] [--build-only | --ship-only]

Builds and verifies an immutable Shenron image, then ships that exact revision to DBFR.
Run this script on the Linux builder you choose. It defaults to the canonical VPS paths;
the operator selects any alternate builder and its factory identity explicitly. The chosen
builder must have the matching Bun/Rust/Docker/Aphrody toolchain and a valid factory lease.
Set SHENRON_SOURCE_REPO, SHENRON_BUILD_REPO, SHENRON_BUILD_LOCK, SHENRON_DEPLOY_HOST,
APHRODY_BUILD_HOST, and APHRODY_CARGO_JOBS to select source, worktree, lock, deploy target,
factory identity, and bounded Cargo fan-out. Use --build-only to qualify an image before
shipping, then --ship-only to resume from the pinned build worktree.
EOF
}

while (($#)); do
  case "$1" in
    --revision)
      (($# >= 2)) || { usage >&2; exit 64; }
      REVISION=$2
      shift 2
      ;;
    --build-only)
      [[ "$MODE" == all ]] || { usage >&2; exit 64; }
      MODE=build
      shift
      ;;
    --ship-only)
      [[ "$MODE" == all ]] || { usage >&2; exit 64; }
      MODE=ship
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 64
      ;;
  esac
done

if [[ "$MODE" != ship ]]; then
  git -C "$SOURCE" fetch -q origin
  REVISION=${REVISION:-origin/main}
fi
if [[ -n "$REVISION" ]]; then
  REVISION_REPO=$SOURCE
  [[ "$MODE" != ship ]] || REVISION_REPO=$BUILD_REPO
  REVISION=$(git -C "$REVISION_REPO" rev-parse --verify "${REVISION}^{commit}")
fi
if [[ "$MODE" != ship ]]; then
  export SHENRON_BUILD_REVISION=$REVISION
  # Aphrody's factory caps Cargo fan-out at the executing host's CPU count.
  export APHRODY_CARGO_JOBS=${APHRODY_CARGO_JOBS:-auto}
  echo "== pinned Shenron revision $REVISION"
  bash "$SCRIPT_DIR/shenron-docker-build.sh"
fi

ACTUAL_REVISION=$(git -C "$BUILD_REPO" rev-parse --verify HEAD)
if [[ -n "$REVISION" && "$ACTUAL_REVISION" != "$REVISION" ]]; then
  echo "Build worktree revision mismatch: expected $REVISION, found $ACTUAL_REVISION" >&2
  exit 1
fi

IMAGE="localhost/shenron:$ACTUAL_REVISION"
IMAGE_ID=$(docker image inspect -f '{{.Id}}' "$IMAGE")
echo "== qualified image $IMAGE ($IMAGE_ID)"
if [[ "$MODE" == build ]]; then
  exit 0
fi
SHENRON_DEPLOY_HOST="$DEPLOY_HOST" bash "$SCRIPT_DIR/ship-shenron.sh"
