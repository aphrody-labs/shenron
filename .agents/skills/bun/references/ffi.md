# bun:ffi in src

TS <-> native bridge: `dlopen` + typed symbols, `CString` + `core_free`, `JSCallback` for streaming.

- Implementation and round-trip test: `packages/core/src/ffi.ts`, `packages/core/test/ffi.test.ts` (`bun test packages/core`). The C ABI it loads is `src/core/capi`.
- Reindex and find users: `bun packages/core/src/cli.ts index <root> --all`, then `bun packages/core/src/cli.ts users bun:ffi`.
- Pass `FFIType.u64` (with `BigInt(byteLength)`) for Rust `usize` parameters so `bun check` and the 64-bit Windows ABI agree.
- Upstream reference: https://bun.com/docs, or https://bun.com/reference/bun/ffi
