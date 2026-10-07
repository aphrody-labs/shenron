// SPDX-License-Identifier: Apache-2.0
//! Hermetic native CLI tests against the shared Shenron HTTP contract.
#![cfg(not(target_arch = "wasm32"))]

use std::io::{Read as _, Write as _};
use std::net::TcpListener;
use std::thread::JoinHandle;
use std::time::Duration;

use assert_cmd::Command;
use predicates::prelude::*;
use serde_json::{Value, json};

fn fixture(content_type: &'static str, body: String) -> (String, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("fixture listener");
    let origin = format!("http://{}", listener.local_addr().expect("fixture address"));
    let handle = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().expect("fixture connection");
        socket.set_read_timeout(Some(Duration::from_secs(10))).expect("fixture timeout");
        let mut request = Vec::new();
        let mut chunk = [0_u8; 4096];
        loop {
            let size = socket.read(&mut chunk).expect("fixture read");
            assert!(size > 0, "client disconnected before sending its request");
            request.extend_from_slice(&chunk[..size]);
            if let Some(end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                let header = std::str::from_utf8(&request[..end]).expect("request headers");
                let length = header
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().expect("request content length"))
                    })
                    .unwrap_or(0);
                if request.len() >= end + 4 + length {
                    break;
                }
            }
        }
        write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
            .expect("fixture response");
        String::from_utf8(request).expect("request UTF-8")
    });
    (origin, handle)
}

fn cli() -> Command {
    let mut cli = Command::cargo_bin("shenron").expect("shenron binary");
    cli.env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .env_remove("ALL_PROXY")
        .env_remove("SHENRON_SESSION_TOKEN");
    cli.timeout(Duration::from_secs(15));
    cli
}

#[test]
fn chat_stream_uses_the_shared_grounded_contract_and_preserves_citations() {
    let frames = concat!(
        "event: meta\ndata: {\"conversationId\":\"conversation:001\",\"streamId\":\"stream_001\"}\n\n",
        "event: delta\ndata: {\"text\":\"Réponse 龍 [1]\"}\n\n",
        "event: done\ndata: {\"finishReason\":\"stop\",\"stored\":true,\"citations\":[{\"n\":1,\"title\":\"Manga\",\"url\":\"https://dragonballfr.com/wiki/manga\"}]}\n\n"
    );
    let (origin, server) = fixture("text/event-stream", frames.to_owned());
    cli()
        .env("SHENRON_SESSION_TOKEN", "test-owner-session")
        .args([
            "chat",
            "Question",
            "--api",
            &origin,
            "--conversation",
            "conversation:001",
            "--no-memory",
            "--model",
            "shenron-chat-v2",
        ])
        .assert()
        .success()
        .stdout(predicate::str::contains("Réponse 龍 [1]"))
        .stdout(predicate::str::contains("[1] Manga — https://dragonballfr.com/wiki/manga"))
        .stderr(predicate::str::contains("conversation: conversation:001"));
    let request = server.join().expect("fixture thread");
    assert!(request.starts_with("POST /api/v1/chat HTTP/1.1"));
    assert!(request.to_ascii_lowercase().contains("authorization: bearer test-owner-session"));
    let (_, body) = request.split_once("\r\n\r\n").expect("request body");
    let body: Value = serde_json::from_str(body).expect("chat request JSON");
    assert_eq!(
        body,
        json!({"message":"Question", "surface":"desktop", "backend":"auto",
        "stream":true, "conversationId":"conversation:001", "memoryOptIn":false, "model":"shenron-chat-v2"})
    );
}

#[test]
fn chat_provider_errors_and_missing_completion_are_not_successes() {
    for body in [
        "event: error\ndata: {\"code\":\"backend_unavailable\",\"message\":\"private diagnostic\"}\n\n",
        "event: delta\ndata: {\"text\":\"incomplete\"}\n\n",
        "event: done\ndata: {\"finishReason\":\"error\"}\n\n",
    ] {
        let (origin, server) = fixture("text/event-stream", body.to_owned());
        cli()
            .args(["chat", "Question", "--api", &origin])
            .assert()
            .failure()
            .stderr(predicate::str::contains("private diagnostic").not());
        server.join().expect("fixture thread");
    }
}

#[test]
fn chat_json_returns_server_persistence_and_memory_metadata() {
    let body = json!({"answer":"Shenron", "meta":{"conversationId":"conversation:001"},
        "done":{"stored":true,"finishReason":"stop","memory":{"recalled":2,"stored":1}},"tools":[]});
    let (origin, server) = fixture("application/json", body.to_string());
    let output = cli()
        .args(["chat", "Question", "--api", &origin, "--json", "--no-rag"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    assert_eq!(serde_json::from_slice::<Value>(&output).expect("response JSON"), body);
    let request = server.join().expect("fixture thread");
    let (_, body) = request.split_once("\r\n\r\n").expect("request body");
    assert_eq!(serde_json::from_str::<Value>(body).unwrap()["stream"], false);
    let request: Value = serde_json::from_str(body).unwrap();
    assert_eq!(request["topK"], 0);
    assert_eq!(request["tools"], false);
    assert_eq!(request["ragOptIn"], false);
}

#[test]
fn conversations_and_memories_use_the_server_owner_scope() {
    for (args, expected) in [
        (vec!["conversations", "list"], "/api/v1/conversations"),
        (
            vec!["conversations", "show", "conversation:001"],
            "/api/v1/conversations/conversation:001",
        ),
        (
            vec!["memory", "list", "--query", "Dragon Ball", "--limit", "5"],
            "/api/v1/memory?limit=5&q=Dragon+Ball",
        ),
        (vec!["models"], "/api/v1/models"),
    ] {
        let (origin, server) = fixture("application/json", "{}".to_owned());
        cli().args(args).args(["--api", &origin]).assert().success();
        let request = server.join().expect("fixture thread");
        assert!(request.starts_with(&format!("GET {expected} HTTP/1.1")), "{request}");
        assert!(!request.to_ascii_lowercase().contains("x-shenron-owner:"));
    }
}

#[test]
fn chat_rejects_invalid_identifiers_and_credential_urls_before_network() {
    cli().args(["conversations", "show", "../secret"]).assert().failure();
    cli()
        .args(["chat", "Question", "--api", "https://user:test-secret@example.test"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("test-secret").not());
}
