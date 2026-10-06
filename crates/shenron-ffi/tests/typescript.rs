// SPDX-License-Identifier: Apache-2.0
//! Generated TypeScript of `@shenron/native`: the `bun:ffi` table (from `abi::SYMBOLS`) and the
//! payload types (from `types`, through specta). Fails when a committed file is stale;
//! `UPDATE=1` rewrites them (`bun packages/native/scripts/generate.ts`).

#![cfg(not(target_arch = "wasm32"))]

use std::{fmt::Write as _, path::PathBuf};

use shenron_ffi::{
    abi::{ABI_VERSION, FfiKind, SYMBOLS, Status},
    types::{
        AuthStatus, BuildInfo, CapturedResult, FfiError, JobOutcome, LocalSearchResponse,
        MemoryEntry, RagChunk, RagSearchResponse, RagStats,
    },
};
use specta::Types;
use specta_typescript::Typescript;

const SYMBOLS_TS: &str = "packages/native/src/generated/symbols.ts";
const TYPES_TS: &str = "packages/native/src/generated/types.ts";

const HEADER: &str = "// SPDX-License-Identifier: Apache-2.0\n\
    // Generated from crates/shenron-ffi by `bun packages/native/scripts/generate.ts`; do not edit.\n";

fn repository() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn kind_name(kind: FfiKind) -> &'static str {
    match kind {
        FfiKind::Void => "void",
        FfiKind::Bool => "bool",
        FfiKind::I32 => "i32",
        FfiKind::U32 => "u32",
        FfiKind::U64 => "u64",
        FfiKind::F32 => "f32",
        FfiKind::CStr => "cstr",
        FfiKind::Argv => "argv",
        FfiKind::OwnedStr => "owned_str",
        FfiKind::StaticStr => "static_str",
        FfiKind::ThreadStr => "thread_str",
    }
}

fn symbols_ts() -> String {
    let mut out = String::from(HEADER);
    out.push_str(
        "//\n\
         // The `dlopen` table of the shenron-ffi C ABI, from `abi::SYMBOLS`: every signature is\n\
         // checked against its Rust export at compile time. Kinds: `cstr` borrowed input string;\n\
         // `owned_str` returned string, freed once with `shenron_string_free`; `static_str` never\n\
         // freed; `thread_str` valid until the next call on the same thread, never freed.\n\n\
         import { FFIType } from \"bun:ffi\";\n\n",
    );
    let _ = writeln!(
        out,
        "/** ABI revision of this table: `shenron_abi_version()` of a compatible library. */\n\
         export const SHENRON_FFI_ABI = {ABI_VERSION};\n"
    );
    let _ = writeln!(
        out,
        "/** Version of the shenron-ffi crate the table was generated from (the workspace version). */\n\
         export const SHENRON_FFI_VERSION = \"{}\";\n",
        env!("CARGO_PKG_VERSION")
    );
    out.push_str(
        "/** `status` of a `JobOutcome`; `usage` and `software` are also boundary exit codes. */\n\
         export const SHENRON_STATUS = {\n",
    );
    for status in Status::ALL {
        let _ = writeln!(out, "  {}: {},", status.name(), status.code());
    }
    out.push_str("} as const;\n\n/** Every export of the library, in declaration order. */\nexport const SYMBOLS = {\n");
    for symbol in SYMBOLS {
        out.push_str("  /**\n");
        for line in symbol.doc {
            let line = line.trim();
            if line.is_empty() {
                out.push_str("   *\n");
            } else {
                let _ = writeln!(out, "   * {line}");
            }
        }
        let args = symbol
            .args
            .iter()
            .map(|arg| format!("{}: {}", arg.name, kind_name(arg.kind)))
            .collect::<Vec<_>>()
            .join(", ");
        let _ = writeln!(
            out,
            "   *\n   * `{}({args}) -> {}`, since ABI {}.\n   */",
            symbol.name,
            kind_name(symbol.returns),
            symbol.since
        );
        let ffi_args = symbol
            .args
            .iter()
            .map(|arg| format!("FFIType.{}", arg.kind.bun_arg()))
            .collect::<Vec<_>>()
            .join(", ");
        let _ = writeln!(
            out,
            "  {}: {{ args: [{ffi_args}], returns: FFIType.{} }},",
            symbol.name,
            symbol.returns.bun_return()
        );
    }
    out.push_str("} as const;\n");
    out
}

fn types_ts() -> String {
    let types = Types::default()
        .register::<CapturedResult>()
        .register::<JobOutcome<CapturedResult>>()
        .register::<LocalSearchResponse>()
        .register::<RagSearchResponse>()
        .register::<RagStats>()
        .register::<RagChunk>()
        .register::<FfiError>()
        .register::<AuthStatus>()
        .register::<BuildInfo>()
        .register::<MemoryEntry>();
    let body = Typescript::default()
        .header(format!(
            "{HEADER}//\n// JSON payloads of the shenron-ffi C ABI, from crates/shenron-ffi/src/types.rs.\n"
        ))
        .export(&types, specta_serde::Format)
        .expect("the payload types export to TypeScript");
    if body.ends_with('\n') { body } else { format!("{body}\n") }
}

#[test]
fn generated_typescript_is_current() {
    let update = std::env::var_os("UPDATE").is_some_and(|value| value == "1");
    let mut stale = Vec::new();
    for (relative, expected) in [(SYMBOLS_TS, symbols_ts()), (TYPES_TS, types_ts())] {
        let path = repository().join(relative);
        if update {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, &expected).unwrap();
        } else if std::fs::read_to_string(&path).ok().as_deref() != Some(expected.as_str()) {
            stale.push(relative);
        }
    }
    assert!(
        stale.is_empty(),
        "stale generated TypeScript {stale:?}: run `bun packages/native/scripts/generate.ts`"
    );
}
