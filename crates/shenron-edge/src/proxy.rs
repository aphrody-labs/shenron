// SPDX-License-Identifier: Apache-2.0
//! The Pingora `ProxyHttp` implementation: routing, redirects, ACME challenges, disk cache,
//! upstream selection with failover, and response header rules.

use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

use async_trait::async_trait;
use bytes::Bytes;
use http::{HeaderMap, Method};
use pingora::http::{RequestHeader, ResponseHeader};
use pingora::prelude::*;
use pingora::proxy::FailToProxy;

use crate::cache::{self, Entry, LockGuard, LockOutcome, Zone, ttl_for, vary_hash, vary_names};
use crate::config::ForwardedFor;
use crate::headers::{self, Vars};
use crate::router::{Route, Vhost, normalize_host};
use crate::runtime::Shared;
use crate::state::State;

const ACME_PREFIX: &str = "/.well-known/acme-challenge/";

pub struct EdgeProxy {
    pub shared: Arc<Shared>,
}

struct StorePlan {
    zone: Arc<Zone>,
    key: String,
    status: u16,
    headers: Vec<(String, Vec<u8>)>,
    vary: Vec<String>,
    variance: String,
    ttl: Duration,
}

#[derive(Default)]
struct CacheCtx {
    enabled: bool,
    key: String,
    status: &'static str,
    stale: Option<Entry>,
    lock: Option<LockGuard>,
    plan: Option<StorePlan>,
    body: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct Ctx {
    state: Option<Arc<State>>,
    vhost: Option<Arc<Vhost>>,
    route: Option<Arc<Route>>,
    host: String,
    scheme: &'static str,
    uri: String,
    client_ip: String,
    cache: CacheCtx,
    tried: Vec<usize>,
    picked: Option<usize>,
    upstream: String,
    started: Option<Instant>,
    request_bytes: u64,
}

fn request_host(req: &RequestHeader) -> String {
    let raw = req
        .headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .or_else(|| req.uri.authority().map(http::uri::Authority::as_str))
        .unwrap_or_default();
    normalize_host(raw)
}

fn header_str<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

/// Client address: the socket peer, or `CF-Connecting-IP` / the first `X-Forwarded-For` entry when
/// the peer is one of the trusted proxies.
pub fn client_ip(state: &State, peer: Option<IpAddr>, headers: &HeaderMap) -> String {
    let Some(peer) = peer else { return String::new() };
    if state.is_trusted(peer) {
        let forwarded = header_str(headers, "cf-connecting-ip")
            .or_else(|| header_str(headers, "x-forwarded-for").and_then(|v| v.split(',').next()))
            .and_then(|v| v.trim().parse::<IpAddr>().ok());
        if let Some(ip) = forwarded {
            return ip.to_string();
        }
    }
    peer.to_string()
}

fn status_text(code: u16) -> &'static str {
    match code {
        301 => "Moved Permanently",
        404 => "Not Found",
        413 => "Request Entity Too Large",
        421 => "Misdirected Request",
        _ => "Error",
    }
}

impl EdgeProxy {
    fn server_header(state: &State) -> &str {
        &state.config.server.server_header
    }

    /// Short generated response (redirect, 404, ACME answer).
    async fn respond(
        &self,
        session: &mut Session,
        state: &State,
        status: u16,
        extra: &[(&str, String)],
        content_type: &str,
        body: String,
    ) -> Result<()> {
        let mut resp = ResponseHeader::build(status, Some(6))?;
        resp.insert_header("server", Self::server_header(state))?;
        resp.insert_header("date", httpdate::fmt_http_date(SystemTime::now()))?;
        resp.insert_header("content-type", content_type)?;
        resp.insert_header("content-length", body.len().to_string())?;
        for (name, value) in extra {
            resp.insert_header(name.to_string(), value.clone())?;
        }
        let head_only = session.req_header().method == Method::HEAD;
        session.write_response_header(Box::new(resp), head_only).await?;
        if !head_only {
            session.write_response_body(Some(Bytes::from(body)), true).await?;
        }
        Ok(())
    }

    async fn respond_page(
        &self,
        session: &mut Session,
        state: &State,
        status: u16,
        extra: &[(&str, String)],
    ) -> Result<()> {
        let title = format!("{status} {}", status_text(status));
        let body = format!(
            "<html>\r\n<head><title>{title}</title></head>\r\n<body>\r\n<center><h1>{title}</h1></center>\r\n<hr><center>{}</center>\r\n</body>\r\n</html>\r\n",
            Self::server_header(state)
        );
        self.respond(session, state, status, extra, "text/html", body).await
    }

    fn finalize(&self, resp: &mut ResponseHeader, ctx: &Ctx) {
        let Some(state) = &ctx.state else { return };
        headers::strip_internal(resp);
        let _ = resp.insert_header("server", Self::server_header(state));
        let _ = resp.insert_header("date", httpdate::fmt_http_date(SystemTime::now()));
        let vars = Vars {
            host: &ctx.host,
            scheme: ctx.scheme,
            request_uri: &ctx.uri,
            remote_addr: &ctx.client_ip,
            cache_status: ctx.cache.status,
            upstream_addr: &ctx.upstream,
        };
        if let Some(route) = &ctx.route {
            headers::apply(resp, &route.cfg.headers, &vars);
        }
        if let Some(vhost) = &ctx.vhost {
            headers::apply(resp, &vhost.cfg.headers, &vars);
        }
    }

    async fn serve_entry(
        &self,
        session: &mut Session,
        ctx: &mut Ctx,
        entry: &Entry,
        status: &'static str,
    ) -> Result<()> {
        ctx.cache.status = status;
        let mut resp = ResponseHeader::build(entry.status, Some(entry.headers.len() + 4))?;
        for (name, value) in &entry.headers {
            if matches!(
                name.as_str(),
                "content-length" | "transfer-encoding" | "connection" | "keep-alive"
            ) {
                continue;
            }
            let _ = resp.append_header(name.clone(), value.clone());
        }
        resp.insert_header("content-length", entry.body.len().to_string())?;
        self.finalize(&mut resp, ctx);
        let head_only = session.req_header().method == Method::HEAD || entry.body.is_empty();
        session.write_response_header(Box::new(resp), head_only).await?;
        if !head_only {
            session.write_response_body(Some(Bytes::from(entry.body.clone())), true).await?;
        }
        Ok(())
    }

    /// Cache lookup and lock handling. Returns true when the request was answered from the cache.
    async fn try_cache(
        &self,
        session: &mut Session,
        ctx: &mut Ctx,
        route: &Arc<Route>,
    ) -> Result<bool> {
        let Some(rc) = &route.cache else { return Ok(false) };
        let req = session.req_header();
        let method_ok = req.method == Method::GET || req.method == Method::HEAD;
        if !method_ok {
            return Ok(false);
        }
        let cookie = header_str(&req.headers, "cookie");
        let bypass = cache::bypass(&rc.cfg.bypass, cookie, req.uri.query())
            || req.headers.contains_key("range");
        if bypass {
            ctx.cache.status = "BYPASS";
            return Ok(false);
        }
        let variants: Vec<String> = rc
            .cfg
            .variance
            .iter()
            .map(|rule| cache::variant_value(rule, header_str(&req.headers, &rule.header)))
            .collect();
        ctx.cache.key = cache::build_key(ctx.scheme, &ctx.host, &ctx.uri, &variants);
        ctx.cache.enabled = true;
        let zone = Arc::clone(&rc.zone);
        let headers = req.headers.clone();
        let now = cache::now_secs();
        let first = zone.lookup(&ctx.cache.key, &headers, now).await;
        if let Some(hit) = &first
            && hit.fresh
        {
            let entry = hit.entry.clone();
            self.serve_entry(session, ctx, &entry, "HIT").await?;
            return Ok(true);
        }
        let stale = first.map(|h| h.entry);
        ctx.cache.status = if stale.is_some() { "EXPIRED" } else { "MISS" };
        if !rc.cfg.lock {
            ctx.cache.stale = stale;
            return Ok(false);
        }
        match zone.lock(&ctx.cache.key) {
            LockOutcome::Leader(guard) => {
                ctx.cache.lock = Some(guard);
                ctx.cache.stale = stale;
            },
            LockOutcome::Waiter(mut rx) => {
                if let Some(entry) = stale.as_ref().filter(|_| rc.allows_stale("updating")) {
                    self.serve_entry(session, ctx, entry, "UPDATING").await?;
                    return Ok(true);
                }
                let _ =
                    tokio::time::timeout(rc.cfg.lock_timeout.0, rx.wait_for(|done| *done)).await;
                if let Some(hit) = zone.lookup(&ctx.cache.key, &headers, cache::now_secs()).await
                    && hit.fresh
                {
                    self.serve_entry(session, ctx, &hit.entry, "HIT").await?;
                    return Ok(true);
                }
                ctx.cache.stale = stale;
            },
        }
        Ok(false)
    }
}

#[async_trait]
impl ProxyHttp for EdgeProxy {
    type CTX = Ctx;

    fn new_ctx(&self) -> Ctx {
        Ctx { started: Some(Instant::now()), ..Ctx::default() }
    }

    async fn request_filter(&self, session: &mut Session, ctx: &mut Ctx) -> Result<bool> {
        let state = self.shared.state.load_full();
        ctx.state = Some(Arc::clone(&state));
        ctx.scheme =
            if session.digest().is_some_and(|d| d.ssl_digest.is_some()) { "https" } else { "http" };
        let (host, uri, path, forwarded) = {
            let req = session.req_header();
            let peer =
                session.client_addr().and_then(|a| a.as_inet()).map(std::net::SocketAddr::ip);
            (
                request_host(req),
                req.uri
                    .path_and_query()
                    .map_or_else(|| req.uri.path().to_owned(), |p| p.as_str().to_owned()),
                req.uri.path().to_owned(),
                client_ip(&state, peer, &req.headers),
            )
        };
        ctx.host = host;
        ctx.uri = uri;
        ctx.client_ip = forwarded;

        if ctx.scheme == "http"
            && let Some(token) = path.strip_prefix(ACME_PREFIX)
            && let Some(answer) = self.shared.challenge(token)
        {
            self.respond(session, &state, 200, &[], "text/plain", answer).await?;
            return Ok(true);
        }
        let Some(vhost) = state.router.find(&ctx.host).cloned() else {
            self.respond_page(session, &state, 404, &[]).await?;
            return Ok(true);
        };
        ctx.vhost = Some(Arc::clone(&vhost));

        let redirect_host = vhost.cfg.redirect_to.as_deref();
        let upgrade_to_https = ctx.scheme == "http" && vhost.cfg.redirect_http;
        if redirect_host.is_some() || upgrade_to_https {
            let target = format!("https://{}{}", redirect_host.unwrap_or(&ctx.host), ctx.uri);
            self.respond_page(session, &state, 301, &[("location", target)]).await?;
            return Ok(true);
        }

        let Some(route) = vhost.route(&path).cloned() else {
            self.respond_page(session, &state, 404, &[]).await?;
            return Ok(true);
        };
        ctx.route = Some(Arc::clone(&route));

        if let Some(max) = route.cfg.max_body {
            let declared = header_str(&session.req_header().headers, "content-length")
                .and_then(|v| v.parse::<u64>().ok());
            if declared.is_some_and(|n| n > max.0) {
                self.respond_page(session, &state, 413, &[]).await?;
                return Ok(true);
            }
        }
        self.try_cache(session, ctx, &route).await
    }

    async fn request_body_filter(
        &self,
        _session: &mut Session,
        body: &mut Option<Bytes>,
        _eos: bool,
        ctx: &mut Ctx,
    ) -> Result<()> {
        if let Some(chunk) = body {
            ctx.request_bytes += chunk.len() as u64;
            if let Some(max) = ctx.route.as_ref().and_then(|r| r.cfg.max_body)
                && ctx.request_bytes > max.0
            {
                return Error::e_explain(ErrorType::HTTPStatus(413), "request body too large");
            }
        }
        Ok(())
    }

    async fn upstream_peer(&self, _session: &mut Session, ctx: &mut Ctx) -> Result<Box<HttpPeer>> {
        let route = ctx
            .route
            .clone()
            .ok_or_else(|| Error::explain(ErrorType::InternalError, "no route"))?;
        let pool = &route.pool;
        let index = pool
            .pick(&ctx.tried, Instant::now())
            .ok_or_else(|| Error::explain(ErrorType::HTTPStatus(502), "no upstream available"))?;
        ctx.tried.push(index);
        ctx.picked = Some(index);
        let server = &pool.servers[index];
        ctx.upstream.clone_from(&server.label);
        let mut peer = HttpPeer::new(server.socket_addr(), server.tls, server.sni.clone());
        peer.options.connection_timeout = Some(pool.connect_timeout);
        peer.options.read_timeout = Some(pool.read_timeout);
        peer.options.write_timeout = Some(pool.read_timeout);
        peer.options.idle_timeout = Some(pool.idle_timeout);
        if server.tls && !server.verify {
            peer.options.verify_cert = false;
            peer.options.verify_hostname = false;
        }
        Ok(Box::new(peer))
    }

    async fn upstream_request_filter(
        &self,
        session: &mut Session,
        upstream: &mut RequestHeader,
        ctx: &mut Ctx,
    ) -> Result<()> {
        let (Some(state), Some(route)) = (&ctx.state, &ctx.route) else { return Ok(()) };
        let vars = Vars {
            host: &ctx.host,
            scheme: ctx.scheme,
            request_uri: &ctx.uri,
            remote_addr: &ctx.client_ip,
            cache_status: ctx.cache.status,
            upstream_addr: &ctx.upstream,
        };
        let upstream_host = route
            .cfg
            .upstream_host
            .as_deref()
            .map_or_else(|| ctx.host.clone(), |t| headers::expand(t, &vars));
        upstream.insert_header("host", upstream_host)?;
        upstream.insert_header("x-real-ip", ctx.client_ip.clone())?;
        let forwarded_for = match state.config.server.forwarded_for {
            ForwardedFor::Overwrite => ctx.client_ip.clone(),
            ForwardedFor::Append => {
                let incoming: Vec<&str> = session
                    .req_header()
                    .headers
                    .get_all("x-forwarded-for")
                    .iter()
                    .filter_map(|v| v.to_str().ok())
                    .collect();
                if incoming.is_empty() {
                    ctx.client_ip.clone()
                } else {
                    format!("{}, {}", incoming.join(", "), ctx.client_ip)
                }
            },
        };
        upstream.insert_header("x-forwarded-for", forwarded_for)?;
        upstream.insert_header("x-forwarded-proto", ctx.scheme)?;
        upstream.insert_header("x-forwarded-host", ctx.host.clone())?;
        for (name, template) in &route.cfg.request_headers {
            upstream.insert_header(name.clone(), headers::expand(template, &vars))?;
        }
        Ok(())
    }

    async fn upstream_response_filter(
        &self,
        session: &mut Session,
        upstream: &mut ResponseHeader,
        ctx: &mut Ctx,
    ) -> Result<()> {
        let Some(route) = ctx.route.clone() else { return Ok(()) };
        let status = upstream.status.as_u16();
        if let Some(index) = ctx.picked {
            if route.cfg.failure_statuses.contains(&status) {
                route.pool.report_failure(index, Instant::now());
            } else {
                route.pool.report_success(index);
            }
        }
        let Some(rc) = &route.cache else { return Ok(()) };
        if ctx.cache.stale.is_some() && status >= 500 && rc.allows_stale(&format!("http_{status}"))
        {
            return Error::e_explain(ErrorType::HTTPStatus(status), "serving stale");
        }
        if !ctx.cache.enabled || session.req_header().method != Method::GET {
            return Ok(());
        }
        let Some(vary) = vary_names(&upstream.headers) else { return Ok(()) };
        let Some(ttl) =
            ttl_for(status, &upstream.headers, &rc.valid, rc.cfg.honor_upstream, SystemTime::now())
        else {
            return Ok(());
        };
        let length =
            header_str(&upstream.headers, "content-length").and_then(|v| v.parse::<u64>().ok());
        if length.is_some_and(|n| n > rc.zone.max_object) {
            return Ok(());
        }
        if header_str(&upstream.headers, "content-type")
            .is_some_and(|t| t.starts_with("text/event-stream"))
        {
            return Ok(());
        }
        let variance = vary_hash(&vary, &session.req_header().headers);
        let headers = upstream
            .headers
            .iter()
            .filter(|(name, _)| {
                !name.as_str().starts_with("x-accel-")
                    && !matches!(name.as_str(), "server" | "date")
            })
            .map(|(name, value)| (name.as_str().to_owned(), value.as_bytes().to_vec()))
            .collect();
        ctx.cache.plan = Some(StorePlan {
            zone: Arc::clone(&rc.zone),
            key: ctx.cache.key.clone(),
            status,
            headers,
            vary,
            variance,
            ttl,
        });
        ctx.cache.body = Some(Vec::new());
        Ok(())
    }

    fn upstream_response_body_filter(
        &self,
        _session: &mut Session,
        body: &mut Option<Bytes>,
        eos: bool,
        ctx: &mut Ctx,
    ) -> Result<Option<Duration>> {
        let max = ctx.cache.plan.as_ref().map_or(0, |p| p.zone.max_object);
        if let Some(buffer) = &mut ctx.cache.body
            && let Some(chunk) = body
        {
            if (buffer.len() + chunk.len()) as u64 > max {
                ctx.cache.body = None;
                ctx.cache.plan = None;
            } else {
                buffer.extend_from_slice(chunk);
            }
        }
        if eos && let (Some(plan), Some(buffer)) = (ctx.cache.plan.take(), ctx.cache.body.take()) {
            let entry = Entry {
                status: plan.status,
                headers: plan.headers,
                body: buffer,
                expires_at: cache::now_secs() + plan.ttl.as_secs(),
            };
            let (zone, key, vary, variance) = (plan.zone, plan.key, plan.vary, plan.variance);
            // Waiters on the key are released only once the entry is on disk.
            let guard = ctx.cache.lock.take();
            tokio::spawn(async move {
                if let Err(err) = zone.store(&key, &vary, &variance, &entry).await {
                    tracing::warn!(zone = %zone.name, error = %format!("{err:#}"), "cache store failed");
                }
                drop(guard);
            });
        }
        Ok(None)
    }

    async fn response_filter(
        &self,
        _session: &mut Session,
        upstream: &mut ResponseHeader,
        ctx: &mut Ctx,
    ) -> Result<()> {
        self.finalize(upstream, ctx);
        Ok(())
    }

    fn fail_to_connect(
        &self,
        _session: &mut Session,
        _peer: &HttpPeer,
        ctx: &mut Ctx,
        mut e: Box<Error>,
    ) -> Box<Error> {
        if let (Some(route), Some(index)) = (&ctx.route, ctx.picked) {
            route.pool.report_failure(index, Instant::now());
            if ctx.tried.len() < route.pool.servers.len() {
                e.set_retry(true);
            }
        }
        e
    }

    async fn fail_to_proxy(&self, session: &mut Session, e: &Error, ctx: &mut Ctx) -> FailToProxy {
        let condition = match e.etype() {
            ErrorType::ConnectTimedout | ErrorType::ReadTimedout | ErrorType::WriteTimedout => {
                "timeout".to_owned()
            },
            ErrorType::HTTPStatus(code) => format!("http_{code}"),
            _ => "error".to_owned(),
        };
        let stale_ok = ctx
            .route
            .as_ref()
            .and_then(|r| r.cache.as_ref())
            .is_some_and(|rc| rc.allows_stale(&condition));
        if stale_ok
            && session.response_written().is_none()
            && let Some(entry) = ctx.cache.stale.take()
            && self.serve_entry(session, ctx, &entry, "STALE").await.is_ok()
        {
            return FailToProxy { error_code: entry.status, can_reuse_downstream: false };
        }
        let code = match e.etype() {
            ErrorType::HTTPStatus(code) => *code,
            _ if e.esource() == &ErrorSource::Upstream => 502,
            _ if e.esource() == &ErrorSource::Downstream => 0,
            _ => 500,
        };
        if code > 0 {
            if let Some(state) = ctx.state.clone() {
                let _ = self.respond_page(session, &state, code, &[]).await;
            } else {
                let _ = session.respond_error(code).await;
            }
        }
        FailToProxy { error_code: code, can_reuse_downstream: false }
    }

    async fn logging(&self, session: &mut Session, e: Option<&Error>, ctx: &mut Ctx) {
        ctx.cache.lock = None;
        let status = session.response_written().map_or(0, |r| r.status.as_u16());
        let elapsed = ctx.started.map_or(0, |t| t.elapsed().as_millis());
        let req = session.req_header();
        tracing::info!(
            target: "access",
            client = %ctx.client_ip,
            host = %ctx.host,
            method = %req.method,
            uri = %ctx.uri,
            status,
            cache = ctx.cache.status,
            upstream = %ctx.upstream,
            ms = elapsed,
            error = e.map(ToString::to_string),
        );
    }
}
