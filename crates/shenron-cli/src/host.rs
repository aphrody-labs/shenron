// SPDX-License-Identifier: Apache-2.0
//! Host probes: the `bun` launcher and the GPU count.

use std::{
    ffi::OsStr,
    path::Path,
    process::{Command, Stdio},
};

/// Environment variable naming the Bun executable; else `bun` on `PATH`.
pub const BUN_BIN_ENV: &str = "SHENRON_BUN_BIN";

fn bun_program() -> std::ffi::OsString {
    std::env::var_os(BUN_BIN_ENV).filter(|value| !value.is_empty()).unwrap_or_else(|| "bun".into())
}

/// A `bun` command with `args`.
pub fn bun_command<I, S>(args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new(bun_program());
    command.args(args);
    command
}

/// A `bun` command with `args`, running in `directory`.
pub fn bun_command_in<I, S>(directory: &Path, args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = bun_command(args);
    command.current_dir(directory);
    command
}

/// Number of NVIDIA GPUs `nvidia-smi` lists, 0 when the tool is absent.
#[must_use]
pub fn gpu_count() -> usize {
    Command::new("nvidia-smi")
        .args(["--query-gpu=name", "--format=csv,noheader"])
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map_or(0, |output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter(|line| !line.trim().is_empty())
                .count()
        })
}
