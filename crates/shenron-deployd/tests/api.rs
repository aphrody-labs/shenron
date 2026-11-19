// SPDX-License-Identifier: Apache-2.0
//! mTLS API: a client certificate signed by the configured CA is required.

#![cfg(unix)]

use std::net::SocketAddr;
use std::sync::Arc;

use rcgen::{BasicConstraints, CertificateParams, DnType, ExtendedKeyUsagePurpose, IsCa, Issuer, KeyPair, KeyUsagePurpose};
use shenron_deployd::agent::Agent;
use shenron_deployd::config::{ApiConfig, Config};
use shenron_deployd::manifest::{encode_key, generate_signing_key};
use tokio::sync::watch;

struct Pki {
    ca_pem: String,
    server_cert: String,
    server_key: String,
    client_identity: String,
    other_client_identity: String,
}

fn leaf(issuer: &Issuer<'_, KeyPair>, name: &str, usage: ExtendedKeyUsagePurpose, sans: Vec<String>) -> (String, String) {
    let key = KeyPair::generate().unwrap();
    let mut params = CertificateParams::new(sans).unwrap();
    params.distinguished_name.push(DnType::CommonName, name);
    params.extended_key_usages = vec![usage];
    let cert = params.signed_by(&key, issuer).unwrap();
    (cert.pem(), key.serialize_pem())
}

fn ca(name: &str) -> (CertificateParams, KeyPair) {
    let key = KeyPair::generate().unwrap();
    let mut params = CertificateParams::new(Vec::<String>::new()).unwrap();
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
    params.distinguished_name.push(DnType::CommonName, name);
    (params, key)
}

fn pki() -> Pki {
    let (ca_params, ca_key) = ca("deployd test ca");
    let ca_pem = ca_params.self_signed(&ca_key).unwrap().pem();
    let issuer = Issuer::new(ca_params, ca_key);
    let (server_cert, server_key) = leaf(&issuer, "deployd", ExtendedKeyUsagePurpose::ServerAuth, vec!["localhost".into(), "127.0.0.1".into()]);
    let (cc, ck) = leaf(&issuer, "operator", ExtendedKeyUsagePurpose::ClientAuth, vec![]);
    let (other_params, other_key) = ca("rogue ca");
    let other_issuer = Issuer::new(other_params, other_key);
    let (oc, ok) = leaf(&other_issuer, "rogue", ExtendedKeyUsagePurpose::ClientAuth, vec![]);
    Pki { ca_pem, server_cert, server_key, client_identity: format!("{cc}{ck}"), other_client_identity: format!("{oc}{ok}") }
}

fn free_addr() -> SocketAddr {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    l.local_addr().unwrap()
}

#[tokio::test]
async fn api_requires_a_client_certificate_from_the_configured_ca() {
    shenron_deployd::util::ensure_crypto_provider();
    let tmp = tempfile::tempdir().unwrap();
    let pki = pki();
    for (name, content) in [("ca.pem", &pki.ca_pem), ("server.pem", &pki.server_cert), ("server.key", &pki.server_key)] {
        std::fs::write(tmp.path().join(name), content).unwrap();
    }
    let key = generate_signing_key().unwrap();
    let cfg = Config::parse(&format!(
        r#"
        root = "{root}"
        [store]
        kind = "dir"
        path = "{root}/store"
        [trust]
        public_keys = ["{pk}"]
        [[service]]
        name = "demo"
        restart = "none"
        "#,
        root = tmp.path().display(),
        pk = encode_key(&key.verifying_key().to_bytes()),
    ))
    .unwrap();
    let agent = Arc::new(Agent::new(cfg).await.unwrap());
    let listen = free_addr();
    let api = ApiConfig {
        listen,
        cert: tmp.path().join("server.pem"),
        key: tmp.path().join("server.key"),
        client_ca: tmp.path().join("ca.pem"),
    };
    let (stop_tx, stop_rx) = watch::channel(false);
    let server = tokio::spawn({
        let agent = agent.clone();
        async move { shenron_deployd::api::serve(agent, &api, stop_rx).await }
    });
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let client = |identity: Option<&str>| {
        let mut b = reqwest::Client::builder().add_root_certificate(reqwest::Certificate::from_pem(pki.ca_pem.as_bytes()).unwrap());
        if let Some(pem) = identity {
            b = b.identity(reqwest::Identity::from_pem(pem.as_bytes()).unwrap());
        }
        b.build().unwrap()
    };
    let base = format!("https://localhost:{}", listen.port());

    // no certificate: the TLS handshake is refused
    assert!(client(None).get(format!("{base}/v1/status")).send().await.is_err());
    // certificate from another CA: refused too
    assert!(client(Some(&pki.other_client_identity)).get(format!("{base}/v1/status")).send().await.is_err());

    let ok = client(Some(&pki.client_identity));
    let body = ok.get(format!("{base}/v1/status")).send().await.unwrap().error_for_status().unwrap().bytes().await.unwrap();
    let status: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(status["services"][0]["service"], "demo");
    let one = ok.get(format!("{base}/v1/services/demo")).send().await.unwrap();
    assert_eq!(one.status(), 200);
    assert_eq!(ok.get(format!("{base}/v1/services/nope")).send().await.unwrap().status(), 404);
    let queued = ok.post(format!("{base}/v1/services/demo/check")).send().await.unwrap();
    assert_eq!(queued.status(), 202);
    let rollback = ok.post(format!("{base}/v1/services/demo/rollback")).send().await.unwrap();
    assert_eq!(rollback.status(), 500);
    assert!(rollback.text().await.unwrap().contains("no previous release"));

    stop_tx.send(true).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(15), server).await.unwrap().unwrap().unwrap();
}
