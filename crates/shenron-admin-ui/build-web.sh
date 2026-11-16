#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Builds the admin. web bundle into $1 (default dist/admin-web): wasm, glue and index.html.
# Needs the wasm32-unknown-unknown target and a wasm-bindgen CLI matching Cargo.lock.
set -euo pipefail
out=${1:-dist/admin-web}
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cargo build -p shenron-admin-ui --target wasm32-unknown-unknown --features web --release
rm -rf "$out" && mkdir -p "$out"
wasm-bindgen --target web --no-typescript --out-dir "$out" --out-name app target/wasm32-unknown-unknown/release/shenron-admin-app.wasm
command -v wasm-opt >/dev/null && wasm-opt -Oz --enable-bulk-memory --enable-reference-types --enable-sign-ext --enable-nontrapping-float-to-int --enable-simd --enable-mutable-globals -o "$out/app_bg.wasm" "$out/app_bg.wasm" || true
cp "$here/web/index.html" "$out/index.html"
