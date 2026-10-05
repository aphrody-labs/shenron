// SPDX-License-Identifier: Apache-2.0
//! `shenron-mcp`: the Shenron MCP server.
//!
//! - `shenron-mcp`: stdio (Claude Code plugin, local agents), every tool.
//! - `shenron-mcp --http [ADDR]`: Streamable HTTP on ADDR (default 127.0.0.1:8790), every tool.
//! - `shenron-mcp --http [ADDR] --public`: tiered public server; required for a non-loopback
//!   ADDR. Anonymous callers get the read-only tools; a valid `Authorization: Bearer <token>`
//!   (`SHENRON_MCP_TOKENS`, `SHENRON_API_ADMIN_TOKEN`, `DBFR_TOKEN`) or an IP in
//!   `SHENRON_MCP_ALLOWED_IPS` (client IP read from `X-Forwarded-For`/`X-Real-IP` only when the
//!   peer is in `SHENRON_MCP_TRUSTED_PROXIES`, loopback by default) unlocks every tool, write and
//!   admin included. An invalid bearer is a 401. Put it behind the site's TLS proxy at `/mcp`.

use std::net::SocketAddr;

use rmcp::ServiceExt as _;
use shenron_mcp::ShenronMcp;

const USAGE: &str = "usage: shenron-mcp [--http [ADDR]] [--public] [--version]";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "--version" || arg == "-V") {
        println!("shenron-mcp {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("{USAGE}");
        return Ok(());
    }
    // stdout carries the stdio protocol: diagnostics go to stderr only.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_env("SHENRON_MCP_LOG")
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();
    let public = args.iter().any(|arg| arg == "--public");
    let server = if public { ShenronMcp::public() } else { ShenronMcp::full() };
    if let Some(index) = args.iter().position(|arg| arg == "--http") {
        let bind: SocketAddr = match args.get(index + 1).filter(|value| !value.starts_with("--")) {
            Some(value) => value.parse()?,
            None => SocketAddr::from(([127, 0, 0, 1], 8790)),
        };
        if !bind.ip().is_loopback() && !public {
            return Err(
                "a non-loopback HTTP bind requires --public (read-only unless authorised)".into()
            );
        }
        shenron_mcp::http::serve(bind, server).await?;
        return Ok(());
    }
    if let Some(unknown) = args.iter().find(|arg| arg.as_str() != "--public") {
        return Err(format!("unknown argument {unknown}; {USAGE}").into());
    }
    let service = server.serve((tokio::io::stdin(), tokio::io::stdout())).await?;
    service.waiting().await?;
    Ok(())
}
