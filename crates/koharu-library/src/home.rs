// SPDX-License-Identifier: MIT OR Apache-2.0
//! Storage roots of the Koharu engine inside Shenron's home.
//!
//! Home: `SHENRON_HOME`, else the platform data directory (`%LOCALAPPDATA%\Shenron`,
//! `~/Library/Application Support/Shenron`, `$XDG_DATA_HOME/shenron` or
//! `~/.local/share/shenron`), the convention of `shenron-server` (`apps/server/src/config.ts`).
//!
//! ```text
//! <home>/data/koharu/projects    projects (`<name>.khrproj`)
//! <home>/cache/koharu/packages   runtime libraries and model weights (downloaded again on demand)
//! ```
//!
//! Gentle migration from the upstream locations: projects of `Documents/Koharu` stay listed
//! and open in place (new projects go to the new root), and an existing
//! `<OS cache>/koharu/packages` store keeps serving until the new store exists, so no model is
//! downloaded twice. The shared settings file stays `~/.koharu/config.toml`: `aphrody-ml-config`
//! (Aphrody) offers no other location.

use std::path::{Path, PathBuf};

use anyhow::{Context as _, Result};

/// Environment variable naming Shenron's home directory.
pub const HOME_ENV: &str = "SHENRON_HOME";

/// Where the engine keeps its projects and its package store.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Roots {
    pub home: PathBuf,
    /// Root of new projects.
    pub projects: PathBuf,
    /// Upstream project root, still listed and opened when it exists.
    pub legacy_projects: Option<PathBuf>,
    /// Runtime and model package store (`aphrody_ml_runtime::Store`).
    pub packages: PathBuf,
}

impl Roots {
    /// Roots under Shenron's home: `SHENRON_HOME`, else the platform data directory.
    pub fn from_env() -> Result<Self> {
        Ok(Self::in_home(home()?))
    }

    /// Roots under an explicit home, with the upstream locations of this machine as fallback.
    #[must_use]
    pub fn in_home(home: impl Into<PathBuf>) -> Self {
        Self::resolve(
            home.into(),
            dirs::document_dir().map(|documents| documents.join("Koharu")),
            dirs::cache_dir().map(|cache| cache.join("koharu").join("packages")),
        )
    }

    fn resolve(
        home: PathBuf,
        legacy_projects: Option<PathBuf>,
        legacy_packages: Option<PathBuf>,
    ) -> Self {
        let projects = home.join("data").join("koharu").join("projects");
        let packages = home.join("cache").join("koharu").join("packages");
        let legacy_projects =
            legacy_projects.filter(|legacy| legacy.is_dir() && *legacy != projects);
        let packages = match legacy_packages {
            Some(legacy) if !packages.exists() && legacy.is_dir() => legacy,
            _ => packages,
        };
        Self { home, projects, legacy_projects, packages }
    }

    /// Select the package store before any runtime or model is resolved. A store already
    /// chosen by the process (another library in it) is kept and reported.
    pub fn configure_store(&self) {
        if let Err(error) = aphrody_ml_runtime::Store::configure(&self.packages) {
            tracing::warn!(%error, store = %self.packages.display(), "Koharu package store unchanged");
        }
    }
}

/// Shenron's home: `SHENRON_HOME`, else the platform data directory.
pub fn home() -> Result<PathBuf> {
    if let Some(explicit) = std::env::var_os(HOME_ENV).filter(|value| !value.is_empty()) {
        let explicit = PathBuf::from(explicit);
        return if explicit.is_absolute() {
            Ok(explicit)
        } else {
            Ok(std::env::current_dir()
                .context("the working directory is unavailable")?
                .join(explicit))
        };
    }
    platform_home().context("the platform data directory is unavailable; set SHENRON_HOME")
}

fn platform_home() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        dirs::data_local_dir().map(|dir| dir.join("Shenron"))
    } else if cfg!(target_os = "macos") {
        dirs::data_dir().map(|dir| dir.join("Shenron"))
    } else {
        dirs::data_dir().map(|dir| dir.join("shenron"))
    }
}

/// `true` when `path` names a Koharu project directory.
pub(crate) fn is_project(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("khrproj"))
        && (path.join("state-a.khr").is_file() || path.join("state-b.khr").is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_roots_live_under_the_home() {
        let home = tempfile::tempdir().unwrap();
        let roots = Roots::resolve(home.path().to_owned(), None, None);
        assert_eq!(roots.projects, home.path().join("data/koharu/projects"));
        assert_eq!(roots.packages, home.path().join("cache/koharu/packages"));
        assert_eq!(roots.legacy_projects, None);
    }

    #[test]
    fn upstream_locations_stay_readable_until_the_new_ones_exist() {
        let home = tempfile::tempdir().unwrap();
        let upstream = tempfile::tempdir().unwrap();
        let projects = upstream.path().join("Koharu");
        let packages = upstream.path().join("koharu/packages");
        std::fs::create_dir_all(&projects).unwrap();
        std::fs::create_dir_all(&packages).unwrap();

        let roots =
            Roots::resolve(home.path().to_owned(), Some(projects.clone()), Some(packages.clone()));
        assert_eq!(roots.legacy_projects, Some(projects.clone()));
        assert_eq!(roots.packages, packages);

        std::fs::create_dir_all(home.path().join("cache/koharu/packages")).unwrap();
        let roots = Roots::resolve(home.path().to_owned(), Some(projects), Some(packages));
        assert_eq!(roots.packages, home.path().join("cache/koharu/packages"));
    }

    #[test]
    fn missing_upstream_locations_are_ignored() {
        let home = tempfile::tempdir().unwrap();
        let roots = Roots::resolve(
            home.path().to_owned(),
            Some(home.path().join("absent")),
            Some(home.path().join("absent-store")),
        );
        assert_eq!(roots.legacy_projects, None);
        assert_eq!(roots.packages, home.path().join("cache/koharu/packages"));
    }
}
