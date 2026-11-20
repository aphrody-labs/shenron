# SPDX-License-Identifier: Apache-2.0
# Targets of the local build (Dockerfile.build). Normally driven by `bun scripts/build/local.ts`,
# which sets OUT_DIR, SHENRON_REVISION and the secrets; direct use:
#   docker buildx bake -f docker-bake.hcl server-windows-x64
# Deploy runbook: docs/operations/AUTO-DEPLOY.md. Pins come from deploy/environment.json.

variable "OUT_DIR" { default = "dist/local/raw" }
variable "SHENRON_REVISION" { default = "unknown" }
variable "BASE_IMAGE" { default = "ubuntu:26.10" }
variable "FLAVOR" { default = "desktop" }
variable "VFS_DIR" { default = "dist/local/.empty-vfs" }
variable "ALLOW_NO_VFS" { default = "" }
# Rust binaries built in aphrody-labs/wiki (shenron-mcp, libshenron_ffi.so, koharu-sdk, shenron_ffi.dll), flat;
# scripts/build/local.ts stages them. Empty by default so `bake --print` works on a clean checkout.
variable "NATIVE_DIR" { default = "dist/local/.empty-native" }
# Directory of a local BuildKit cache export, for a builder whose state does not persist.
variable "CACHE_DIR" { default = "" }

group "default" { targets = ["all"] }
group "all" {
  targets = ["bot-linux-x64", "bot-windows-x64", "server-linux-x64", "server-windows-x64", "release-linux"]
}
# Linux lanes of one release, built independently (each reuses only its own inputs).
group "lanes" { targets = ["bot-linux-x64", "server-linux-x64"] }

target "_common" {
  context    = "."
  dockerfile = "Dockerfile.build"
  args       = { BASE_IMAGE = BASE_IMAGE }
  contexts   = { vfs = "${VFS_DIR}", native = "${NATIVE_DIR}" }
  cache-from = CACHE_DIR != "" ? ["type=local,src=${CACHE_DIR}"] : []
  cache-to   = CACHE_DIR != "" ? ["type=local,dest=${CACHE_DIR},mode=max"] : []
}

target "bot-linux-x64" {
  inherits = ["_common"]
  target   = "out-bot-linux-x64"
  output   = ["type=local,dest=${OUT_DIR}/bot-linux-x64"]
}
target "bot-windows-x64" {
  inherits = ["_common"]
  target   = "out-bot-windows-x64"
  output   = ["type=local,dest=${OUT_DIR}/bot-windows-x64"]
}
target "server-linux-x64" {
  inherits = ["_common"]
  target   = "out-server-linux-x64"
  args     = { BASE_IMAGE = BASE_IMAGE, FLAVOR = FLAVOR, ALLOW_NO_VFS = ALLOW_NO_VFS }
  output   = ["type=local,dest=${OUT_DIR}/server-linux-x64"]
}
target "server-windows-x64" {
  inherits = ["_common"]
  target   = "out-server-windows-x64"
  args     = { BASE_IMAGE = BASE_IMAGE, FLAVOR = FLAVOR, ALLOW_NO_VFS = ALLOW_NO_VFS }
  output   = ["type=local,dest=${OUT_DIR}/server-windows-x64"]
}
# Sealed runtime image (production flavor needs the public VFS in VFS_DIR).
target "release-linux" {
  inherits = ["_common"]
  target   = "release-linux"
  args     = { BASE_IMAGE = BASE_IMAGE, FLAVOR = "production", ALLOW_NO_VFS = ALLOW_NO_VFS, SHENRON_REVISION = SHENRON_REVISION }
  output   = ["type=docker,name=localhost/shenron:${SHENRON_REVISION}"]
  tags     = ["localhost/shenron:${SHENRON_REVISION}", "localhost/shenron:local"]
}
# JS dependency layer alone: measures the Bun cache without compiling anything.
target "bun-deps" {
  inherits = ["_common"]
  target   = "bun-deps"
  output   = ["type=cacheonly"]
}
# Context filter check (names only, nothing is built)
target "context-dump" {
  context    = "."
  dockerfile = "Dockerfile.build"
  target     = "context-dump"
  output     = ["type=tar,dest=dist/local/.context.tar"]
}
