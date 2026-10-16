// SPDX-License-Identifier: Apache-2.0
//! Typed Jev decisions over explicitly supplied public JSON.

use clap::Subcommand;
use miette::IntoDiagnostic;
use std::path::PathBuf;

#[derive(Debug, Subcommand)]
pub enum JevAction {
    /// Decide typed questions from public JSON {request, public:true}.
    Decide { input: PathBuf },
    /// Filter and rank public source passages from JSON {query, passages}.
    Rerank { input: PathBuf },
}

pub async fn run(action: JevAction) -> miette::Result<()> {
    let path = match &action {
        JevAction::Decide { input } | JevAction::Rerank { input } => input,
    };
    let bytes = tokio::fs::read(path).await.into_diagnostic()?;
    if bytes.len() > 256 * 1024 {
        return Err(miette::miette!("Jev input exceeds 256 KiB"));
    }
    let router = shenron_rag::jev::configured_router()
        .map_err(|error| miette::miette!(shenron_rag::jev::client_error(&error)))?;
    let output = match action {
        JevAction::Decide { .. } => {
            shenron_rag::jev::decide(&router, &serde_json::from_slice(&bytes).into_diagnostic()?)
                .await
                .map_err(|error| miette::miette!(shenron_rag::jev::client_error(&error)))?
        },
        JevAction::Rerank { .. } => serde_json::to_value(
            shenron_rag::jev::rerank(&router, &serde_json::from_slice(&bytes).into_diagnostic()?)
                .await
                .map_err(|error| miette::miette!(shenron_rag::jev::client_error(&error)))?,
        )
        .into_diagnostic()?,
    };
    println!("{}", serde_json::to_string_pretty(&output).into_diagnostic()?);
    Ok(())
}
