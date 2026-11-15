// SPDX-License-Identifier: Apache-2.0
//! Golden HTTP cases shared with the TypeScript host (`data/api/fixtures/*.json`, recorded from
//! `createShenronApi` by `bun packages/api/scripts/api-fixtures.ts --write`): the Rust router must
//! answer the same status, the same recorded headers (cache policy) and the same JSON. `"match": "envelope"` compares `error` and `code`
//! only (the zod message is not part of the contract).

use std::{fs, path::PathBuf};

use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use serde::Deserialize;
use serde_json::Value;
use tower::ServiceExt;

#[derive(Deserialize)]
pub struct Fixture {
    pub cases: Vec<Case>,
}

#[derive(Deserialize)]
pub struct Case {
    pub name: String,
    pub operation: String,
    #[serde(default = "get")]
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub headers: serde_json::Map<String, Value>,
    pub status: u16,
    #[serde(default, rename = "responseHeaders")]
    pub response_headers: serde_json::Map<String, Value>,
    pub body: Value,
    #[serde(default, rename = "match")]
    pub mode: Option<String>,
}

fn get() -> String {
    "get".into()
}

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/api/fixtures")
}

fn fixtures() -> Vec<(String, Fixture)> {
    let mut out = Vec::new();
    for entry in fs::read_dir(fixtures_dir()).expect("data/api/fixtures") {
        let path = entry.expect("fixture entry").path();
        if path.extension().is_some_and(|ext| ext == "json") {
            let text = fs::read_to_string(&path).expect("fixture file");
            let fixture: Fixture = serde_json::from_str(&text)
                .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
            out.push((path.display().to_string(), fixture));
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

#[tokio::test]
async fn rust_answers_like_the_typescript_host() {
    let app = shenron_api::router(shenron_api::Ports::default());
    let mut failures = Vec::new();
    let mut count = 0;
    for (file, fixture) in fixtures() {
        for case in fixture.cases {
            count += 1;
            let mut request =
                Request::builder().method(case.method.to_uppercase().as_str()).uri(&case.path);
            for (name, value) in &case.headers {
                request = request.header(name, value.as_str().unwrap_or_default());
            }
            let response = app.clone().oneshot(request.body(Body::empty()).unwrap()).await.unwrap();
            let status = response.status().as_u16();
            let headers_differ: Vec<String> = case
                .response_headers
                .iter()
                .filter(|(name, value)| {
                    response.headers().get(name.as_str()).and_then(|v| v.to_str().ok())
                        != value.as_str()
                })
                .map(|(name, _)| name.clone())
                .collect();
            let bytes = to_bytes(response.into_body(), 64 << 20).await.unwrap();
            let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
            let same = match case.mode.as_deref() {
                Some("envelope") => {
                    ["error", "code"].iter().all(|key| body.get(key) == case.body.get(key))
                },
                _ => body == case.body,
            };
            if status != case.status || !same || !headers_differ.is_empty() {
                failures.push(format!(
                    "{file} :: {} ({} {}): status {status} vs {}, body {}, headers {headers_differ:?}",
                    case.name,
                    case.operation,
                    case.path,
                    case.status,
                    if same { "same" } else { "differs" }
                ));
            }
        }
    }
    assert!(count > 0, "no golden case under data/api/fixtures");
    assert!(
        failures.is_empty(),
        "{} of {count} cases differ:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

#[test]
fn every_ported_operation_has_golden_cases() {
    let covered: Vec<String> = fixtures()
        .into_iter()
        .flat_map(|(_, f)| f.cases.into_iter().map(|c| c.operation))
        .collect();
    let missing: Vec<&str> = shenron_api::OPERATIONS
        .iter()
        .map(|(_, path)| *path)
        .filter(|path| !covered.iter().any(|c| c == path))
        .collect();
    assert!(missing.is_empty(), "ported without a golden case: {missing:?}");
}
