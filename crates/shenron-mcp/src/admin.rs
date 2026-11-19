// SPDX-License-Identifier: Apache-2.0
//! Admin data-plane tools (`db.*`, `redis.*`, `memory.*`): configuration, caller identity, caps,
//! rate limit and audit. The tools themselves live in [`crate::admin_tools`].
//!
//! The group is admin-only: it is registered in the full tool set and removed from the public one
//! (see [`is_admin_tool`]), so an anonymous caller neither lists nor calls it.
//!
//! # Configuration (process environment, every value optional)
//!
//! | Variable | Default | Role |
//! | --- | --- | --- |
//! | `SHENRON_MCP_DATABASE_URL`, else `DATABASE_URL` | none | PostgreSQL DSN of the `db.*` tools; use a dedicated least-privilege role |
//! | `SHENRON_MCP_REDIS_URL`, else `REDIS_URL` | none | Redis URL of the `redis.*` tools |
//! | `SHENRON_MCP_DB_POOL_SIZE` | 4 | PostgreSQL pool size (1 to 32) |
//! | `SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS` | 15000 | statement timeout, also the ceiling of a per-call `timeout_ms` (100 to 120000) |
//! | `SHENRON_MCP_DB_MAX_ROWS` | 500 | row cap of one call (1 to 5000) |
//! | `SHENRON_MCP_MAX_RESPONSE_BYTES` | 262144 | byte cap of one tool response (1024 to 4194304) |
//! | `SHENRON_MCP_REDIS_TIMEOUT_MS` | 5000 | timeout of one Redis command (100 to 60000) |
//! | `SHENRON_MCP_REDIS_MAX_KEYS` | 200 | key and element cap of `redis.scan` and `redis.get` (1 to 5000) |
//! | `SHENRON_MCP_RATE_LIMIT_PER_MIN` | 120 | admin calls per caller and minute (at least 1) |
//! | `SHENRON_MCP_AUDIT_TABLE` | `bot.shenron_mcp_audit` | audit table, created by `deploy/sql/20261119_shenron_mcp_audit.sql` |
//! | `SHENRON_MCP_LISTEN_CHANNELS` | `shenron_mcp_table` | comma-separated NOTIFY channels the live task LISTENs on (set empty to disable) |
//! | `SHENRON_MCP_MEMORY_PATH` | `$SHENRON_HOME/mcp-memory.sqlite` (`~/.shenron` when unset) | SQLite file of `memory.learn` and `memory.recall` |
//! | `SHENRON_MCP_MEMORY_AGENT` | `shenron-mcp` | owner id of the stored facts |

use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};

use rmcp::{RoleServer, model::CallToolResult, service::RequestContext};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::OnceCell;

use crate::{admin_live::Hub, admin_pg, admin_sql, dragonball_tools};

/// Name prefixes of the admin tool group.
pub const ADMIN_PREFIXES: [&str; 3] = ["db.", "redis.", "memory."];

/// Is `name` a tool of the admin data-plane group?
#[must_use]
pub fn is_admin_tool(name: &str) -> bool {
    ADMIN_PREFIXES.iter().any(|prefix| name.starts_with(prefix))
}

/// Who is calling: a token id (`token:<12 hex of blake3>`, never the token), a client address
/// (`ip:<addr>`) or `stdio`. The HTTP layer attaches it to each request as an extension.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Caller(pub String);

impl Caller {
    /// The local stdio client.
    #[must_use]
    pub fn stdio() -> Self {
        Self("stdio".to_owned())
    }

    /// A bearer-token caller, identified by a short hash of the token.
    #[must_use]
    pub fn token(token: &str) -> Self {
        let hash = blake3::hash(token.as_bytes()).to_hex();
        Self(format!("token:{}", &hash.as_str()[..12]))
    }

    /// An allow-listed address.
    #[must_use]
    pub fn ip(addr: std::net::IpAddr) -> Self {
        Self(format!("ip:{}", addr.to_canonical()))
    }
}

/// The caller of a request context (`stdio` without an HTTP request).
#[must_use]
pub fn caller_of(context: &RequestContext<RoleServer>) -> String {
    context
        .extensions
        .get::<axum::http::request::Parts>()
        .and_then(|parts| parts.extensions.get::<Caller>())
        .map_or_else(|| Caller::stdio().0, |caller| caller.0.clone())
}

/// A key for the client behind a request: its MCP session id over HTTP, `stdio` otherwise.
#[must_use]
pub fn session_of(context: &RequestContext<RoleServer>) -> String {
    context
        .extensions
        .get::<axum::http::request::Parts>()
        .and_then(|parts| parts.headers.get("mcp-session-id"))
        .and_then(|value| value.to_str().ok())
        .map_or_else(|| Caller::stdio().0, str::to_owned)
}

/// Settings of the admin tools (see the module documentation for the variables).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    /// PostgreSQL DSN.
    pub database_url: Option<String>,
    /// Redis URL.
    pub redis_url: Option<String>,
    /// PostgreSQL pool size.
    pub pool_size: usize,
    /// Statement timeout and per-call ceiling.
    pub statement_timeout_ms: u64,
    /// Row cap.
    pub max_rows: usize,
    /// Response byte cap.
    pub max_bytes: usize,
    /// Redis command timeout.
    pub redis_timeout_ms: u64,
    /// Redis key and element cap.
    pub redis_max_keys: usize,
    /// Admin calls per caller and minute.
    pub rate_per_minute: u32,
    /// Audit table, already quoted for SQL.
    pub audit_table: String,
    /// NOTIFY channels to LISTEN on.
    pub listen_channels: Vec<String>,
    /// Whether the channel list was set explicitly (starts the live task at boot).
    pub listen_explicit: bool,
    /// SQLite file of the memory store.
    pub memory_path: PathBuf,
    /// Owner id of stored facts.
    pub memory_agent: String,
}

/// Default NOTIFY channel of the opt-in table-change trigger (`deploy/sql/20261119_shenron_mcp_notify.sql`).
pub const TABLE_CHANNEL: &str = "shenron_mcp_table";

fn number<T: std::str::FromStr + Ord + Copy>(
    get: &impl Fn(&str) -> Option<String>,
    name: &str,
    default: T,
    min: T,
    max: T,
) -> T {
    get(name)
        .and_then(|raw| raw.trim().parse::<T>().ok())
        .map_or(default, |value| value.clamp(min, max))
}

impl Config {
    /// The configuration of the process environment.
    #[must_use]
    pub fn from_env() -> Self {
        Self::from_environment(|name| std::env::var(name).ok())
    }

    /// The configuration read through `get`. Blank values count as unset, except
    /// `SHENRON_MCP_LISTEN_CHANNELS`, where a blank value disables the live task.
    #[must_use]
    pub fn from_environment(get: impl Fn(&str) -> Option<String>) -> Self {
        let raw = get;
        let get = |name: &str| {
            raw(name).map(|value| value.trim().to_owned()).filter(|value| !value.is_empty())
        };
        let first = |names: &[&str]| names.iter().find_map(|name| get(name));
        let audit_table = get("SHENRON_MCP_AUDIT_TABLE")
            .and_then(|raw| admin_sql::qualified_ident(&raw).ok())
            .unwrap_or_else(|| "\"bot\".\"shenron_mcp_audit\"".to_owned());
        let (listen_channels, listen_explicit) = match raw("SHENRON_MCP_LISTEN_CHANNELS") {
            Some(raw) => (
                raw.split(',')
                    .map(str::trim)
                    .filter(|channel| admin_sql::is_channel(channel))
                    .map(str::to_owned)
                    .collect(),
                true,
            ),
            None => (vec![TABLE_CHANNEL.to_owned()], false),
        };
        let memory_path = get("SHENRON_MCP_MEMORY_PATH").map(PathBuf::from).unwrap_or_else(|| {
            let home = get("SHENRON_HOME").map(PathBuf::from).unwrap_or_else(|| {
                first(&["HOME", "USERPROFILE"])
                    .map_or_else(|| PathBuf::from("."), PathBuf::from)
                    .join(".shenron")
            });
            home.join("mcp-memory.sqlite")
        });
        Self {
            database_url: first(&["SHENRON_MCP_DATABASE_URL", "DATABASE_URL"]),
            redis_url: first(&["SHENRON_MCP_REDIS_URL", "REDIS_URL"]),
            pool_size: number(&get, "SHENRON_MCP_DB_POOL_SIZE", 4, 1, 32),
            statement_timeout_ms: number(&get, "SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS", 15_000, 100, 120_000),
            max_rows: number(&get, "SHENRON_MCP_DB_MAX_ROWS", 500, 1, 5000),
            max_bytes: number(&get, "SHENRON_MCP_MAX_RESPONSE_BYTES", 262_144, 1024, 4 << 20),
            redis_timeout_ms: number(&get, "SHENRON_MCP_REDIS_TIMEOUT_MS", 5000, 100, 60_000),
            redis_max_keys: number(&get, "SHENRON_MCP_REDIS_MAX_KEYS", 200, 1, 5000),
            rate_per_minute: number(&get, "SHENRON_MCP_RATE_LIMIT_PER_MIN", 120, 1, u32::MAX),
            audit_table,
            listen_channels,
            listen_explicit,
            memory_path,
            memory_agent: get("SHENRON_MCP_MEMORY_AGENT").unwrap_or_else(|| "shenron-mcp".to_owned()),
        }
    }

    /// A per-call request clamped into `[1, ceiling]` (`ceiling` when absent).
    #[must_use]
    pub fn clamp_to(requested: Option<usize>, ceiling: usize) -> usize {
        requested.map_or(ceiling, |value| value.clamp(1, ceiling))
    }
}

/// Keep rows while they fit the row and byte caps; the flag says whether any were dropped.
#[must_use]
pub fn fit_rows(rows: Vec<Value>, max_rows: usize, max_bytes: usize) -> (Vec<Value>, bool) {
    let total = rows.len();
    let mut used = 0_usize;
    let mut kept = Vec::new();
    for row in rows.into_iter().take(max_rows) {
        // Serialised size plus a separator: an overestimate of the final array is fine.
        used += row.to_string().len() + 1;
        if used > max_bytes {
            break;
        }
        kept.push(row);
    }
    let truncated = kept.len() < total;
    (kept, truncated)
}

/// Sliding-window rate limiter keyed by caller.
#[derive(Debug, Default)]
pub struct Limiter {
    windows: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl Limiter {
    /// Record a call of `caller` at `now`, or refuse it when `limit` calls already happened in the
    /// last minute.
    ///
    /// # Errors
    /// The limit is reached; the message says when to retry.
    pub fn check(&self, caller: &str, limit: u32, now: Instant) -> Result<(), String> {
        let window = Duration::from_secs(60);
        let mut windows = self.windows.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if windows.len() > 1024 {
            windows.retain(|_, calls| {
                calls.back().is_some_and(|last| now.duration_since(*last) < window)
            });
        }
        let calls = windows.entry(caller.to_owned()).or_default();
        while calls.front().is_some_and(|first| now.duration_since(*first) >= window) {
            calls.pop_front();
        }
        if calls.len() >= limit as usize {
            let wait = calls
                .front()
                .map_or(window, |first| window.saturating_sub(now.duration_since(*first)));
            return Err(format!(
                "rate limit reached ({limit} admin calls per minute for {caller}); retry in {}s",
                wait.as_secs().max(1)
            ));
        }
        calls.push_back(now);
        Ok(())
    }
}

/// One audited admin call.
#[derive(Debug, Clone)]
pub struct AuditRecord {
    /// Who (token id, address or `stdio`).
    pub caller: String,
    /// Tool name.
    pub tool: &'static str,
    /// blake3 of the arguments (hex).
    pub args_hash: String,
    /// Wall time of the call.
    pub duration_ms: i64,
    /// Whether the call succeeded.
    pub ok: bool,
    /// Short human description (statement head, key names); never a secret value.
    pub summary: String,
}

/// Hash of serialised arguments (stable for one struct layout).
#[must_use]
pub fn args_hash<A: Serialize>(args: &A) -> String {
    let bytes = serde_json::to_vec(args).unwrap_or_default();
    blake3::hash(&bytes).to_hex().to_string()
}

/// Process-wide state of the admin tools: configuration, pools and the live hub.
#[derive(Debug)]
pub struct Runtime {
    /// Settings.
    pub config: Config,
    pub(crate) pg: OnceCell<deadpool_postgres::Pool>,
    pub(crate) redis: OnceCell<redis::aio::ConnectionManager>,
    pub(crate) memory: OnceCell<Arc<shenron_memory::SqliteLocalProvider>>,
    pub(crate) limiter: Limiter,
    /// Resource subscriptions and the LISTEN task.
    pub hub: Hub,
}

impl Runtime {
    /// A runtime over `config`.
    #[must_use]
    pub fn new(config: Config) -> Self {
        let hub = Hub::new(&config.listen_channels);
        Self {
            config,
            pg: OnceCell::new(),
            redis: OnceCell::new(),
            memory: OnceCell::new(),
            limiter: Limiter::default(),
            hub,
        }
    }
}

static RUNTIME: OnceLock<Arc<Runtime>> = OnceLock::new();

/// The process-wide runtime, configured from the environment on first use.
#[must_use]
pub fn runtime() -> &'static Arc<Runtime> {
    RUNTIME.get_or_init(|| Arc::new(Runtime::new(Config::from_env())))
}

/// Start the LISTEN task now when the channel list was configured explicitly and a database is
/// configured; otherwise it starts on the first resource subscription.
pub fn start_background() {
    let runtime = runtime();
    if runtime.config.listen_explicit
        && !runtime.config.listen_channels.is_empty()
        && runtime.config.database_url.is_some()
    {
        crate::admin_live::ensure_started(runtime);
    }
}

/// Run one admin call: rate limit, execute, audit, shape the result.
///
/// `tool` is the tool name; `args` is hashed for the audit; `summary` is a short non-secret
/// description. A result carrying `"audit": "inline"` was already audited inside its own
/// transaction (`db.exec`), so no second row is written.
pub async fn run<A, F>(
    caller: String,
    tool: &'static str,
    args: &A,
    summary: String,
    call: F,
) -> CallToolResult
where
    A: Serialize,
    F: Future<Output = Result<Value, String>>,
{
    let runtime = runtime();
    let hash = args_hash(args);
    if let Err(message) = runtime.limiter.check(&caller, runtime.config.rate_per_minute, Instant::now()) {
        tracing::warn!(target: "shenron_mcp::audit", %caller, tool, args_hash = %hash, "rate limited");
        return dragonball_tools::err(message);
    }
    let started = Instant::now();
    let result = call.await;
    let duration_ms = i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX);
    let ok = result.is_ok();
    tracing::info!(target: "shenron_mcp::audit", %caller, tool, args_hash = %hash, duration_ms, ok, "admin call");
    let inline = result
        .as_ref()
        .ok()
        .and_then(|value| value.get("audit"))
        .is_some_and(|audit| audit == "inline");
    if !inline && runtime.config.database_url.is_some() {
        let record = AuditRecord { caller, tool, args_hash: hash, duration_ms, ok, summary };
        admin_pg::record_audit(runtime, &record).await;
    }
    dragonball_tools::done(result)
}

/// The refusal returned when a write tool is called without `confirm: true`.
///
/// # Errors
/// `confirm` is absent or false.
pub fn require_confirm(confirm: Option<bool>, tool: &str) -> Result<(), String> {
    if confirm == Some(true) {
        Ok(())
    } else {
        Err(format!("{tool} writes data: call it again with confirm: true to proceed"))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use super::*;

    fn config(pairs: &[(&str, &str)]) -> Config {
        let env: HashMap<String, String> =
            pairs.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())).collect();
        Config::from_environment(|name| env.get(name).cloned())
    }

    #[test]
    fn the_admin_group_is_recognised_by_prefix() {
        for name in ["db.query", "db.exec", "redis.get", "memory.learn"] {
            assert!(is_admin_tool(name), "{name}");
        }
        for name in ["dragonball.search", "dbfr_databooks", "database.x", "dbquery"] {
            assert!(!is_admin_tool(name), "{name}");
        }
    }

    #[test]
    fn defaults_are_documented_values() {
        let defaults = config(&[]);
        assert_eq!(defaults.database_url, None);
        assert_eq!(defaults.pool_size, 4);
        assert_eq!(defaults.statement_timeout_ms, 15_000);
        assert_eq!(defaults.max_rows, 500);
        assert_eq!(defaults.max_bytes, 262_144);
        assert_eq!(defaults.rate_per_minute, 120);
        assert_eq!(defaults.audit_table, "\"bot\".\"shenron_mcp_audit\"");
        assert_eq!(defaults.listen_channels, vec![TABLE_CHANNEL.to_owned()]);
        assert!(!defaults.listen_explicit);
        assert!(defaults.memory_path.ends_with("mcp-memory.sqlite"));
    }

    #[test]
    fn environment_overrides_are_clamped_and_validated() {
        let tuned = config(&[
            ("SHENRON_MCP_DATABASE_URL", "postgres://u@h/db"),
            ("DATABASE_URL", "postgres://ignored@h/db"),
            ("SHENRON_MCP_DB_MAX_ROWS", "999999"),
            ("SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS", "1"),
            ("SHENRON_MCP_DB_POOL_SIZE", "nope"),
            ("SHENRON_MCP_AUDIT_TABLE", "ops.audit"),
            ("SHENRON_MCP_LISTEN_CHANNELS", "a_b, bad-name ,c9"),
            ("SHENRON_HOME", "/data/home"),
        ]);
        assert_eq!(tuned.database_url.as_deref(), Some("postgres://u@h/db"));
        assert_eq!(tuned.max_rows, 5000);
        assert_eq!(tuned.statement_timeout_ms, 100);
        assert_eq!(tuned.pool_size, 4);
        assert_eq!(tuned.audit_table, "\"ops\".\"audit\"");
        assert_eq!(tuned.listen_channels, vec!["a_b".to_owned(), "c9".to_owned()]);
        assert!(tuned.listen_explicit);
        assert_eq!(tuned.memory_path, PathBuf::from("/data/home").join("mcp-memory.sqlite"));
        let bad_table = config(&[("SHENRON_MCP_AUDIT_TABLE", "a;drop table x")]);
        assert_eq!(bad_table.audit_table, "\"bot\".\"shenron_mcp_audit\"");
        let disabled = config(&[("SHENRON_MCP_LISTEN_CHANNELS", " ")]);
        assert!(disabled.listen_channels.is_empty() && disabled.listen_explicit);
    }

    #[test]
    fn caps_drop_rows_beyond_the_row_and_byte_limits() {
        let rows: Vec<Value> = (0..10).map(|n| json!({ "n": n })).collect();
        let (kept, truncated) = fit_rows(rows.clone(), 3, 1 << 20);
        assert_eq!(kept.len(), 3);
        assert!(truncated);
        let (kept, truncated) = fit_rows(rows.clone(), 100, 1 << 20);
        assert_eq!(kept.len(), 10);
        assert!(!truncated);
        let (kept, truncated) = fit_rows(rows, 100, 30);
        assert!(kept.len() < 10 && !kept.is_empty());
        assert!(truncated);
        assert_eq!(Config::clamp_to(Some(0), 50), 1);
        assert_eq!(Config::clamp_to(Some(9999), 50), 50);
        assert_eq!(Config::clamp_to(None, 50), 50);
    }

    #[test]
    fn the_rate_limiter_is_per_caller_and_slides() {
        let limiter = Limiter::default();
        let start = Instant::now();
        for _ in 0..3 {
            limiter.check("token:a", 3, start).expect("within limit");
        }
        let refused = limiter.check("token:a", 3, start).expect_err("over limit");
        assert!(refused.contains("rate limit"), "{refused}");
        limiter.check("token:b", 3, start).expect("another caller has its own window");
        limiter.check("token:a", 3, start + Duration::from_secs(61)).expect("window slid");
    }

    #[test]
    fn writes_need_an_explicit_confirm() {
        assert!(require_confirm(None, "db.exec").is_err());
        assert!(require_confirm(Some(false), "db.exec").is_err());
        assert!(require_confirm(Some(true), "db.exec").is_ok());
        assert!(require_confirm(None, "redis.del").expect_err("refused").contains("confirm: true"));
    }

    #[test]
    fn caller_ids_never_contain_the_token() {
        let caller = Caller::token("super-secret-token-0123456789");
        assert!(caller.0.starts_with("token:"));
        assert!(!caller.0.contains("secret"));
        assert_eq!(caller.0.len(), "token:".len() + 12);
        assert_eq!(caller, Caller::token("super-secret-token-0123456789"));
        assert_eq!(Caller::ip("::ffff:10.0.0.1".parse().expect("ip")).0, "ip:10.0.0.1");
    }

    #[test]
    fn argument_hashes_are_stable_and_argument_sensitive() {
        assert_eq!(args_hash(&json!({"a": 1})), args_hash(&json!({"a": 1})));
        assert_ne!(args_hash(&json!({"a": 1})), args_hash(&json!({"a": 2})));
    }
}
