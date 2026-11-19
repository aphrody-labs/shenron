// SPDX-License-Identifier: Apache-2.0
//! End-to-end: publisher -> store -> agent against a local static HTTP server and a local health
//! server (axum). Restarts are disabled; the health server answers from the files of the release
//! the `current` symlink points at, which emulates a service that follows the symlink.

#![cfg(unix)]

use std::net::SocketAddr;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use ed25519_dalek::SigningKey;
use shenron_deployd::agent::{Agent, Outcome};
use shenron_deployd::config::{Config, StoreConfig, StoreKind};
use shenron_deployd::manifest::{self, Health, SignedManifest, channel_key, generate_signing_key};
use shenron_deployd::publish::{PublishOptions, publish};
use shenron_deployd::release::Status;
use shenron_deployd::store::Store;
use tempfile::TempDir;
use tokio::net::TcpListener;

const SVC: &str = "demo";

struct Env {
    _tmp: TempDir,
    root: PathBuf,
    store_dir: PathBuf,
    work: PathBuf,
    key: SigningKey,
    publisher: Store,
    store_base: String,
    health_url: String,
}

async fn serve(app: Router) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    addr
}

/// Plain static directory server with ETag, the "HTTPS static directory" store without TLS.
async fn static_server(dir: PathBuf) -> SocketAddr {
    async fn handler(State(dir): State<Arc<PathBuf>>, uri: Uri, headers: HeaderMap) -> Response {
        let rel = uri.path().trim_start_matches('/');
        if rel.contains("..") {
            return StatusCode::BAD_REQUEST.into_response();
        }
        let Ok(bytes) = tokio::fs::read(dir.join(rel)).await else { return StatusCode::NOT_FOUND.into_response() };
        let etag = format!("\"{}\"", shenron_deployd::util::sha256_hex(&bytes));
        if headers.get(header::IF_NONE_MATCH).and_then(|v| v.to_str().ok()) == Some(etag.as_str()) {
            return StatusCode::NOT_MODIFIED.into_response();
        }
        let mut resp = bytes.into_response();
        resp.headers_mut().insert(header::ETAG, HeaderValue::from_str(&etag).unwrap());
        resp
    }
    serve(Router::new().fallback(get(handler)).with_state(Arc::new(dir))).await
}

async fn health_server(root: PathBuf) -> SocketAddr {
    async fn handler(State(root): State<Arc<PathBuf>>) -> StatusCode {
        if root.join("current").join(SVC).join("healthy").is_file() { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE }
    }
    serve(Router::new().route("/health", get(handler)).with_state(Arc::new(root))).await
}

impl Env {
    async fn new() -> Self {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        let store_dir = tmp.path().join("store");
        let work = tmp.path().join("work");
        for d in [&root, &store_dir, &work] {
            std::fs::create_dir_all(d).unwrap();
        }
        let store_addr = static_server(store_dir.clone()).await;
        let health_addr = health_server(root.clone()).await;
        let store_base = format!("http://{store_addr}");
        let publisher = Store::new(&StoreConfig {
            kind: StoreKind::Dir,
            url: None,
            path: Some(store_dir.clone()),
            public_url: Some(store_base.clone()),
            prefix: String::new(),
            bucket: None,
            region: None,
            access_key: None,
            secret_key: None,
            token: None,
        })
        .unwrap();
        Self {
            _tmp: tmp,
            root,
            store_dir,
            work,
            key: generate_signing_key().unwrap(),
            publisher,
            store_base,
            health_url: format!("http://{health_addr}/health"),
        }
    }

    async fn agent(&self) -> Agent {
        self.agent_trusting(&self.key).await
    }

    async fn agent_trusting(&self, key: &SigningKey) -> Agent {
        let cfg = Config::parse(&format!(
            r#"
            root = "{root}"
            poll_interval = "1s"
            [store]
            kind = "http"
            url = "{base}"
            [trust]
            public_keys = ["{pk}"]
            [[service]]
            name = "{SVC}"
            restart = "none"
            keep = 1
            "#,
            root = self.root.display(),
            base = self.store_base,
            pk = manifest::encode_key(&key.verifying_key().to_bytes()),
        ))
        .unwrap();
        Agent::new(cfg).await.unwrap()
    }

    /// Publishes `version`; `healthy` controls whether the marker file the health server looks for ships.
    async fn publish(&self, version: &str, healthy: bool) -> SignedManifest {
        let dir = self.work.join(version);
        std::fs::create_dir_all(&dir).unwrap();
        let bin = dir.join(SVC);
        std::fs::write(&bin, format!("binary {version}")).unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        let mut artifacts = vec![bin];
        if healthy {
            let marker = dir.join("healthy");
            std::fs::write(&marker, "ok").unwrap();
            std::fs::set_permissions(&marker, std::fs::Permissions::from_mode(0o640)).unwrap();
            artifacts.push(marker);
        }
        publish(
            &self.publisher,
            &self.key,
            PublishOptions {
                service: SVC.into(),
                channel: "stable".into(),
                version: version.into(),
                artifacts,
                health: Some(Health { url: self.health_url.clone(), expect_status: 200, retries: 3, interval_ms: 20, timeout_ms: 500 }),
            },
        )
        .await
        .unwrap()
    }

    fn current(&self) -> Option<String> {
        std::fs::read_link(self.root.join("current").join(SVC)).ok().map(|t| t.file_name().unwrap().to_string_lossy().into_owned())
    }

    fn release_exists(&self, version: &str) -> bool {
        self.root.join("releases").join(SVC).join(version).exists()
    }
}

fn mode_of(path: &Path) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path).unwrap().permissions().mode() & 0o777
}

#[tokio::test]
async fn deploys_then_noops_then_upgrades() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", true).await;

    assert_eq!(agent.check(SVC, false).await.unwrap(), Outcome::Deployed { version: "v1".into(), previous: None });
    assert_eq!(env.current().as_deref(), Some("v1"));
    assert_eq!(std::fs::read_to_string(env.root.join("current").join(SVC).join(SVC)).unwrap(), "binary v1");
    assert_eq!(mode_of(&env.root.join("current").join(SVC).join(SVC)), 0o755, "mode comes from the manifest");
    assert_eq!(mode_of(&env.root.join("current").join(SVC).join("healthy")), 0o640);
    assert!(env.root.join("releases").join(SVC).join("v1").join("manifest.json.sig").is_file());
    assert_eq!(agent.check(SVC, false).await.unwrap(), Outcome::NoChange { version: Some("v1".into()) });

    env.publish("v2", true).await;
    assert_eq!(agent.check(SVC, false).await.unwrap(), Outcome::Deployed { version: "v2".into(), previous: Some("v1".into()) });
    assert_eq!(env.current().as_deref(), Some("v2"));

    let state = agent.service(SVC).unwrap().snapshot();
    assert_eq!(state.status, Status::Healthy);
    assert_eq!(state.current.unwrap().version, "v2");
    assert_eq!(state.previous.unwrap().version, "v1");
    let on_disk: serde_json::Value = serde_json::from_slice(&std::fs::read(env.root.join("state").join("demo.json")).unwrap()).unwrap();
    assert_eq!(on_disk["current"]["version"], "v2");

    // a restarted agent resumes from the state file
    let again = env.agent().await;
    assert_eq!(again.service(SVC).unwrap().snapshot().current.unwrap().version, "v2");
}

#[tokio::test]
async fn health_failure_rolls_back_and_the_bad_version_is_not_retried() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", true).await;
    agent.check(SVC, false).await.unwrap();

    env.publish("v2", false).await;
    let outcome = agent.check(SVC, false).await.unwrap();
    let Outcome::RolledBack { version, restored, reason } = outcome else { panic!("expected rollback, got {outcome:?}") };
    assert_eq!((version.as_str(), restored.as_str()), ("v2", "v1"));
    assert!(reason.contains("health probe"), "{reason}");
    assert_eq!(env.current().as_deref(), Some("v1"));

    let state = agent.service(SVC).unwrap().snapshot();
    assert_eq!(state.status, Status::RolledBack);
    assert_eq!(state.current.unwrap().version, "v1");
    assert!(state.failed.contains_key("v2"));

    // the ETag of the bad manifest is remembered: the poll is a no-op
    assert_eq!(agent.check(SVC, false).await.unwrap(), Outcome::NoChange { version: Some("v1".into()) });
    // a restarted agent has no ETag but reads the persisted known-bad list
    let restarted = env.agent().await;
    match restarted.check(SVC, false).await.unwrap() {
        Outcome::Skipped { version, reason } => {
            assert_eq!(version, "v2");
            assert!(reason.contains("known bad"), "{reason}");
        }
        other => panic!("expected skip, got {other:?}"),
    }
    assert_eq!(env.current().as_deref(), Some("v1"));
}

#[tokio::test]
async fn first_deploy_with_failing_health_reports_failed() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", false).await;
    assert!(matches!(agent.check(SVC, false).await.unwrap(), Outcome::Failed { .. }));
    assert_eq!(agent.service(SVC).unwrap().snapshot().status, Status::Failed);
}

#[tokio::test]
async fn sha256_mismatch_is_rejected_before_anything_switches() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", true).await;
    agent.check(SVC, false).await.unwrap();

    env.publish("v2", true).await;
    // same size, different content: only the digest can catch it
    let artifact = env.store_dir.join(SVC).join("releases").join("v2").join(SVC);
    let len = std::fs::metadata(&artifact).unwrap().len() as usize;
    std::fs::write(&artifact, vec![b'X'; len]).unwrap();

    match agent.check(SVC, false).await.unwrap() {
        Outcome::Rejected { version, reason } => {
            assert_eq!(version, "v2");
            assert!(reason.contains("sha256"), "{reason}");
        }
        other => panic!("expected rejection, got {other:?}"),
    }
    assert_eq!(env.current().as_deref(), Some("v1"));
    assert!(!env.release_exists("v2"), "a rejected release leaves nothing behind");
    assert!(agent.service(SVC).unwrap().snapshot().failed.contains_key("v2"));
}

#[tokio::test]
async fn oversized_download_is_rejected() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", true).await;
    std::fs::write(env.store_dir.join(SVC).join("releases").join("v1").join(SVC), vec![b'Y'; 4096]).unwrap();
    assert!(matches!(agent.check(SVC, false).await.unwrap(), Outcome::Rejected { .. }));
    assert_eq!(env.current(), None);
}

#[tokio::test]
async fn manifest_signed_by_an_unpinned_key_is_refused() {
    let env = Env::new().await;
    let stranger = generate_signing_key().unwrap();
    let agent = env.agent_trusting(&stranger).await;
    env.publish("v1", true).await;
    let err = agent.check(SVC, false).await.unwrap_err();
    assert!(format!("{err:#}").contains("signature"), "{err:#}");
    assert_eq!(env.current(), None);
    assert!(!env.release_exists("v1"));
    assert!(agent.service(SVC).unwrap().snapshot().last_error.is_some());
}

#[tokio::test]
async fn tampered_manifest_bytes_are_refused() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", true).await;
    let path = env.store_dir.join(channel_key(SVC, "stable"));
    let text = std::fs::read_to_string(&path).unwrap().replace("\"v1\"", "\"v9\"");
    std::fs::write(&path, text).unwrap();
    assert!(agent.check(SVC, false).await.is_err());
    assert_eq!(env.current(), None);
}

#[tokio::test]
async fn older_signed_manifest_is_a_replay_and_is_skipped() {
    let env = Env::new().await;
    let agent = env.agent().await;
    let v1 = env.publish("v1", true).await;
    env.publish("v2", true).await;
    agent.check(SVC, false).await.unwrap();
    assert_eq!(env.current().as_deref(), Some("v2"));

    // an attacker (or a stale mirror) replays an old, validly signed manifest on the channel
    let mut old = v1.manifest.clone();
    old.created_at = "2020-01-01T00:00:00Z".into();
    let replay = SignedManifest::sign(old, &env.key).unwrap();
    let key = channel_key(SVC, "stable");
    env.publisher.put_bytes(&key, replay.bytes.clone(), "application/json").await.unwrap();
    env.publisher.put_bytes(&format!("{key}.sig"), replay.signature.into_bytes(), "text/plain").await.unwrap();

    match agent.check(SVC, false).await.unwrap() {
        Outcome::Skipped { reason, .. } => assert!(reason.contains("replay"), "{reason}"),
        other => panic!("expected skip, got {other:?}"),
    }
    assert_eq!(env.current().as_deref(), Some("v2"));
}

#[tokio::test]
async fn manual_rollback_and_explicit_redeploy() {
    let env = Env::new().await;
    let agent = env.agent().await;
    env.publish("v1", true).await;
    agent.check(SVC, false).await.unwrap();
    env.publish("v2", true).await;
    agent.check(SVC, false).await.unwrap();

    let out = agent.rollback(SVC).await.unwrap();
    assert_eq!(out, Outcome::RolledBack { version: "v2".into(), restored: "v1".into(), reason: "manual rollback".into() });
    assert_eq!(env.current().as_deref(), Some("v1"));
    let state = agent.service(SVC).unwrap().snapshot();
    assert_eq!(state.previous.unwrap().version, "v2");
    assert!(state.failed["v2"].contains("manual rollback"));
    let restarted = env.agent().await;
    assert!(matches!(restarted.check(SVC, false).await.unwrap(), Outcome::Skipped { .. }), "the channel still says v2: do not flap");
    assert_eq!(env.current().as_deref(), Some("v1"));

    assert_eq!(agent.deploy_version(SVC, "v2").await.unwrap(), Outcome::Deployed { version: "v2".into(), previous: Some("v1".into()) });
    assert_eq!(env.current().as_deref(), Some("v2"));
}

#[tokio::test]
async fn old_releases_are_garbage_collected() {
    let env = Env::new().await;
    let agent = env.agent().await;
    for v in ["v1", "v2", "v3", "v4"] {
        env.publish(v, true).await;
        agent.check(SVC, false).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
    // keep = 1 besides current (v4) and previous (v3)
    assert!(env.release_exists("v4") && env.release_exists("v3") && env.release_exists("v2"));
    assert!(!env.release_exists("v1"));
}

#[tokio::test]
async fn tar_gz_artifacts_are_unpacked() {
    let env = Env::new().await;
    let agent = env.agent().await;
    let src = env.work.join("bundle");
    std::fs::create_dir_all(src.join("sub")).unwrap();
    std::fs::write(src.join("healthy"), "ok").unwrap();
    std::fs::write(src.join("sub").join("file.txt"), "hello").unwrap();
    let archive = env.work.join("bundle.tar.gz");
    let gz = flate2::write::GzEncoder::new(std::fs::File::create(&archive).unwrap(), flate2::Compression::fast());
    let mut builder = tar::Builder::new(gz);
    builder.append_dir_all(".", &src).unwrap();
    builder.into_inner().unwrap().finish().unwrap();
    publish(
        &env.publisher,
        &env.key,
        PublishOptions {
            service: SVC.into(),
            channel: "stable".into(),
            version: "v1".into(),
            artifacts: vec![archive],
            health: Some(Health { url: env.health_url.clone(), expect_status: 200, retries: 2, interval_ms: 10, timeout_ms: 500 }),
        },
    )
    .await
    .unwrap();
    assert!(matches!(agent.check(SVC, false).await.unwrap(), Outcome::Deployed { .. }));
    assert_eq!(std::fs::read_to_string(env.root.join("current").join(SVC).join("sub").join("file.txt")).unwrap(), "hello");
    assert!(!env.root.join("current").join(SVC).join("bundle.tar.gz").exists());
}

/// A store that accepts PUT with a bearer token and serves GET: the `http` backend end to end.
#[tokio::test]
async fn http_store_publishes_with_a_bearer_token_and_the_agent_deploys_from_it() {
    use axum::body::Bytes;
    use axum::routing::put;

    #[derive(Clone)]
    struct Shared {
        dir: Arc<PathBuf>,
        token: &'static str,
    }
    async fn put_object(State(s): State<Shared>, uri: Uri, headers: HeaderMap, body: Bytes) -> StatusCode {
        let ok = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) == Some(&format!("Bearer {}", s.token));
        if !ok {
            return StatusCode::UNAUTHORIZED;
        }
        let path = s.dir.join(uri.path().trim_start_matches('/'));
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
        StatusCode::OK
    }
    async fn get_object(State(s): State<Shared>, uri: Uri) -> Response {
        match std::fs::read(s.dir.join(uri.path().trim_start_matches('/'))) {
            Ok(b) => b.into_response(),
            Err(_) => StatusCode::NOT_FOUND.into_response(),
        }
    }

    let env = Env::new().await;
    let dir = Arc::new(env.work.join("http-store"));
    let shared = Shared { dir: dir.clone(), token: "s3cret-token" };
    let addr = serve(Router::new().fallback_service(put(put_object).get(get_object).with_state(shared))).await;
    let url = format!("http://{addr}/deploy");
    let cfg = |token: Option<&str>| StoreConfig {
        kind: StoreKind::Http,
        url: Some(url.clone()),
        path: None,
        public_url: None,
        prefix: String::new(),
        bucket: None,
        region: None,
        access_key: None,
        secret_key: None,
        token: token.map(str::to_owned),
    };

    let bin = env.work.join("bin").join(SVC);
    std::fs::create_dir_all(bin.parent().unwrap()).unwrap();
    std::fs::write(&bin, b"binary over http").unwrap();
    let marker = env.work.join("bin").join("healthy");
    std::fs::write(&marker, b"ok").unwrap();
    let opts = |_: ()| PublishOptions {
        service: SVC.into(),
        channel: "stable".into(),
        version: "v1".into(),
        artifacts: vec![bin.clone(), marker.clone()],
        health: Some(Health { url: env.health_url.clone(), expect_status: 200, retries: 2, interval_ms: 10, timeout_ms: 500 }),
    };

    let denied = publish(&Store::new(&cfg(None)).unwrap(), &env.key, opts(())).await.unwrap_err();
    assert!(format!("{denied:#}").contains("401"), "{denied:#}");
    publish(&Store::new(&cfg(Some("s3cret-token"))).unwrap(), &env.key, opts(())).await.unwrap();
    assert!(dir.join("deploy").join(SVC).join("channels").join("stable").join("manifest.json.sig").is_file());

    let agent_cfg = Config::parse(&format!(
        r#"
        root = "{root}"
        [store]
        kind = "http"
        url = "{url}"
        [trust]
        public_keys = ["{pk}"]
        [[service]]
        name = "{SVC}"
        restart = "none"
        "#,
        root = env.root.display(),
        pk = manifest::encode_key(&env.key.verifying_key().to_bytes()),
    ))
    .unwrap();
    let agent = Agent::new(agent_cfg).await.unwrap();
    assert!(matches!(agent.check(SVC, false).await.unwrap(), Outcome::Deployed { .. }));
    assert_eq!(std::fs::read_to_string(env.root.join("current").join(SVC).join(SVC)).unwrap(), "binary over http");
}
