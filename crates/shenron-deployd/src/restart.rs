// SPDX-License-Identifier: Apache-2.0
//! Restarts a systemd unit over D-Bus (zbus), falling back to `systemctl`.

use std::time::Duration;

use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use tokio::process::Command;
use zbus::OwnedObjectPath;

use crate::config::{RestartMode, Scope};

#[zbus::proxy(
    interface = "org.freedesktop.systemd1.Manager",
    default_service = "org.freedesktop.systemd1",
    default_path = "/org/freedesktop/systemd1"
)]
trait Manager {
    fn restart_unit(&self, name: &str, mode: &str) -> zbus::Result<OwnedObjectPath>;

    #[zbus(signal)]
    fn job_removed(&self, id: u32, job: OwnedObjectPath, unit: &str, result: &str) -> zbus::Result<()>;
}

const JOB_TIMEOUT: Duration = Duration::from_secs(120);

pub async fn restart_unit(mode: RestartMode, scope: Scope, unit: &str) -> Result<()> {
    match mode {
        RestartMode::None => Ok(()),
        RestartMode::Dbus => restart_dbus(scope, unit).await,
        RestartMode::Systemctl => restart_systemctl(scope, unit).await,
        RestartMode::Auto => match restart_dbus(scope, unit).await {
            Ok(()) => Ok(()),
            Err(e) if is_connection_error(&e) => {
                tracing::warn!(%unit, error = %e, "D-Bus unavailable, falling back to systemctl");
                restart_systemctl(scope, unit).await
            }
            Err(e) => Err(e),
        },
    }
}

#[derive(Debug, thiserror::Error)]
#[error("cannot reach systemd over D-Bus: {0}")]
struct Unreachable(String);

fn is_connection_error(e: &anyhow::Error) -> bool {
    e.chain().any(|c| c.is::<Unreachable>())
}

async fn restart_dbus(scope: Scope, unit: &str) -> Result<()> {
    let conn = match scope {
        Scope::System => zbus::Connection::system().await,
        Scope::User => zbus::Connection::session().await,
    }
    .map_err(|e| Unreachable(e.to_string()))?;
    let manager = ManagerProxy::new(&conn).await.map_err(|e| Unreachable(e.to_string()))?;
    // Subscribe before restarting so the completion signal cannot be missed.
    let mut removed = manager.receive_job_removed().await.map_err(|e| Unreachable(e.to_string()))?;
    let job = manager.restart_unit(unit, "replace").await.with_context(|| format!("RestartUnit {unit}"))?;
    let wait = async {
        while let Some(signal) = removed.next().await {
            let args = signal.args()?;
            if args.job == job {
                return Ok::<String, anyhow::Error>(args.result.to_owned());
            }
        }
        bail!("D-Bus signal stream ended before the restart job completed")
    };
    let result = tokio::time::timeout(JOB_TIMEOUT, wait).await.context("restart job timed out")??;
    if result != "done" {
        bail!("systemd restart job for {unit} ended with {result:?}");
    }
    Ok(())
}

async fn restart_systemctl(scope: Scope, unit: &str) -> Result<()> {
    let mut cmd = Command::new("systemctl");
    if scope == Scope::User {
        cmd.arg("--user");
    }
    let out = tokio::time::timeout(JOB_TIMEOUT, cmd.args(["restart", "--", unit]).output())
        .await
        .context("systemctl restart timed out")?
        .context("run systemctl")?;
    if !out.status.success() {
        bail!("systemctl restart {unit}: {}", String::from_utf8_lossy(&out.stderr).trim());
    }
    Ok(())
}
