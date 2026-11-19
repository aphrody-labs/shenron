// SPDX-License-Identifier: Apache-2.0
//! Artifact store: a directory (served by any static HTTPS server), a plain HTTP(S) server, or an
//! S3 compatible service (Garage, MinIO, R2) with a minimal SigV4 signer.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use hmac::{Hmac, KeyInit, Mac};
use reqwest::{Client, StatusCode, Url};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use tokio::io::AsyncWriteExt;
use tokio_util::io::ReaderStream;

use crate::config::{StoreConfig, StoreKind, env_secret};
use crate::util::{Integrity, hash_file, sha256_hex, write_atomic};

const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[derive(Debug)]
pub enum Fetch {
    Body { bytes: Vec<u8>, etag: Option<String> },
    NotModified,
    Missing,
}

#[derive(Debug, Clone)]
struct Credentials {
    access: String,
    secret: String,
}

#[derive(Debug, Clone)]
enum Backend {
    Dir { root: PathBuf, public: Option<String> },
    Http { base: String, public: String, token: Option<String> },
    S3 { endpoint: String, bucket: String, region: String, public: String, creds: Option<Credentials> },
}

#[derive(Debug, Clone)]
pub struct Store {
    backend: Backend,
    prefix: String,
    client: Client,
}

impl Store {
    pub fn new(cfg: &StoreConfig) -> Result<Self> {
        crate::util::ensure_crypto_provider();
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(60))
            .user_agent(concat!("shenron-deployd/", env!("CARGO_PKG_VERSION")))
            .build()?;
        let trim = |s: &str| s.trim_end_matches('/').to_owned();
        let backend = match cfg.kind {
            StoreKind::Dir => Backend::Dir {
                root: cfg.path.clone().context("store.path is required for kind = \"dir\"")?,
                public: cfg.public_url.as_deref().map(trim),
            },
            StoreKind::Http => {
                let base = trim(cfg.url.as_deref().context("store.url is required for kind = \"http\"")?);
                let token = match &cfg.token {
                    Some(t) => Some(t.clone()),
                    None => env_secret("SHENRON_DEPLOYD_STORE_TOKEN")?,
                };
                Backend::Http { public: cfg.public_url.as_deref().map(trim).unwrap_or_else(|| base.clone()), base, token }
            }
            StoreKind::S3 => {
                let endpoint = trim(cfg.url.as_deref().context("store.url (endpoint) is required for kind = \"s3\"")?);
                let bucket = cfg.bucket.clone().context("store.bucket is required for kind = \"s3\"")?;
                let region = cfg.region.clone().context("store.region is required for kind = \"s3\"")?;
                let access = match &cfg.access_key {
                    Some(v) => Some(v.clone()),
                    None => env_secret("SHENRON_DEPLOYD_S3_ACCESS_KEY")?,
                };
                let secret = match &cfg.secret_key {
                    Some(v) => Some(v.clone()),
                    None => env_secret("SHENRON_DEPLOYD_S3_SECRET_KEY")?,
                };
                let creds = match (access, secret) {
                    (Some(access), Some(secret)) => Some(Credentials { access, secret }),
                    (None, None) => None,
                    _ => bail!("S3 access key and secret key must be set together"),
                };
                let public = cfg.public_url.as_deref().map(trim).unwrap_or_else(|| format!("{endpoint}/{bucket}"));
                Backend::S3 { endpoint, bucket, region, public, creds }
            }
        };
        Ok(Self { backend, prefix: cfg.prefix.trim_matches('/').to_owned(), client })
    }

    fn full_key(&self, key: &str) -> String {
        if self.prefix.is_empty() { key.to_owned() } else { format!("{}/{key}", self.prefix) }
    }

    /// URL the agents download `key` from (written into manifests).
    pub fn public_url(&self, key: &str) -> Result<String> {
        let k = self.full_key(key);
        Ok(match &self.backend {
            Backend::Dir { root, public } => match public {
                Some(p) => format!("{p}/{k}"),
                None => {
                    let abs = std::path::absolute(root.join(&k))?;
                    Url::from_file_path(&abs).map_err(|()| anyhow::anyhow!("not an absolute path: {}", abs.display()))?.to_string()
                }
            },
            Backend::Http { public, .. } | Backend::S3 { public, .. } => format!("{public}/{k}"),
        })
    }

    fn write_url(&self, key: &str) -> Result<String> {
        let k = self.full_key(key);
        Ok(match &self.backend {
            Backend::Dir { .. } => bail!("dir store has no write URL"),
            Backend::Http { base, .. } => format!("{base}/{k}"),
            Backend::S3 { endpoint, bucket, .. } => format!("{endpoint}/{bucket}/{k}"),
        })
    }

    fn dir_path(&self, key: &str) -> Option<PathBuf> {
        match &self.backend {
            Backend::Dir { root, .. } => Some(root.join(self.full_key(key))),
            _ => None,
        }
    }

    pub async fn put_bytes(&self, key: &str, bytes: Vec<u8>, content_type: &str) -> Result<()> {
        if let Some(path) = self.dir_path(key) {
            return write_atomic(&path, &bytes).await;
        }
        let url = self.write_url(key)?;
        let sha = sha256_hex(&bytes);
        let len = bytes.len();
        let req = self.client.put(&url).header("content-type", content_type).header("content-length", len).body(bytes);
        self.send_write(req, "PUT", &url, &sha).await.with_context(|| format!("put {key}"))
    }

    /// Streams a local file; `sha256` is its known digest (SigV4 payload hash).
    pub async fn put_file(&self, key: &str, path: &Path, sha256: &str, size: u64) -> Result<()> {
        if let Some(dest) = self.dir_path(key) {
            if let Some(dir) = dest.parent() {
                tokio::fs::create_dir_all(dir).await?;
            }
            let tmp = dest.with_extension(format!("{}.tmp", std::process::id()));
            tokio::fs::copy(path, &tmp).await?;
            tokio::fs::rename(&tmp, &dest).await?;
            return Ok(());
        }
        let url = self.write_url(key)?;
        let file = tokio::fs::File::open(path).await.with_context(|| format!("open {}", path.display()))?;
        let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
        let req = self.client.put(&url).header("content-type", "application/octet-stream").header("content-length", size).body(body);
        self.send_write(req, "PUT", &url, sha256).await.with_context(|| format!("put {key}"))
    }

    async fn send_write(&self, req: reqwest::RequestBuilder, method: &str, url: &str, payload_sha: &str) -> Result<()> {
        let req = match &self.backend {
            Backend::Http { token: Some(t), .. } => req.bearer_auth(t),
            Backend::S3 { region, creds, .. } => {
                let creds = creds.as_ref().context("S3 credentials are required to publish (SHENRON_DEPLOYD_S3_ACCESS_KEY / _SECRET_KEY)")?;
                sign_request(req, method, url, payload_sha, creds, region)?
            }
            _ => req,
        };
        let resp = req.send().await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            bail!("store answered {status}: {}", body.chars().take(300).collect::<String>());
        }
        Ok(())
    }

    /// Conditional GET of a small object (manifests).
    pub async fn get(&self, key: &str, if_none_match: Option<&str>) -> Result<Fetch> {
        if let Some(path) = self.dir_path(key) {
            return read_dir_object(&path, if_none_match).await;
        }
        let url = self.public_url(key)?;
        if let Some(path) = file_url_path(&url) {
            return read_dir_object(&path, if_none_match).await;
        }
        let mut req = self.authorize_read(self.client.get(&url), &url)?.timeout(Duration::from_secs(30));
        if let Some(etag) = if_none_match {
            req = req.header("if-none-match", etag);
        }
        let resp = req.send().await?;
        match resp.status() {
            StatusCode::NOT_MODIFIED => Ok(Fetch::NotModified),
            StatusCode::NOT_FOUND => Ok(Fetch::Missing),
            s if s.is_success() => {
                let etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(str::to_owned);
                Ok(Fetch::Body { bytes: resp.bytes().await?.to_vec(), etag })
            }
            s => bail!("GET {url} answered {s}"),
        }
    }

    /// Streams `url` into `dest`, returning `(sha256, size)`. Aborts when the body outgrows `max_size`.
    pub async fn download(&self, url: &str, dest: &Path, max_size: u64) -> Result<(String, u64)> {
        if let Some(src) = file_url_path(url) {
            tokio::fs::copy(&src, dest).await.with_context(|| format!("copy {}", src.display()))?;
            return hash_file(dest).await;
        }
        let resp = self.authorize_read(self.client.get(url), url)?.send().await?;
        if !resp.status().is_success() {
            bail!("GET {url} answered {}", resp.status());
        }
        let mut file = tokio::fs::File::create(dest).await?;
        let mut hasher = Sha256::new();
        let mut size = 0u64;
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            size += chunk.len() as u64;
            if size > max_size {
                return Err(Integrity(format!("download exceeds the declared size of {max_size} bytes")).into());
            }
            hasher.update(&chunk);
            file.write_all(&chunk).await?;
        }
        file.flush().await?;
        Ok((hex::encode(hasher.finalize()), size))
    }

    /// Adds the credentials of the store, only when `url` lives on the store itself.
    fn authorize_read(&self, req: reqwest::RequestBuilder, url: &str) -> Result<reqwest::RequestBuilder> {
        Ok(match &self.backend {
            Backend::Http { base, public, token: Some(t) } if url.starts_with(base.as_str()) || url.starts_with(public.as_str()) => {
                req.bearer_auth(t)
            }
            Backend::S3 { endpoint, region, creds: Some(creds), .. } if url.starts_with(endpoint.as_str()) => {
                sign_request(req, "GET", url, EMPTY_SHA256, creds, region)?
            }
            _ => req,
        })
    }
}

fn file_url_path(url: &str) -> Option<PathBuf> {
    Url::parse(url).ok().filter(|u| u.scheme() == "file").and_then(|u| u.to_file_path().ok())
}

async fn read_dir_object(path: &Path, if_none_match: Option<&str>) -> Result<Fetch> {
    let meta = match tokio::fs::metadata(path).await {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Fetch::Missing),
        Err(e) => return Err(e).with_context(|| format!("stat {}", path.display())),
    };
    let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos());
    let etag = format!("\"{mtime:x}-{:x}\"", meta.len());
    if if_none_match == Some(etag.as_str()) {
        return Ok(Fetch::NotModified);
    }
    Ok(Fetch::Body { bytes: tokio::fs::read(path).await?, etag: Some(etag) })
}

fn amz_date(now: OffsetDateTime) -> String {
    format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}Z",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

fn sign_request(
    req: reqwest::RequestBuilder,
    method: &str,
    url: &str,
    payload_sha: &str,
    creds: &Credentials,
    region: &str,
) -> Result<reqwest::RequestBuilder> {
    let parsed = Url::parse(url)?;
    let host = match parsed.port() {
        Some(p) => format!("{}:{p}", parsed.host_str().context("url has no host")?),
        None => parsed.host_str().context("url has no host")?.to_owned(),
    };
    let date = amz_date(OffsetDateTime::now_utc());
    let headers = vec![
        ("host".to_owned(), host),
        ("x-amz-content-sha256".to_owned(), payload_sha.to_owned()),
        ("x-amz-date".to_owned(), date.clone()),
    ];
    let (auth, _) = sigv4(method, &parsed, &headers, payload_sha, creds, region, &date);
    Ok(req.header("x-amz-date", date).header("x-amz-content-sha256", payload_sha).header("authorization", auth))
}

fn hmac(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut m = <Hmac<Sha256> as KeyInit>::new_from_slice(key).expect("hmac accepts any key length");
    m.update(data);
    m.finalize().into_bytes().to_vec()
}

/// AWS Signature Version 4 for S3. `headers` are the signed headers (lowercase names).
/// Returns the `Authorization` header value and the bare signature.
fn sigv4(
    method: &str,
    url: &Url,
    headers: &[(String, String)],
    payload_sha: &str,
    creds: &Credentials,
    region: &str,
    amz_date: &str,
) -> (String, String) {
    let mut headers = headers.to_vec();
    headers.sort();
    let canonical_headers: String = headers.iter().map(|(k, v)| format!("{k}:{}\n", v.trim())).collect();
    let signed_headers = headers.iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>().join(";");
    let mut query: Vec<&str> = url.query().map(|q| q.split('&').collect()).unwrap_or_default();
    query.sort_unstable();
    let canonical = format!("{method}\n{}\n{}\n{canonical_headers}\n{signed_headers}\n{payload_sha}", url.path(), query.join("&"));
    let day = &amz_date[..8];
    let scope = format!("{day}/{region}/s3/aws4_request");
    let to_sign = format!("AWS4-HMAC-SHA256\n{amz_date}\n{scope}\n{}", sha256_hex(canonical.as_bytes()));
    let k_date = hmac(format!("AWS4{}", creds.secret).as_bytes(), day.as_bytes());
    let k_region = hmac(&k_date, region.as_bytes());
    let k_service = hmac(&k_region, b"s3");
    let k_signing = hmac(&k_service, b"aws4_request");
    let signature = hex::encode(hmac(&k_signing, to_sign.as_bytes()));
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
        creds.access
    );
    (auth, signature)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sigv4_matches_the_aws_documentation_example() {
        let creds = Credentials {
            access: "AKIAIOSFODNN7EXAMPLE".into(),
            secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".into(),
        };
        let url = Url::parse("https://examplebucket.s3.amazonaws.com/test.txt").unwrap();
        let headers = vec![
            ("host".to_owned(), "examplebucket.s3.amazonaws.com".to_owned()),
            ("range".to_owned(), "bytes=0-9".to_owned()),
            ("x-amz-content-sha256".to_owned(), EMPTY_SHA256.to_owned()),
            ("x-amz-date".to_owned(), "20130524T000000Z".to_owned()),
        ];
        let (_, sig) = sigv4("GET", &url, &headers, EMPTY_SHA256, &creds, "us-east-1", "20130524T000000Z");
        assert_eq!(sig, "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
    }

    #[tokio::test]
    async fn dir_store_roundtrip_with_etag() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = StoreConfig {
            kind: StoreKind::Dir,
            url: None,
            path: Some(dir.path().to_path_buf()),
            public_url: None,
            prefix: "p".into(),
            bucket: None,
            region: None,
            access_key: None,
            secret_key: None,
            token: None,
        };
        let store = Store::new(&cfg).unwrap();
        store.put_bytes("a/b.json", b"hello".to_vec(), "application/json").await.unwrap();
        let etag = match store.get("a/b.json", None).await.unwrap() {
            Fetch::Body { bytes, etag } => {
                assert_eq!(bytes, b"hello");
                etag.unwrap()
            }
            other => panic!("unexpected {other:?}"),
        };
        assert!(matches!(store.get("a/b.json", Some(&etag)).await.unwrap(), Fetch::NotModified));
        assert!(matches!(store.get("nope", None).await.unwrap(), Fetch::Missing));
        assert!(store.public_url("a/b.json").unwrap().starts_with("file://"));
    }
}
