// SPDX-License-Identifier: Apache-2.0
//! Every operation the Rust router serves is one of the contract (`packages/api/openapi/public.json`,
//! generated from the zod catalogue by `bun packages/api/scripts/openapi.ts`).

use std::path::PathBuf;

use serde_json::Value;

#[test]
fn operations_belong_to_the_openapi_document() {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/api/openapi/public.json");
    let document: Value = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let paths = document["paths"].as_object().expect("paths");
    let unknown: Vec<String> = shenron_api::OPERATIONS
        .iter()
        .filter(|(method, path)| paths.get(*path).and_then(|item| item.get(*method)).is_none())
        .map(|(method, path)| format!("{method} {path}"))
        .collect();
    assert!(unknown.is_empty(), "not in the contract: {unknown:?}");
}
