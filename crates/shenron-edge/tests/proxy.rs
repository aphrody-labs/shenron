// SPDX-License-Identifier: Apache-2.0
//! End-to-end: a real Pingora server in the test process in front of a scripted origin. Checks the
//! observable contract that the nginx configuration had: cache status headers, bypass rules,
//! stale on error, lock coalescing, failover, redirects and the forwarding headers.
#![allow(clippy::unwrap_used)]

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};

type Counts = Arc<Mutex<HashMap<String, usize>>>;

struct Response {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

impl Response {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(n, _)| n.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

fn get(port: u16, host: &str, path: &str, extra: &[(&str, &str)]) -> Response {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    let mut request = format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n");
    for (name, value) in extra {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).unwrap();
    let mut raw = Vec::new();
    let _ = stream.read_to_end(&mut raw);
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
    let mut lines = head.split("\r\n");
    let status = lines
        .next()
        .unwrap_or_default()
        .split(' ')
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let headers = lines
        .filter_map(|l| l.split_once(':'))
        .map(|(n, v)| (n.trim().to_owned(), v.trim().to_owned()))
        .collect();
    Response { status, headers, body: body.to_owned() }
}

fn count(counts: &Counts, path: &str) -> usize {
    *counts.lock().unwrap().get(path).unwrap_or(&0)
}

fn spawn_origin(port: u16, counts: Counts) {
    std::thread::spawn(move || {
        tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap().block_on(async move {
            let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await.unwrap();
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let counts = Arc::clone(&counts);
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 8192];
                    let mut len = 0;
                    while !buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
                        match socket.read(&mut buf[len..]).await {
                            Ok(0) | Err(_) => return,
                            Ok(n) => len += n,
                        }
                    }
                    let request = String::from_utf8_lossy(&buf[..len]).into_owned();
                    let path = request.split(' ').nth(1).unwrap_or("/").split('?').next().unwrap_or("/").to_owned();
                    let n = {
                        let mut map = counts.lock().unwrap();
                        let slot = map.entry(path.clone()).or_insert(0);
                        *slot += 1;
                        *slot
                    };
                    let (extra, body): (&str, String) = match path.as_str() {
                        "/page" => ("Cache-Control: public, max-age=0, s-maxage=60\r\nX-Powered: origin\r\nX-Accel-Buffering: no\r\n", "page".into()),
                        "/private" => ("Set-Cookie: a=b\r\nCache-Control: public, s-maxage=60\r\n", "private".into()),
                        "/echo" => ("Cache-Control: no-store\r\n", request.clone()),
                        "/slow" => {
                            tokio::time::sleep(Duration::from_millis(400)).await;
                            ("", "slow".into())
                        }
                        "/flaky" if n > 1 => return,
                        "/flaky" => ("", "flaky".into()),
                        _ => ("", "default".into()),
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\nServer: origin\r\n{extra}\r\n{body}",
                        body.len()
                    );
                    let _ = socket.write_all(response.as_bytes()).await;
                });
            }
        });
    });
}

fn edge_config(edge_port: u16, origin_port: u16, cache_dir: &str) -> String {
    format!(
        r#"
[server]
http_listen = ["127.0.0.1:{edge_port}"]
server_header = "test-edge"

[[cache]]
name = "z"
dir = "{cache_dir}"
max_size = "64MiB"

[[pool]]
name = "origin"
read_timeout = "5s"
[[pool.server]]
addr = "127.0.0.1:{origin_port}"
label = "origin-a"

[[pool]]
name = "failover"
connect_timeout = "1s"
[[pool.server]]
addr = "127.0.0.1:{dead}"
label = "dead"
[[pool.server]]
addr = "127.0.0.1:{origin_port}"
label = "live"

[[vhost]]
names = ["www.a.test"]
redirect_to = "a.test"

[[vhost]]
names = ["secure.a.test"]

[[vhost]]
names = ["a.test"]
redirect_http = false
[vhost.headers.default]
"X-Frame-Options" = "SAMEORIGIN"
"X-Content-Type-Options" = "nosniff"

[[vhost.route]]
prefix = "/failover"
pool = "failover"
[vhost.route.headers.add]
"X-Shenron-Upstream" = "$upstream_addr"

[[vhost.route]]
prefix = "/flaky"
pool = "origin"
[vhost.route.headers.add]
"X-Shenron-LB-Cache" = "$cache_status"
[vhost.route.cache]
zone = "z"
valid = [{{ status = [200], ttl = "1s" }}]
use_stale = ["error", "timeout"]

[[vhost.route]]
prefix = "/slow"
pool = "origin"
[vhost.route.headers.add]
"X-Shenron-LB-Cache" = "$cache_status"
[vhost.route.cache]
zone = "z"
valid = [{{ status = [200], ttl = "1m" }}]
lock = true

[[vhost.route]]
prefix = "/"
pool = "origin"
[vhost.route.headers.add]
"X-Shenron-LB-Cache" = "$cache_status"
"X-Shenron-Upstream" = "$upstream_addr"
[vhost.route.cache]
zone = "z"
valid = [{{ status = [200], ttl = "10m" }}]
[vhost.route.cache.bypass]
cookies = ["shenron_session"]
args = ["nocache"]
"#,
        dead = free_port()
    )
}

fn wait_until_up(port: u16) {
    for _ in 0..100 {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    panic!("edge did not start on {port}");
}

#[test]
fn edge_behaves_like_the_nginx_it_replaces() {
    let origin_port = free_port();
    let edge_port = free_port();
    let counts: Counts = Arc::default();
    spawn_origin(origin_port, Arc::clone(&counts));

    let dir = tempfile::tempdir().unwrap();
    let cache_dir = dir.path().join("cache");
    let config_path = dir.path().join("edge.toml");
    std::fs::write(&config_path, edge_config(edge_port, origin_port, cache_dir.to_str().unwrap()))
        .unwrap();
    {
        let path = config_path.clone();
        std::thread::spawn(move || {
            let _ = shenron_edge::server::run(path);
        });
    }
    wait_until_up(edge_port);
    wait_until_up(origin_port);
    std::thread::sleep(Duration::from_millis(500));

    // Cache: MISS, then HIT without touching the origin; upstream header only on the miss.
    let first = get(edge_port, "a.test", "/page", &[]);
    assert_eq!((first.status, first.body.as_str()), (200, "page"));
    assert_eq!(first.header("x-shenron-lb-cache"), Some("MISS"));
    assert_eq!(first.header("x-shenron-upstream"), Some("origin-a"));
    assert_eq!(first.header("server"), Some("test-edge"), "origin Server replaced");
    assert_eq!(first.header("x-accel-buffering"), None, "X-Accel-* never reaches the client");
    assert_eq!(first.header("x-frame-options"), Some("SAMEORIGIN"), "default header filled in");
    std::thread::sleep(Duration::from_millis(300));
    let second = get(edge_port, "a.test", "/page", &[]);
    assert_eq!(second.header("x-shenron-lb-cache"), Some("HIT"));
    assert_eq!(second.header("x-shenron-upstream"), None);
    assert_eq!(second.header("x-powered"), Some("origin"), "stored headers replayed");
    assert_eq!(second.body, "page");
    assert_eq!(count(&counts, "/page"), 1);

    // Bypass by session cookie and by ?nocache=1; both reach the origin and stay uncached.
    let bypass =
        get(edge_port, "a.test", "/page", &[("Cookie", "x=1; __Secure-SHENRON_SESSION=2")]);
    assert_eq!(bypass.header("x-shenron-lb-cache"), Some("BYPASS"));
    let nocache = get(edge_port, "a.test", "/page?nocache=1", &[]);
    assert_eq!(nocache.header("x-shenron-lb-cache"), Some("BYPASS"));
    assert_eq!(count(&counts, "/page"), 3);

    // Set-Cookie responses are never stored.
    get(edge_port, "a.test", "/private", &[]);
    std::thread::sleep(Duration::from_millis(200));
    let again = get(edge_port, "a.test", "/private", &[]);
    assert_eq!(again.header("x-shenron-lb-cache"), Some("MISS"));
    assert_eq!(count(&counts, "/private"), 2);

    // Forwarding headers: Host kept, client address overwrites any spoofed X-Forwarded-For.
    let echo = get(edge_port, "a.test", "/echo", &[("X-Forwarded-For", "6.6.6.6")])
        .body
        .to_ascii_lowercase();
    assert!(echo.contains("host: a.test"), "{echo}");
    assert!(echo.contains("x-forwarded-for: 127.0.0.1\r\n"), "{echo}");
    assert!(echo.contains("x-real-ip: 127.0.0.1"), "{echo}");
    assert!(echo.contains("x-forwarded-proto: http"), "{echo}");
    assert!(echo.contains("x-forwarded-host: a.test"), "{echo}");

    // Failover: the dead first server is skipped within the same request.
    let failover = get(edge_port, "a.test", "/failover", &[]);
    assert_eq!(failover.status, 200);
    assert_eq!(failover.header("x-shenron-upstream"), Some("live"));

    // Stale on error: the entry expires (1s), the origin then drops the connection.
    let flaky = get(edge_port, "a.test", "/flaky", &[]);
    assert_eq!((flaky.status, flaky.body.as_str()), (200, "flaky"));
    std::thread::sleep(Duration::from_millis(2300));
    let stale = get(edge_port, "a.test", "/flaky", &[]);
    assert_eq!((stale.status, stale.body.as_str()), (200, "flaky"));
    assert_eq!(stale.header("x-shenron-lb-cache"), Some("STALE"));

    // Lock: five concurrent misses make one origin request.
    let handles: Vec<_> = (0..5)
        .map(|_| std::thread::spawn(move || get(edge_port, "a.test", "/slow", &[])))
        .collect();
    for handle in handles {
        let response = handle.join().unwrap();
        assert_eq!((response.status, response.body.as_str()), (200, "slow"));
    }
    assert_eq!(count(&counts, "/slow"), 1);

    // Redirects and unknown hosts.
    let www = get(edge_port, "www.a.test", "/x?y=1", &[]);
    assert_eq!(www.status, 301);
    assert_eq!(www.header("location"), Some("https://a.test/x?y=1"));
    let upgrade = get(edge_port, "secure.a.test", "/p", &[]);
    assert_eq!(upgrade.status, 301, "plain HTTP on a TLS vhost is upgraded");
    assert_eq!(upgrade.header("location"), Some("https://secure.a.test/p"));
    assert_eq!(get(edge_port, "other.test", "/", &[]).status, 404);

    // SIGHUP: an invalid file keeps the running configuration, a valid one is picked up.
    let hup = || {
        let status = std::process::Command::new("kill")
            .args(["-HUP", &std::process::id().to_string()])
            .status()
            .unwrap();
        assert!(status.success());
        std::thread::sleep(Duration::from_millis(500));
    };
    std::fs::write(&config_path, "not toml [").unwrap();
    hup();
    assert_eq!(get(edge_port, "a.test", "/page", &[]).header("x-shenron-lb-cache"), Some("HIT"));
    assert_eq!(get(edge_port, "new.test", "/", &[]).status, 404);
    let extended = edge_config(edge_port, origin_port, cache_dir.to_str().unwrap())
        + "\n[[vhost]]\nnames = [\"new.test\"]\nredirect_http = false\n[[vhost.route]]\npool = \"origin\"\n";
    std::fs::write(&config_path, extended).unwrap();
    hup();
    assert_eq!(get(edge_port, "new.test", "/", &[]).body, "default");
}
