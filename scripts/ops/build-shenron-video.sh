#!/usr/bin/env bash
# Fabrique VPS : construit shenron-video (hors depot, worktree jetable) contre le checkout Bun OS local
# puis installe le binaire. Usage : build-shenron-video.sh [chemin-bun-os] ; code de sortie 0 = installe.
set -euo pipefail
BUNOS="${1:-$HOME/src/bun-os}"
SRC="$(cd "$(dirname "$0")/../../crates/shenron-video" && pwd)"
WORK="$HOME/build/transient/shenron-video"
rm -rf "$WORK"
mkdir -p "$WORK/src" "$HOME/.local/bin"
cp "$SRC"/src/*.rs "$WORK/src/"
sed -E "s#\{ git = \"[^\"]*\", rev = \"[^\"]*\" \}#{ path = \"$BUNOS/crates/NAME\" }#" "$SRC/Cargo.toml" \
  | awk '/^filmcraft-/{n=$1; sub("NAME",n)} {print}' > "$WORK/Cargo.toml"
trap 'rm -rf "$WORK"' EXIT
(cd "$WORK" && flock "$HOME/build/locks/heavy.lock" cargo test --release && cargo build --release)
install -m 0755 "$WORK/target/release/shenron-video" "$HOME/.local/bin/shenron-video"
echo "installed $HOME/.local/bin/shenron-video"
