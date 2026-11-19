// SPDX-License-Identifier: Apache-2.0
//! Integration tests of the admin data plane against a real PostgreSQL and a real Redis.
//!
//! They run only when `SHENRON_MCP_TEST_DATABASE_URL` and `SHENRON_MCP_TEST_REDIS_URL` point at
//! throwaway servers (see docs/runbooks/shenron-mcp-admin.md); otherwise each test prints
//! `skipped` and passes. Never point them at production data.

use std::{sync::Arc, time::Duration};

use serde_json::{Value, json};
use shenron_mcp::{
    admin::{Config, Runtime, TABLE_CHANNEL},
    admin_live::{self, Target},
    admin_pg::{self, ExecInput, ExplainInput, QueryInput, SchemaInput},
    admin_redis::{self, DelInput, InfoInput, KeyInput, ScanInput, SetInput},
};

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.trim().is_empty())
}

fn pg_runtime(audit_table: &str) -> Option<Runtime> {
    let Some(url) = env("SHENRON_MCP_TEST_DATABASE_URL") else {
        eprintln!("skipped: SHENRON_MCP_TEST_DATABASE_URL is not set");
        return None;
    };
    let audit = audit_table.to_owned();
    Some(Runtime::new(Config::from_environment(move |name| match name {
        "SHENRON_MCP_DATABASE_URL" => Some(url.clone()),
        "SHENRON_MCP_AUDIT_TABLE" => Some(audit.clone()),
        "SHENRON_MCP_DB_MAX_ROWS" => Some("5".to_owned()),
        _ => None,
    })))
}

async fn admin_client(url: &str) -> tokio_postgres::Client {
    let (client, connection) = tokio_postgres::connect(url, tokio_postgres::NoTls).await.expect("connect");
    tokio::spawn(async move {
        let _ = connection.await;
    });
    client
}

fn query_input(sql: &str) -> QueryInput {
    QueryInput { sql: sql.to_owned(), ..Default::default() }
}

fn exec_input(sql: &str, confirm: bool) -> ExecInput {
    ExecInput { sql: sql.to_owned(), confirm: Some(confirm), ..Default::default() }
}

async fn count(runtime: &Runtime, table: &str) -> i64 {
    let rows = admin_pg::query(runtime, QueryInput { limit: Some(1), ..query_input(&format!("SELECT count(*) AS n FROM {table}")) })
        .await
        .expect("count");
    rows["rows"][0]["n"].as_i64().expect("n")
}

#[tokio::test]
async fn postgres_tools_enforce_their_guards_and_audit_writes() {
    let Some(runtime) = pg_runtime("public.mcp_it_audit") else { return };
    let url = env("SHENRON_MCP_TEST_DATABASE_URL").expect("url");
    let admin = admin_client(&url).await;
    admin
        .batch_execute(
            "DROP TABLE IF EXISTS mcp_it_items, mcp_it_audit CASCADE;
             CREATE TABLE mcp_it_audit (
               id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
               caller text NOT NULL, tool text NOT NULL, args_hash text NOT NULL, duration_ms integer NOT NULL,
               ok boolean NOT NULL, summary text);
             CREATE TABLE mcp_it_items (id serial PRIMARY KEY, name text NOT NULL, meta jsonb);
             CREATE INDEX mcp_it_items_name_idx ON mcp_it_items (name);",
        )
        .await
        .expect("fixture");

    // Writes need confirm; with it they commit and leave their audit row in the same transaction.
    let refused = admin_pg::exec(&runtime, exec_input("INSERT INTO mcp_it_items (name) VALUES ('a')", false), "token:t", "h")
        .await
        .expect_err("confirm");
    assert!(refused.contains("confirm: true"));
    assert_eq!(count(&runtime, "mcp_it_items").await, 0);
    let done = admin_pg::exec(
        &runtime,
        exec_input("INSERT INTO mcp_it_items (name, meta) SELECT 'row' || g, '{\"k\": 1}' FROM generate_series(1, 8) g", true),
        "token:t",
        "hash-1",
    )
    .await
    .expect("exec");
    assert_eq!(done["affected_rows"], 8);
    assert_eq!(done["committed"], true);
    assert_eq!(done["audit"], "inline");
    let audit = admin_pg::query(&runtime, query_input("SELECT caller, tool, args_hash, ok FROM mcp_it_audit")).await.expect("audit");
    assert_eq!(audit["rows"][0], json!({ "caller": "token:t", "tool": "db.exec", "args_hash": "hash-1", "ok": true }));

    // A dry run reports the effect and persists nothing; a failing statement leaves nothing behind.
    let dry = admin_pg::exec(
        &runtime,
        ExecInput { dry_run: Some(true), ..exec_input("DELETE FROM mcp_it_items", true) },
        "token:t",
        "h",
    )
    .await
    .expect("dry run");
    assert_eq!(dry["affected_rows"], 8);
    assert_eq!(dry["committed"], false);
    assert_eq!(count(&runtime, "mcp_it_items").await, 8);
    assert!(admin_pg::exec(&runtime, exec_input("INSERT INTO mcp_it_items (name) VALUES (NULL)", true), "t", "h").await.is_err());
    assert_eq!(count(&runtime, "mcp_it_items").await, 8);

    // Reads: row cap (limit 5 from the environment), JSON rows, read-only enforcement by the server.
    let capped = admin_pg::query(&runtime, query_input("SELECT id, name, meta FROM mcp_it_items ORDER BY id")).await.expect("query");
    assert_eq!(capped["rows"].as_array().expect("rows").len(), 5);
    assert_eq!(capped["truncated"], true);
    assert_eq!(capped["rows"][0]["meta"], json!({ "k": 1 }));
    let small = admin_pg::query(&runtime, QueryInput { limit: Some(2), ..query_input("TABLE mcp_it_items") }).await.expect("table");
    assert_eq!(small["row_count"], 2);
    for sql in [
        "INSERT INTO mcp_it_items (name) VALUES ('x')",
        "SELECT 1; DELETE FROM mcp_it_items",
        "WITH gone AS (DELETE FROM mcp_it_items RETURNING id) SELECT * FROM gone",
        "SELECT * INTO mcp_it_copy FROM mcp_it_items",
    ] {
        assert!(admin_pg::query(&runtime, query_input(sql)).await.is_err(), "must refuse: {sql}");
    }
    assert_eq!(count(&runtime, "mcp_it_items").await, 8);
    let slow = admin_pg::query(&runtime, QueryInput { timeout_ms: Some(200), ..query_input("SELECT pg_sleep(5)") }).await.expect_err("timeout");
    assert!(slow.contains("statement timeout") || slow.contains("57014"), "{slow}");

    // Schema and plan.
    let schema = admin_pg::schema(&runtime, SchemaInput { table: Some("mcp_it_items".into()), ..Default::default() }).await.expect("schema");
    let relation = &schema["relations"][0];
    assert_eq!(relation["name"], "mcp_it_items");
    assert_eq!(relation["kind"], "table");
    assert_eq!(relation["columns"].as_array().expect("columns").len(), 3);
    assert!(relation["primary_key"].as_str().expect("pk").contains("PRIMARY KEY"));
    assert!(relation["indexes"].as_array().expect("indexes").len() >= 2);
    let plan = admin_pg::explain(&runtime, ExplainInput { sql: "SELECT * FROM mcp_it_items WHERE id = 1".into(), ..Default::default() }).await.expect("explain");
    assert!(plan["plan"][0]["Plan"].is_object(), "{plan}");
    let analyzed = admin_pg::explain(&runtime, ExplainInput { sql: "SELECT * FROM mcp_it_items".into(), analyze: Some(true), ..Default::default() }).await.expect("analyze");
    assert!(analyzed["plan"][0]["Execution Time"].is_number(), "{analyzed}");
    assert!(admin_pg::explain(&runtime, ExplainInput { sql: "DELETE FROM mcp_it_items".into(), analyze: Some(true), ..Default::default() }).await.is_err());
    assert_eq!(count(&runtime, "mcp_it_items").await, 8);

    // The table resource.
    let resource = admin_pg::table_resource(&runtime, "mcp_it_items").await.expect("resource");
    assert!(resource["sample"].as_array().expect("sample").len() <= 5);
    assert!(admin_pg::table_resource(&runtime, "mcp_it_missing").await.is_err());
    assert!(admin_pg::table_resource(&runtime, "a;drop").await.is_err());

    // Without its audit table a write cannot persist.
    let unaudited = pg_runtime("public.mcp_it_no_such_audit").expect("runtime");
    let error = admin_pg::exec(&unaudited, exec_input("DELETE FROM mcp_it_items", true), "t", "h").await.expect_err("audit");
    assert!(error.contains("audit"), "{error}");
    assert_eq!(count(&runtime, "mcp_it_items").await, 8);

    admin.batch_execute("DROP TABLE mcp_it_items, mcp_it_audit").await.expect("cleanup");
}

#[tokio::test]
async fn redis_tools_read_cap_and_write_behind_confirm() {
    let Some(url) = env("SHENRON_MCP_TEST_REDIS_URL") else {
        eprintln!("skipped: SHENRON_MCP_TEST_REDIS_URL is not set");
        return;
    };
    let runtime = Runtime::new(Config::from_environment(move |name| match name {
        "SHENRON_MCP_REDIS_URL" => Some(url.clone()),
        "SHENRON_MCP_REDIS_MAX_KEYS" => Some("3".to_owned()),
        _ => None,
    }));
    let key = |suffix: &str| format!("mcp-it:{suffix}");

    assert!(admin_redis::set(&runtime, SetInput { key: key("s"), value: "v".into(), ..Default::default() }).await.is_err());
    let stored = admin_redis::set(
        &runtime,
        SetInput { key: key("s"), value: "hello".into(), ex_seconds: Some(120), confirm: Some(true), ..Default::default() },
    )
    .await
    .expect("set");
    assert_eq!(stored["stored"], true);
    let kept = admin_redis::set(
        &runtime,
        SetInput { key: key("s"), value: "other".into(), only_if_absent: Some(true), confirm: Some(true), ..Default::default() },
    )
    .await
    .expect("nx");
    assert_eq!(kept["stored"], false);

    let value = admin_redis::get(&runtime, KeyInput { key: key("s"), limit: None }).await.expect("get");
    assert_eq!(value["type"], "string");
    assert_eq!(value["value"], "hello");
    let ttl = admin_redis::ttl(&runtime, KeyInput { key: key("s"), limit: None }).await.expect("ttl");
    assert!(ttl["ttl_seconds"].as_i64().expect("ttl") > 0);
    let missing = admin_redis::get(&runtime, KeyInput { key: key("nope"), limit: None }).await.expect("missing");
    assert_eq!(missing["exists"], false);

    // Collections are capped at SHENRON_MCP_REDIS_MAX_KEYS (3 here).
    let mut raw = redis::Client::open(env("SHENRON_MCP_TEST_REDIS_URL").expect("url")).expect("client")
        .get_multiplexed_async_connection().await.expect("connection");
    for n in 0..6 {
        let _: () = redis::cmd("RPUSH").arg(key("list")).arg(n).query_async(&mut raw).await.expect("rpush");
        let _: () = redis::cmd("SET").arg(key(&format!("bulk{n}"))).arg(n).query_async(&mut raw).await.expect("set");
    }
    let list = admin_redis::get(&runtime, KeyInput { key: key("list"), limit: None }).await.expect("list");
    assert_eq!(list["value"].as_array().expect("items").len(), 3);
    assert_eq!(list["size"], 6);
    assert_eq!(list["truncated"], true);
    let scan = admin_redis::scan(&runtime, ScanInput { pattern: Some("mcp-it:bulk*".into()), ..Default::default() }).await.expect("scan");
    assert!(scan["keys"].as_array().expect("keys").len() >= 3);
    let info = admin_redis::info(&runtime, InfoInput { section: Some("server".into()) }).await.expect("info");
    assert!(info["server"]["redis_version"].is_string(), "{info}");

    assert!(admin_redis::del(&runtime, DelInput { keys: vec![key("s")], confirm: None }).await.is_err());
    let removed = admin_redis::del(
        &runtime,
        DelInput { keys: vec![key("s"), key("list"), key("bulk0"), key("bulk1"), key("bulk2"), key("bulk3"), key("bulk4"), key("bulk5")], confirm: Some(true) },
    )
    .await
    .expect("del");
    assert_eq!(removed["removed"], 8);
}

async fn eventually(hub: &admin_live::Hub, channel: &str, wanted: impl Fn(&Value) -> bool) -> bool {
    for _ in 0..100 {
        if hub.recent(channel, 50).iter().any(|event| wanted(&event["payload"])) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    false
}

#[tokio::test(flavor = "multi_thread")]
async fn listen_task_turns_notify_and_table_triggers_into_events() {
    let Some(runtime) = pg_runtime("public.mcp_it_audit") else { return };
    let url = env("SHENRON_MCP_TEST_DATABASE_URL").expect("url");
    let admin = admin_client(&url).await;
    admin
        .batch_execute(
            "DROP TABLE IF EXISTS mcp_it_live CASCADE;
             CREATE TABLE mcp_it_live (id serial PRIMARY KEY, name text);
             CREATE OR REPLACE FUNCTION mcp_it_notify() RETURNS trigger LANGUAGE plpgsql AS $fn$
             BEGIN
               PERFORM pg_notify('shenron_mcp_table',
                 json_build_object('table', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'op', TG_OP)::text);
               RETURN NULL;
             END $fn$;
             CREATE TRIGGER mcp_it_notify AFTER INSERT OR UPDATE OR DELETE ON mcp_it_live
               FOR EACH STATEMENT EXECUTE FUNCTION mcp_it_notify();",
        )
        .await
        .expect("fixture");

    let runtime = Arc::new(runtime);
    let hub = &runtime.hub;
    hub.watch(&Target::Events("mcp_it_events".to_owned()));
    hub.watch(&Target::Table("public.mcp_it_live".to_owned()));
    admin_live::ensure_started(&runtime);
    for _ in 0..100 {
        if hub.connected() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    assert!(hub.connected(), "the LISTEN connection did not come up");

    admin.batch_execute("NOTIFY mcp_it_events, '{\"hello\": \"world\"}'").await.expect("notify");
    assert!(eventually(hub, "mcp_it_events", |payload| payload["hello"] == "world").await, "NOTIFY never arrived");

    admin.batch_execute("INSERT INTO mcp_it_live (name) VALUES ('x')").await.expect("insert");
    assert!(
        eventually(hub, TABLE_CHANNEL, |payload| payload["table"] == "public.mcp_it_live" && payload["op"] == "INSERT").await,
        "the table trigger event never arrived"
    );
    assert_eq!(admin_live::uris_for(TABLE_CHANNEL, r#"{"table":"public.mcp_it_live"}"#).len(), 3);

    admin.batch_execute("DROP TABLE mcp_it_live CASCADE; DROP FUNCTION mcp_it_notify()").await.expect("cleanup");
}
