// SPDX-License-Identifier: Apache-2.0
//! Redis side of the admin tools: `redis.info`, `redis.get`, `redis.scan`, `redis.ttl` and the
//! confirm-gated `redis.set` and `redis.del`. Every command has a timeout, every collection read
//! is capped, and `KEYS` is never used (`SCAN` only).

use std::time::Duration;

use redis::aio::ConnectionManager;
use rmcp::schemars::{self, JsonSchema};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    admin::{Config, Runtime, require_confirm},
    admin_sql,
};

const NOT_CONFIGURED: &str = "Redis is not configured: set SHENRON_MCP_REDIS_URL (or REDIS_URL) in the \
                              MCP server environment";

/// Most keys one `redis.del` call removes.
pub const MAX_DEL_KEYS: usize = 100;

/// Arguments of `redis.info`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct InfoInput {
    /// INFO section (server, clients, memory, stats, replication, keyspace, ...); default: `default`.
    pub section: Option<String>,
}

/// Arguments of `redis.get` and `redis.ttl`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct KeyInput {
    /// The key.
    pub key: String,
    /// Elements to return for hashes, lists, sets, sorted sets and streams (default and ceiling:
    /// SHENRON_MCP_REDIS_MAX_KEYS).
    pub limit: Option<usize>,
}

/// Arguments of `redis.scan`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct ScanInput {
    /// MATCH glob pattern (default `*`).
    pub pattern: Option<String>,
    /// Keys to collect (default and ceiling: SHENRON_MCP_REDIS_MAX_KEYS).
    pub count: Option<usize>,
    /// Cursor returned by a previous call (default `0`).
    pub cursor: Option<String>,
    /// Only keys of this type (string, list, set, zset, hash, stream).
    pub key_type: Option<String>,
}

/// Arguments of `redis.set`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct SetInput {
    /// The key.
    pub key: String,
    /// The string value.
    pub value: String,
    /// Expire after this many seconds.
    pub ex_seconds: Option<u64>,
    /// Set only when the key does not exist.
    pub only_if_absent: Option<bool>,
    /// Must be true: the call writes.
    pub confirm: Option<bool>,
}

/// Arguments of `redis.del`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct DelInput {
    /// Keys to delete (at most 100; no patterns).
    pub keys: Vec<String>,
    /// Must be true: the call deletes.
    pub confirm: Option<bool>,
}

async fn connection(runtime: &Runtime) -> Result<ConnectionManager, String> {
    let manager = runtime
        .redis
        .get_or_try_init(|| async {
            let url = runtime.config.redis_url.clone().ok_or_else(|| NOT_CONFIGURED.to_owned())?;
            let client = redis::Client::open(url.as_str())
                .map_err(|error| format!("invalid Redis URL: {error}"))?;
            tokio::time::timeout(
                Duration::from_millis(runtime.config.redis_timeout_ms),
                ConnectionManager::new(client),
            )
            .await
            .map_err(|_| "Redis connection timed out".to_owned())?
            .map_err(|error| format!("Redis connection failed: {error}"))
        })
        .await?;
    Ok(manager.clone())
}

async fn call<T: redis::FromRedisValue>(runtime: &Runtime, command: &redis::Cmd) -> Result<T, String> {
    let mut connection = connection(runtime).await?;
    tokio::time::timeout(
        Duration::from_millis(runtime.config.redis_timeout_ms),
        command.query_async::<T>(&mut connection),
    )
    .await
    .map_err(|_| "Redis command timed out".to_owned())?
    .map_err(|error| format!("Redis error: {error}"))
}

fn lossy(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

/// A byte string as JSON text, or as a hex preview when it is not UTF-8.
fn text_or_hex(bytes: Vec<u8>) -> Value {
    match String::from_utf8(bytes) {
        Ok(text) => Value::String(text),
        Err(error) => {
            let bytes = error.into_bytes();
            let preview: String = bytes.iter().take(2048).map(|byte| format!("{byte:02x}")).collect();
            json!({ "binary_hex": preview, "bytes": bytes.len() })
        },
    }
}

/// A Redis reply as JSON.
#[must_use]
pub fn to_json(value: redis::Value) -> Value {
    match value {
        redis::Value::Nil => Value::Null,
        redis::Value::Int(number) => json!(number),
        redis::Value::BulkString(bytes) => text_or_hex(bytes),
        redis::Value::Array(items) | redis::Value::Set(items) => {
            Value::Array(items.into_iter().map(to_json).collect())
        },
        redis::Value::SimpleString(text) => Value::String(text),
        redis::Value::Okay => Value::String("OK".to_owned()),
        redis::Value::Map(pairs) => pairs_to_object(
            pairs.into_iter().map(|(key, value)| (to_json(key), to_json(value))).collect(),
        ),
        redis::Value::Double(number) => json!(number),
        redis::Value::Boolean(flag) => json!(flag),
        redis::Value::VerbatimString { text, .. } => Value::String(text),
        other => Value::String(format!("{other:?}")),
    }
}

fn pairs_to_object(pairs: Vec<(Value, Value)>) -> Value {
    let mut map = Map::new();
    for (key, value) in pairs {
        let key = match key {
            Value::String(text) => text,
            other => other.to_string(),
        };
        map.insert(key, value);
    }
    Value::Object(map)
}

/// A flat `[k1, v1, k2, v2, ...]` reply (RESP2 hashes) or an already-built map as an object.
fn flat_to_object(value: Value) -> Value {
    match value {
        Value::Array(items) => {
            let mut pairs = Vec::new();
            let mut iter = items.into_iter();
            while let (Some(key), Some(value)) = (iter.next(), iter.next()) {
                pairs.push((key, value));
            }
            pairs_to_object(pairs)
        },
        other => other,
    }
}

/// A flat `[member, score, ...]` reply as `[{member, score}]`.
fn members_with_scores(value: Value) -> Value {
    match value {
        Value::Array(items) => {
            let mut out = Vec::new();
            let mut iter = items.into_iter();
            while let (Some(member), Some(score)) = (iter.next(), iter.next()) {
                out.push(json!({ "member": member, "score": score }));
            }
            Value::Array(out)
        },
        other => other,
    }
}

/// Keep a value whole when it fits `max_bytes`, else a clipped preview.
fn bounded(value: Value, max_bytes: usize) -> Value {
    let text = value.to_string();
    if text.len() <= max_bytes {
        return value;
    }
    json!({ "truncated": true, "bytes": text.len(), "preview": admin_sql::clip(&text, max_bytes) })
}

/// `INFO` text as `{section: {field: value}}`.
#[must_use]
pub fn parse_info(text: &str) -> Value {
    let mut sections = Map::new();
    let mut current = "default".to_owned();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if let Some(name) = line.strip_prefix('#') {
            current = name.trim().to_ascii_lowercase();
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            let section = sections.entry(current.clone()).or_insert_with(|| json!({}));
            if let Some(object) = section.as_object_mut() {
                object.insert(key.to_owned(), Value::String(value.to_owned()));
            }
        }
    }
    Value::Object(sections)
}

/// `redis.info`.
pub async fn info(runtime: &Runtime, input: InfoInput) -> Result<Value, String> {
    let mut command = redis::cmd("INFO");
    if let Some(section) = input.section.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        if !section.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_') {
            return Err(format!("invalid INFO section {section:?}"));
        }
        command.arg(section);
    }
    let text: String = call(runtime, &command).await?;
    Ok(bounded(parse_info(&text), runtime.config.max_bytes))
}

/// `redis.ttl`.
pub async fn ttl(runtime: &Runtime, input: KeyInput) -> Result<Value, String> {
    let key = input.key.as_str();
    let kind: String = call(runtime, redis::cmd("TYPE").arg(key)).await?;
    if kind == "none" {
        return Ok(json!({ "key": key, "exists": false }));
    }
    let seconds: i64 = call(runtime, redis::cmd("TTL").arg(key)).await?;
    let millis: i64 = call(runtime, redis::cmd("PTTL").arg(key)).await?;
    Ok(json!({
        "key": key, "exists": true, "type": kind,
        "persistent": seconds == -1,
        "ttl_seconds": (seconds >= 0).then_some(seconds),
        "ttl_millis": (millis >= 0).then_some(millis),
    }))
}

/// `redis.get`: the value of a key of any common type, capped.
pub async fn get(runtime: &Runtime, input: KeyInput) -> Result<Value, String> {
    let config = &runtime.config;
    let key = input.key.as_str();
    let limit = Config::clamp_to(input.limit, config.redis_max_keys);
    let count = i64::try_from(limit).unwrap_or(i64::MAX);
    let kind: String = call(runtime, redis::cmd("TYPE").arg(key)).await?;
    let (size, value, truncated) = match kind.as_str() {
        "none" => return Ok(json!({ "key": key, "exists": false })),
        "string" => {
            let length: i64 = call(runtime, redis::cmd("STRLEN").arg(key)).await?;
            let last = i64::try_from(config.max_bytes).unwrap_or(i64::MAX) - 1;
            let bytes: Vec<u8> = call(runtime, redis::cmd("GETRANGE").arg(key).arg(0).arg(last)).await?;
            let cut = usize::try_from(length).unwrap_or(0) > bytes.len();
            (length, text_or_hex(bytes), cut)
        },
        "hash" => {
            let size: i64 = call(runtime, redis::cmd("HLEN").arg(key)).await?;
            let reply: redis::Value = if size <= count {
                call(runtime, redis::cmd("HGETALL").arg(key)).await?
            } else {
                let (_, page): (String, redis::Value) =
                    call(runtime, redis::cmd("HSCAN").arg(key).arg(0).arg("COUNT").arg(count)).await?;
                page
            };
            (size, flat_to_object(to_json(reply)), size > count)
        },
        "list" => {
            let size: i64 = call(runtime, redis::cmd("LLEN").arg(key)).await?;
            let reply: redis::Value =
                call(runtime, redis::cmd("LRANGE").arg(key).arg(0).arg(count - 1)).await?;
            (size, to_json(reply), size > count)
        },
        "set" => {
            let size: i64 = call(runtime, redis::cmd("SCARD").arg(key)).await?;
            let reply: redis::Value = if size <= count {
                call(runtime, redis::cmd("SMEMBERS").arg(key)).await?
            } else {
                let (_, page): (String, redis::Value) =
                    call(runtime, redis::cmd("SSCAN").arg(key).arg(0).arg("COUNT").arg(count)).await?;
                page
            };
            (size, to_json(reply), size > count)
        },
        "zset" => {
            let size: i64 = call(runtime, redis::cmd("ZCARD").arg(key)).await?;
            let reply: redis::Value = call(
                runtime,
                redis::cmd("ZRANGE").arg(key).arg(0).arg(count - 1).arg("WITHSCORES"),
            )
            .await?;
            (size, members_with_scores(to_json(reply)), size > count)
        },
        "stream" => {
            let size: i64 = call(runtime, redis::cmd("XLEN").arg(key)).await?;
            let reply: redis::Value =
                call(runtime, redis::cmd("XRANGE").arg(key).arg("-").arg("+").arg("COUNT").arg(count)).await?;
            (size, to_json(reply), size > count)
        },
        _ => return Ok(json!({ "key": key, "exists": true, "type": kind, "value": null })),
    };
    let value = bounded(value, config.max_bytes);
    let truncated = truncated || value.get("truncated") == Some(&Value::Bool(true));
    Ok(json!({ "key": key, "exists": true, "type": kind, "size": size, "value": value, "truncated": truncated }))
}

/// `redis.scan`: keys matching a pattern, with the cursor to continue.
pub async fn scan(runtime: &Runtime, input: ScanInput) -> Result<Value, String> {
    let config = &runtime.config;
    let pattern = input.pattern.as_deref().map(str::trim).filter(|p| !p.is_empty()).unwrap_or("*");
    let limit = Config::clamp_to(input.count, config.redis_max_keys);
    let batch = limit.clamp(10, 1000);
    let mut cursor: u64 = match input.cursor.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(raw) => raw.parse().map_err(|_| format!("invalid cursor {raw:?}"))?,
        None => 0,
    };
    let mut keys: Vec<Value> = Vec::new();
    for _ in 0..200 {
        let mut command = redis::cmd("SCAN");
        command.arg(cursor).arg("MATCH").arg(pattern).arg("COUNT").arg(batch);
        if let Some(kind) = input.key_type.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
            command.arg("TYPE").arg(kind);
        }
        let (next, page): (u64, Vec<Vec<u8>>) = call(runtime, &command).await?;
        keys.extend(page.iter().map(|key| Value::String(lossy(key))));
        cursor = next;
        if cursor == 0 || keys.len() >= limit {
            break;
        }
    }
    let (keys, cut) = crate::admin::fit_rows(keys, usize::MAX, config.max_bytes);
    Ok(json!({
        "pattern": pattern,
        "keys": keys,
        "count": keys.len(),
        "next_cursor": cursor.to_string(),
        "complete": cursor == 0,
        "truncated": cut,
    }))
}

/// `redis.set` (needs `confirm: true`).
pub async fn set(runtime: &Runtime, input: SetInput) -> Result<Value, String> {
    require_confirm(input.confirm, "redis.set")?;
    let mut command = redis::cmd("SET");
    command.arg(input.key.as_str()).arg(input.value.as_str());
    if let Some(seconds) = input.ex_seconds {
        command.arg("EX").arg(seconds.max(1));
    }
    if input.only_if_absent == Some(true) {
        command.arg("NX");
    }
    let reply: redis::Value = call(runtime, &command).await?;
    let stored = !matches!(reply, redis::Value::Nil);
    Ok(json!({ "key": input.key, "stored": stored }))
}

/// `redis.del` (needs `confirm: true`).
pub async fn del(runtime: &Runtime, input: DelInput) -> Result<Value, String> {
    require_confirm(input.confirm, "redis.del")?;
    if input.keys.is_empty() {
        return Err("redis.del needs at least one key".to_owned());
    }
    if input.keys.len() > MAX_DEL_KEYS {
        return Err(format!("redis.del removes at most {MAX_DEL_KEYS} keys per call"));
    }
    let mut command = redis::cmd("DEL");
    for key in &input.keys {
        command.arg(key.as_str());
    }
    let removed: i64 = call(runtime, &command).await?;
    Ok(json!({ "requested": input.keys.len(), "removed": removed }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offline() -> Runtime {
        Runtime::new(Config::from_environment(|_| None))
    }

    #[tokio::test]
    async fn redis_writes_need_confirm_before_connecting() {
        let runtime = offline();
        let error = set(&runtime, SetInput { key: "k".into(), value: "v".into(), ..Default::default() })
            .await
            .expect_err("refused");
        assert!(error.contains("confirm: true"), "{error}");
        let error = del(&runtime, DelInput { keys: vec!["k".into()], confirm: Some(false) })
            .await
            .expect_err("refused");
        assert!(error.contains("confirm: true"), "{error}");
        let error = del(&runtime, DelInput { keys: vec![], confirm: Some(true) }).await.expect_err("empty");
        assert!(error.contains("at least one key"), "{error}");
        let many = (0..=MAX_DEL_KEYS).map(|n| format!("k{n}")).collect();
        let error = del(&runtime, DelInput { keys: many, confirm: Some(true) }).await.expect_err("cap");
        assert!(error.contains("at most"), "{error}");
    }

    #[tokio::test]
    async fn redis_reads_report_a_missing_configuration() {
        let runtime = offline();
        let error = get(&runtime, KeyInput { key: "k".into(), limit: None }).await.expect_err("offline");
        assert!(error.contains("not configured"), "{error}");
        let error = info(&runtime, InfoInput { section: Some("a b".into()) }).await.expect_err("bad section");
        assert!(error.contains("invalid INFO section"), "{error}");
    }

    #[test]
    fn info_text_is_parsed_into_sections() {
        let parsed = parse_info("# Server\r\nredis_version:8.0.1\r\nos:Linux\r\n\r\n# Keyspace\r\ndb0:keys=3,expires=0\r\n");
        assert_eq!(parsed["server"]["redis_version"], "8.0.1");
        assert_eq!(parsed["keyspace"]["db0"], "keys=3,expires=0");
    }

    #[test]
    fn replies_convert_to_json() {
        assert_eq!(to_json(redis::Value::Nil), Value::Null);
        assert_eq!(to_json(redis::Value::Int(7)), json!(7));
        assert_eq!(to_json(redis::Value::BulkString(b"hi".to_vec())), json!("hi"));
        assert_eq!(to_json(redis::Value::BulkString(vec![0xff, 0xfe]))["binary_hex"], "fffe");
        let flat = to_json(redis::Value::Array(vec![
            redis::Value::BulkString(b"a".to_vec()),
            redis::Value::BulkString(b"1".to_vec()),
        ]));
        assert_eq!(flat_to_object(flat), json!({ "a": "1" }));
        let scored = members_with_scores(json!(["m", "2.5"]));
        assert_eq!(scored, json!([{ "member": "m", "score": "2.5" }]));
    }

    #[test]
    fn large_values_are_clipped() {
        let big = Value::String("x".repeat(5000));
        let clipped = bounded(big, 100);
        assert_eq!(clipped["truncated"], true);
        assert!(clipped["preview"].as_str().expect("preview").len() < 200);
        assert_eq!(bounded(json!("small"), 100), json!("small"));
    }
}
