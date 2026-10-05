// SPDX-License-Identifier: Apache-2.0
//! Report output contract shared by the `dbfr` subcommands.
//!
//! Every subcommand takes `--format text|json|markdown|html|csv` (with `--json`
//! as a shorthand) and `--out <path>`. When `--out` carries a known extension
//! and `--format` was not given, the format is inferred from it. Reports go to
//! stdout; progress and human chatter go to stderr.

use std::path::{Path, PathBuf};

use aphrody_models::{Format, Report};

/// Output options shared by every report-producing subcommand.
#[derive(clap::Args, Debug, Clone, Default)]
pub(crate) struct OutputOpts {
    /// Output format: `text`, `json`, `markdown` (`md`), `html`, `csv`.
    /// Defaults to the extension of `--out`, else `text`.
    #[arg(long, short = 'f', global = true)]
    format: Option<String>,
    /// Shorthand for `--format json`.
    #[arg(long, global = true)]
    json: bool,
    /// Write the report to this path instead of stdout.
    #[arg(long, short = 'o', global = true, value_name = "PATH")]
    out: Option<PathBuf>,
}

impl OutputOpts {
    /// Precedence: explicit `--format`, then `--json`, then the extension of `--out`, then text.
    fn format(&self) -> miette::Result<Format> {
        if let Some(raw) = &self.format {
            return Format::from_str_opt(raw).ok_or_else(|| {
                let valid: Vec<&str> = Format::all().iter().map(|f| f.as_str()).collect();
                miette::miette!("unknown format `{raw}` (expected one of: {})", valid.join(", "))
            });
        }
        if self.json {
            return Ok(Format::Json);
        }
        if let Some(path) = &self.out
            && let Some(inferred) = Format::from_extension(&path.to_string_lossy())
        {
            return Ok(inferred);
        }
        Ok(Format::Text)
    }

    fn emit(&self, body: &str) -> miette::Result<()> {
        match &self.out {
            Some(path) => write_out(path, body),
            None => {
                println!("{}", body.trim_end());
                Ok(())
            },
        }
    }

    /// Emit either the JSON value or the rendered table, whichever the format calls for.
    pub(crate) fn emit_report(
        &self,
        report: &Report,
        json: &serde_json::Value,
    ) -> miette::Result<()> {
        let format = self.format()?;
        let body = if format == Format::Json {
            serde_json::to_string_pretty(json)
                .map_err(|e| miette::miette!("serialise report: {e}"))?
        } else {
            report.render(format)
        };
        self.emit(&body)
    }
}

/// Write a report to disk, creating parent directories as needed.
fn write_out(path: &Path, body: &str) -> miette::Result<()> {
    if let Some(parent) = path.parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent)
            .map_err(|e| miette::miette!("create {}: {e}", parent.display()))?;
    }
    std::fs::write(path, body).map_err(|e| miette::miette!("write {}: {e}", path.display()))?;
    eprintln!("wrote {} ({} bytes)", path.display(), body.len());
    Ok(())
}
