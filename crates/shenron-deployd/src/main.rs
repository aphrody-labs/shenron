// SPDX-License-Identifier: Apache-2.0
//! `shenron-deployd`: `keygen`, `publish`, `verify` and `agent`.

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use clap::{Args, Parser, Subcommand};
use shenron_deployd::agent::Agent;
use shenron_deployd::config::Config;
use shenron_deployd::manifest::{self, Health, SignedManifest};
use shenron_deployd::publish::{PublishOptions, publish};
use shenron_deployd::store::Store;
use shenron_deployd::util::parse_duration;
use tokio::sync::watch;

#[derive(Parser)]
#[command(name = "shenron-deployd", version, about = "Signed releases, no SSH: publisher and host agent")]
struct Cli {
    /// TOML configuration (`${VAR}` and `${VAR:-default}` are expanded from the environment).
    #[arg(long, short, env = "SHENRON_DEPLOYD_CONFIG", global = true)]
    config: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Generate an ed25519 key pair (`<out>.key` is the private seed, `<out>.pub` the public key).
    Keygen {
        #[arg(long)]
        out: PathBuf,
    },
    /// Hash artifacts, sign the manifest and upload to the store.
    Publish(PublishArgs),
    /// Verify a manifest and its detached signature against the pinned keys.
    Verify {
        manifest: PathBuf,
        /// Signature file, default `<manifest>.sig`.
        #[arg(long)]
        signature: Option<PathBuf>,
    },
    /// Run the host agent.
    Agent,
}

#[derive(Args)]
struct PublishArgs {
    #[arg(long)]
    service: String,
    #[arg(long, default_value = "stable")]
    channel: String,
    /// Release version; default `git rev-parse HEAD` of the current directory.
    #[arg(long, env = "SHENRON_DEPLOYD_VERSION")]
    version: Option<String>,
    /// Artifact file (repeatable); the file name is the artifact name, `.tar.gz` is unpacked on the host.
    #[arg(long = "artifact", short = 'a', required = true)]
    artifacts: Vec<PathBuf>,
    #[arg(long)]
    health_url: Option<String>,
    #[arg(long, default_value_t = 200)]
    health_status: u16,
    #[arg(long, default_value_t = 10)]
    health_retries: u32,
    #[arg(long, default_value = "2s")]
    health_interval: String,
    #[arg(long, default_value = "5s")]
    health_timeout: String,
}

fn load_config(cli: &Cli) -> Result<Config> {
    let path = cli.config.as_deref().context("--config or SHENRON_DEPLOYD_CONFIG is required")?;
    Config::load(path)
}

#[tokio::main]
async fn main() -> Result<()> {
    shenron_deployd::util::ensure_crypto_provider();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_target(false)
        .init();
    let cli = Cli::parse();
    match &cli.command {
        Command::Keygen { out } => keygen(out),
        Command::Publish(args) => publish_cmd(&load_config(&cli)?, args).await,
        Command::Verify { manifest, signature } => verify_cmd(&load_config(&cli)?, manifest, signature.as_deref()),
        Command::Agent => agent_cmd(load_config(&cli)?).await,
    }
}

fn keygen(out: &std::path::Path) -> Result<()> {
    let key = manifest::generate_signing_key()?;
    let (private, public) = (out.with_extension("key"), out.with_extension("pub"));
    manifest::write_private(&private, &format!("{}\n", manifest::encode_key(&key.to_bytes())))?;
    let pk = manifest::encode_key(&key.verifying_key().to_bytes());
    std::fs::write(&public, format!("{pk}\n"))?;
    println!("{}", serde_json::json!({ "private_key": private, "public_key_file": public, "public_key": pk }));
    Ok(())
}

async fn publish_cmd(cfg: &Config, args: &PublishArgs) -> Result<()> {
    let key = manifest::load_signing_key(&cfg.signing)?;
    let store = Store::new(&cfg.store)?;
    let version = match &args.version {
        Some(v) => v.clone(),
        None => {
            let out = tokio::process::Command::new("git").args(["rev-parse", "HEAD"]).output().await.context("run git")?;
            if !out.status.success() {
                bail!("--version not given and `git rev-parse HEAD` failed");
            }
            String::from_utf8(out.stdout)?.trim().to_owned()
        }
    };
    let health = args.health_url.as_ref().map(|url| -> Result<Health> {
        Ok(Health {
            url: url.clone(),
            expect_status: args.health_status,
            retries: args.health_retries,
            interval_ms: parse_duration(&args.health_interval)?.as_millis() as u64,
            timeout_ms: parse_duration(&args.health_timeout)?.as_millis() as u64,
        })
    });
    let signed = publish(
        &store,
        &key,
        PublishOptions {
            service: args.service.clone(),
            channel: args.channel.clone(),
            version,
            artifacts: args.artifacts.clone(),
            health: health.transpose()?,
        },
    )
    .await?;
    println!("{}", serde_json::to_string(&serde_json::json!({
        "service": signed.manifest.service,
        "channel": signed.manifest.channel,
        "version": signed.manifest.version,
        "created_at": signed.manifest.created_at,
        "artifacts": signed.manifest.artifacts.iter().map(|a| serde_json::json!({"name": a.name, "sha256": a.sha256, "size": a.size, "url": a.url})).collect::<Vec<_>>(),
        "signature": signed.signature,
    }))?);
    Ok(())
}

fn verify_cmd(cfg: &Config, manifest_path: &std::path::Path, signature: Option<&std::path::Path>) -> Result<()> {
    let trusted = manifest::load_trusted(&cfg.trust)?;
    let sig_path = signature.map(PathBuf::from).unwrap_or_else(|| PathBuf::from(format!("{}.sig", manifest_path.display())));
    let signed = SignedManifest::open(std::fs::read(manifest_path)?, &std::fs::read_to_string(sig_path)?, &trusted)?;
    println!("{}", serde_json::json!({ "verified": true, "service": signed.manifest.service, "version": signed.manifest.version }));
    Ok(())
}

async fn agent_cmd(cfg: Config) -> Result<()> {
    let api = cfg.api.clone();
    let agent = Arc::new(Agent::new(cfg).await?);
    let (stop_tx, stop_rx) = watch::channel(false);
    tokio::spawn(async move {
        shutdown_signal().await;
        tracing::info!("shutting down");
        let _ = stop_tx.send(true);
    });
    let api_task = api.map(|api| {
        let (agent, stop) = (agent.clone(), stop_rx.clone());
        tokio::spawn(async move { shenron_deployd::api::serve(agent, &api, stop).await })
    });
    tracing::info!(services = agent.snapshot().len(), "agent started");
    agent.clone().run(stop_rx).await;
    if let Some(t) = api_task {
        t.await??;
    }
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}
