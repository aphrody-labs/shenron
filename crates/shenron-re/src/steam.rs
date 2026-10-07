// SPDX-License-Identifier: Apache-2.0
//! Read-only Steam library inventory. This module never reads Steam login or authentication files.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SteamGameInstall {
    pub app_id: u32,
    pub name: String,
    pub install_dir: PathBuf,
    pub manifest: PathBuf,
}

/// Find installed Dragon Ball titles in explicitly supplied Steam library roots.
///
/// Only `steamapps/appmanifest_*.acf` metadata is read. Account credentials, tokens,
/// client configuration, and game content are not accessed.
pub fn scan_dragon_ball_installs(libraries: &[PathBuf]) -> std::io::Result<Vec<SteamGameInstall>> {
    let mut installs = Vec::new();
    for library in libraries {
        let steamapps = library.join("steamapps");
        let entries = match std::fs::read_dir(&steamapps) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        };
        for entry in entries {
            let entry = entry?;
            let file_name = entry.file_name();
            if !file_name.to_string_lossy().starts_with("appmanifest_") {
                continue;
            }
            let manifest = entry.path();
            let content = std::fs::read_to_string(&manifest)?;
            if let Some((app_id, name, install_dir)) = parse_app_manifest(&content)
                && name.to_ascii_lowercase().contains("dragon ball")
            {
                installs.push(SteamGameInstall {
                    app_id,
                    name,
                    install_dir: steamapps.join("common").join(install_dir),
                    manifest,
                });
            }
        }
    }
    installs.sort_by_key(|left| left.app_id);
    Ok(installs)
}

fn parse_app_manifest(content: &str) -> Option<(u32, String, String)> {
    let app_id = vdf_value(content, "appid")?.parse().ok()?;
    let name = vdf_value(content, "name")?;
    let install_dir = vdf_value(content, "installdir")?;
    let install_dir = Path::new(&install_dir);
    if install_dir.components().count() != 1
        || install_dir.components().any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return None;
    }
    Some((app_id, name, install_dir.to_string_lossy().into_owned()))
}

fn vdf_value(content: &str, key: &str) -> Option<String> {
    content.lines().find_map(|line| {
        let mut fields = line.split('"').filter(|field| !field.trim().is_empty());
        (fields.next()? == key).then(|| fields.next().map(str::to_owned)).flatten()
    })
}
