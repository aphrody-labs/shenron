// SPDX-License-Identifier: Apache-2.0
//! Builder side: hash artifacts, write and sign the release manifest, upload everything.
//!
//! Upload order: artifacts, then the immutable `releases/<version>/manifest.json(.sig)`, then the
//! mutable channel pointer last, so an agent never sees a manifest whose artifacts are missing.

use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use ed25519_dalek::SigningKey;

use crate::manifest::{Artifact, Health, Manifest, SCHEMA, SignedManifest, channel_key, release_key};
use crate::store::Store;
use crate::util::{ensure_safe_component, hash_file, now_rfc3339};

pub struct PublishOptions {
    pub service: String,
    pub channel: String,
    pub version: String,
    pub artifacts: Vec<PathBuf>,
    pub health: Option<Health>,
}

pub async fn publish(store: &Store, key: &SigningKey, opts: PublishOptions) -> Result<SignedManifest> {
    ensure_safe_component("service", &opts.service)?;
    ensure_safe_component("channel", &opts.channel)?;
    ensure_safe_component("version", &opts.version)?;
    if opts.artifacts.is_empty() {
        bail!("nothing to publish: pass at least one --artifact");
    }

    let mut artifacts = Vec::new();
    let mut hashed = Vec::new();
    for path in &opts.artifacts {
        let name = path.file_name().and_then(|n| n.to_str()).with_context(|| format!("{} has no file name", path.display()))?.to_owned();
        let (sha256, size) = hash_file(path).await?;
        let url = store.public_url(&release_key(&opts.service, &opts.version, &name))?;
        artifacts.push(Artifact {
            unpack: name.ends_with(".tar.gz") || name.ends_with(".tgz"),
            mode: file_mode(path)?,
            name,
            url,
            sha256,
            size,
        });
        hashed.push(path.clone());
    }

    let manifest = Manifest {
        schema: SCHEMA,
        service: opts.service.clone(),
        channel: opts.channel.clone(),
        version: opts.version.clone(),
        created_at: now_rfc3339(),
        artifacts,
        health: opts.health,
    };
    let signed = SignedManifest::sign(manifest, key)?;

    for (path, artifact) in hashed.iter().zip(&signed.manifest.artifacts) {
        store
            .put_file(&release_key(&opts.service, &opts.version, &artifact.name), path, &artifact.sha256, artifact.size)
            .await
            .with_context(|| format!("upload {}", artifact.name))?;
    }
    for key in [release_key(&opts.service, &opts.version, "manifest.json"), channel_key(&opts.service, &opts.channel)] {
        store.put_bytes(&key, signed.bytes.clone(), "application/json").await?;
        store.put_bytes(&format!("{key}.sig"), signed.signature.clone().into_bytes(), "text/plain").await?;
    }
    Ok(signed)
}

#[cfg(unix)]
fn file_mode(path: &std::path::Path) -> Result<Option<String>> {
    use std::os::unix::fs::PermissionsExt;
    let mode = std::fs::metadata(path)?.permissions().mode() & 0o777;
    Ok(Some(format!("{mode:04o}")))
}

#[cfg(not(unix))]
fn file_mode(_: &std::path::Path) -> Result<Option<String>> {
    Ok(None)
}
