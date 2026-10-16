// SPDX-License-Identifier: Apache-2.0
//! Elevated Jev tools: explicitly public input, server-side credentials.
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct JevInput {
    /// Decide: {request:{state,questions,model?},public:true,minimum_confidence?}.
    /// Rerank: {query,passages:[{id,text,source_kind,public,url?,retrieval_score?}],limit?}.
    pub input: Value,
}

pub async fn decide(input: JevInput) -> Result<Value, String> {
    let input = serde_json::from_value(input.input)
        .map_err(|_| "invalid public Jev request".to_string())?;
    let router = shenron_rag::jev::configured_router()
        .map_err(|e| shenron_rag::jev::client_error(&e).to_string())?;
    shenron_rag::jev::decide(&router, &input)
        .await
        .map_err(|e| shenron_rag::jev::client_error(&e).to_string())
}

pub async fn rerank(input: JevInput) -> Result<Value, String> {
    let input = serde_json::from_value(input.input)
        .map_err(|_| "invalid public Jev rerank request".to_string())?;
    let router = shenron_rag::jev::configured_router()
        .map_err(|e| shenron_rag::jev::client_error(&e).to_string())?;
    let output = shenron_rag::jev::rerank(&router, &input)
        .await
        .map_err(|e| shenron_rag::jev::client_error(&e).to_string())?;
    serde_json::to_value(output).map_err(|e| e.to_string())
}
