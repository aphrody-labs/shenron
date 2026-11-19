// SPDX-License-Identifier: Apache-2.0
//! ACME (RFC 8555) with HTTP-01 through `instant-acme`. The challenge answer is served by the
//! proxy on the plain HTTP listener from `Shared::challenges`; the issued chain and key are written
//! under `acme.storage_dir/<certificate>/` and picked up by the hot-reloading certificate store.

use std::path::Path;

use anyhow::{Context, Result, bail};
use instant_acme::{
    Account, AccountCredentials, AuthorizationStatus, ChallengeType, Identifier, NewAccount,
    NewOrder, OrderStatus, RetryPolicy,
};

use crate::config::{AcmeConfig, CertConfig};
use crate::runtime::Shared;
use crate::tls::{cert_paths, load_pem, seconds_to_expiry};

/// Seconds before expiry at which a certificate is renewed.
fn renewal_threshold(acme: &AcmeConfig) -> i64 {
    i64::try_from(acme.renew_before.0.as_secs()).unwrap_or(i64::MAX)
}

pub async fn run_cycle(shared: &Shared) {
    let state = shared.state.load_full();
    let config = &state.config;
    let Some(acme) = &config.acme else { return };
    for cert in config.certificates.iter().filter(|c| c.acme) {
        let Some((cert_path, key_path)) = cert_paths(cert, Some(acme)) else { continue };
        let remaining =
            load_pem(&cert_path, &key_path).ok().and_then(|k| seconds_to_expiry(&k).ok());
        if remaining.is_some_and(|s| s > renewal_threshold(acme)) {
            continue;
        }
        tracing::info!(certificate = %cert.name, remaining_secs = ?remaining, "requesting a certificate");
        match issue(shared, acme, cert, &cert_path, &key_path).await {
            Ok(()) => match shared.certs.reload(config) {
                Ok(()) => tracing::info!(certificate = %cert.name, "certificate installed"),
                Err(err) => {
                    tracing::error!(certificate = %cert.name, error = %format!("{err:#}"), "reload after issuance failed")
                },
            },
            Err(err) => {
                tracing::error!(certificate = %cert.name, error = %format!("{err:#}"), "ACME issuance failed")
            },
        }
    }
}

async fn account(acme: &AcmeConfig) -> Result<Account> {
    let path = acme.storage_dir.join("account.json");
    if let Ok(raw) = tokio::fs::read(&path).await {
        let credentials: AccountCredentials =
            serde_json::from_slice(&raw).context("reading account.json")?;
        return Ok(Account::builder()?.from_credentials(credentials).await?);
    }
    let contact: Vec<&str> = acme.contact.iter().map(String::as_str).collect();
    let (account, credentials) = Account::builder()?
        .create(
            &NewAccount {
                contact: &contact,
                terms_of_service_agreed: true,
                only_return_existing: false,
            },
            acme.directory_url.clone(),
            None,
        )
        .await?;
    write_private(&path, &serde_json::to_vec_pretty(&credentials)?).await?;
    Ok(account)
}

async fn write_private(path: &Path, data: &[u8]) -> Result<()> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let tmp = path.with_extension("tmp");
    tokio::fs::write(&tmp, data).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        tokio::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600)).await?;
    }
    tokio::fs::rename(&tmp, path).await?;
    Ok(())
}

async fn issue(
    shared: &Shared,
    acme: &AcmeConfig,
    cert: &CertConfig,
    cert_path: &Path,
    key_path: &Path,
) -> Result<()> {
    let account = account(acme).await?;
    let identifiers: Vec<Identifier> =
        cert.domains.iter().map(|d| Identifier::Dns(d.clone())).collect();
    let mut order = account.new_order(&NewOrder::new(&identifiers)).await?;
    let mut tokens = Vec::new();
    let result = async {
        let mut authorizations = order.authorizations();
        while let Some(authz) = authorizations.next().await {
            let mut authz = authz?;
            match &authz.status {
                AuthorizationStatus::Pending => {},
                AuthorizationStatus::Valid => continue,
                other => bail!("authorization in state {other:?}"),
            }
            let mut challenge = authz
                .challenge(ChallengeType::Http01)
                .context("the CA offers no http-01 challenge")?;
            let token = challenge.token.clone();
            let answer = challenge.key_authorization().as_str().to_owned();
            shared
                .challenges
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .insert(token.clone(), answer);
            tokens.push(token);
            challenge.set_ready().await?;
        }
        let status = order.poll_ready(&RetryPolicy::default()).await?;
        if status != OrderStatus::Ready {
            bail!("order ended in state {status:?}");
        }
        let key_pem = order.finalize().await?;
        let chain_pem = order.poll_certificate(&RetryPolicy::default()).await?;
        Ok::<_, anyhow::Error>((chain_pem, key_pem))
    }
    .await;
    {
        let mut map = shared.challenges.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        for token in &tokens {
            map.remove(token);
        }
    }
    let (chain_pem, key_pem) = result?;
    write_private(key_path, key_pem.as_bytes()).await?;
    write_private(cert_path, chain_pem.as_bytes()).await?;
    Ok(())
}
