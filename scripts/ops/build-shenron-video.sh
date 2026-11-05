#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Artifact build with plain cargo; the target cache is the caller's CARGO_TARGET_DIR.
set -euo pipefail
usage() {
  printf '%s\n' 'Usage: build-shenron-video.sh [--local-owner <Bun OS checkout>] [--out <new absolute artifact directory>]' \
    'Requires cargo on PATH and an absolute CARGO_TARGET_DIR.' \
    'Default: exact Git dependencies pinned in Cargo.toml. Local override is explicit and recorded.' \
    'Builds and qualifies an artifact; never activates or installs it globally.'
}
LOCAL_OWNER=''
OUT=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --local-owner|--out)
      [ "$#" -ge 2 ] || { usage >&2; exit 2; }
      if [ "$1" = '--local-owner' ]; then LOCAL_OWNER="$2"; else OUT="$2"; fi
      shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done
: "${CARGO_TARGET_DIR:?Set the Cargo target cache}"
command -v cargo >/dev/null || { printf '%s\n' 'cargo is not on PATH' >&2; exit 1; }
case "$CARGO_TARGET_DIR" in /*) ;; *) printf '%s\n' 'CARGO_TARGET_DIR must be absolute' >&2; exit 1 ;; esac
command -v bun >/dev/null
SRC="$(cd "$(dirname "$0")/../../crates/shenron-video" && pwd -P)"
SOURCE_REV="$(git -C "$SRC" rev-parse HEAD)"
TRANSIENT="$HOME/build/transient"
mkdir -p "$TRANSIENT"
TRANSIENT="$(cd "$TRANSIENT" && pwd -P)"
WORK="$(mktemp -d "$TRANSIENT/shenron-video.XXXXXXXX")"
cleanup() {
  case "$WORK" in "$TRANSIENT"/shenron-video.*) rm -rf -- "$WORK" ;; *) printf '%s\n' 'Refusing invalid temporary cleanup path' >&2 ;; esac
}
trap cleanup EXIT
if [ -z "$OUT" ]; then OUT="$HOME/build/artifacts/${WORK##*/}"; fi
case "$OUT" in /*) ;; *) printf '%s\n' '--out must be absolute' >&2; exit 1 ;; esac
[ ! -e "$OUT" ] || { printf '%s\n' 'Artifact directory already exists; refusing overwrite' >&2; exit 1; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd -P)"
cp -R "$SRC/src" "$WORK/src"
cp "$SRC/Cargo.toml" "$WORK/Cargo.toml"
# The copy is its own workspace root, so it carries the shipping profile of the repository root:
# fat LTO, one codegen unit, stripped, panic abort (a CLI with no threads and no panic catcher).
# SHENRON_VIDEO_PROFILE=release is the quick lane.
PROFILE="${SHENRON_VIDEO_PROFILE:-production}"
cat >> "$WORK/Cargo.toml" <<'TOML'

[profile.production]
inherits = "release"
lto = "fat"
codegen-units = 1
strip = "symbols"
panic = "abort"
TOML
if [ -f "$SRC/Cargo.lock" ]; then cp "$SRC/Cargo.lock" "$WORK/Cargo.lock"; fi
OWNER_REV=''
MODE='pinned-git'
if [ -n "$LOCAL_OWNER" ]; then
  LOCAL_OWNER="$(cd "$LOCAL_OWNER" && pwd -P)"
  OWNER_REV="$(git -C "$LOCAL_OWNER" rev-parse HEAD)"
  git -C "$LOCAL_OWNER" diff --quiet -- crates || { printf '%s\n' 'Local FilmCraft sources are modified; refusing an unpinned override' >&2; exit 1; }
  git -C "$LOCAL_OWNER" diff --cached --quiet -- crates || { printf '%s\n' 'Local FilmCraft index is modified' >&2; exit 1; }
  [ -z "$(git -C "$LOCAL_OWNER" ls-files --others --exclude-standard -- crates)" ] || { printf '%s\n' 'Untracked local FilmCraft source files are present' >&2; exit 1; }
  # The actual owner revision is recorded separately from the default Git pin.
  bun - "$WORK/Cargo.toml" "$LOCAL_OWNER" <<'JS'
const [manifest, owner] = process.argv.slice(2);
let source = await Bun.file(manifest).text();
let count = 0;
source = source.replace(/^(filmcraft-[\w-]+) = \{ git = "[^"]+", rev = "[^"]+" \}$/gm, (_, name) => {
  const path = owner + "/crates/" + name;
  if (!Bun.file(path + "/Cargo.toml").size) throw new Error("Missing local owner crate: " + name);
  count++;
  return name + " = { path = " + JSON.stringify(path) + " }";
});
if (count !== 4) throw new Error("Unexpected FilmCraft dependency count");
await Bun.write(manifest, source);
JS
  # Path overrides have a distinct resolution and cannot prove the pinned Git lock.
  rm -f -- "$WORK/Cargo.lock"
  MODE='explicit-local-owner'
fi
export RAYON_NUM_THREADS=1
LOCKED=()
if [ -f "$WORK/Cargo.lock" ]; then LOCKED=(--locked); fi
cargo test --release --manifest-path "$WORK/Cargo.toml" "${LOCKED[@]}" > "$OUT/test.log" 2>&1
cargo clippy --release --manifest-path "$WORK/Cargo.toml" --locked -- -D warnings > "$OUT/clippy.log" 2>&1
cargo build --profile "$PROFILE" --manifest-path "$WORK/Cargo.toml" --locked > "$OUT/build.log" 2>&1
cp "$CARGO_TARGET_DIR/$PROFILE/shenron-video" "$OUT/shenron-video"
chmod 0755 "$OUT/shenron-video"
cp "$WORK/Cargo.toml" "$WORK/Cargo.lock" "$OUT/"
bun - "$WORK" "$OUT" "$SOURCE_REV" "$MODE" "$OWNER_REV" <<'JS'
const [work, out, sourceRevision, dependencyMode, localOwnerRevision] = process.argv.slice(2);
const digest = async (path) => {
  const hash = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
};
const sources = {};
for (const path of ["Cargo.toml", ...new Bun.Glob("src/**/*.rs").scanSync(work)].sort())
  sources[path] = await digest(work + "/" + path);
const rustc = Bun.spawnSync(["rustc", "--version", "--verbose"]);
if (rustc.exitCode !== 0) throw new Error("Cannot record Rust compiler provenance");
await Bun.write(out + "/receipt.json", JSON.stringify({
  schema: "shenron.video.build/v1", sourceRevision, dependencyMode,
  localOwnerRevision: localOwnerRevision || null, sources,
  compiler: new TextDecoder().decode(rustc.stdout).trim(),
  lockSha256: await digest(out + "/Cargo.lock"),
  artifact: { file: "shenron-video", bytes: Bun.file(out + "/shenron-video").size, sha256: await digest(out + "/shenron-video") },
  gates: { test: true, clippy: true, build: true }, activated: false,
  finishedAt: new Date().toISOString(),
}, null, 2));
JS
printf 'Qualified artifact: %s\n' "$OUT"
