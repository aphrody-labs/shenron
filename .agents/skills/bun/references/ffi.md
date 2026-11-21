# bun:ffi

TS <-> native bridge: `dlopen` + typed symbols, `CString`, `JSCallback` for streaming.

- Implementation and tests: `packages/native/src/engine.ts`, `packages/native/test/engine.test.ts` (`bun test packages/native`). The `dlopen` table is generated (`bun run --filter @aphrody/shenron-native generate`); the native library is built in `aphrody-labs/wiki`.
- Pass `FFIType.u64` (with `BigInt(byteLength)`) for Rust `usize` parameters so `bun check` and the 64-bit Windows ABI agree.
- Upstream reference: https://bun.com/docs, or https://bun.com/reference/bun/ffi
