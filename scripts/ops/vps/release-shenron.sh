#!/usr/bin/env bash
# Pin, build, qualify and ship one Shenron Docker revision through Aphrody Infra.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
SOURCE=${SHENRON_SOURCE_REPO:-$HOME/src/shenron}
BUILD_REPO=${SHENRON_BUILD_REPO:-$HOME/build/transient/shenron-docker}
MODE=all
REVISION=${SHENRON_BUILD_REVISION:-}

usage() {
  cat <<'EOF'
Usage: release-shenron.sh [--revision <git-revision>] [--build-only | --ship-only]

Builds and verifies an immutable Shenron image, then ships that exact revision to DBFR.
The default mode uses the canonical VPS factory lease and serialized Cargo wrapper.
Set SHENRON_SOURCE_REPO, SHENRON_BUILD_REPO, SHENRON_BUILD_LOCK, and
APHRODY_CARGO_JOBS to select the source, isolated worktree, lock, and bounded Cargo fan-out.
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
  REVISION=${REVISION:-$(git -C "$SOURCE" rev-parse --verify 'origin/main^{commit}')}
  git -C "$SOURCE" rev-parse --verify "${REVISION}^{commit}" >/dev/null
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
bash "$SCRIPT_DIR/ship-shenron.sh"
