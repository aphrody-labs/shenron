// SPDX-License-Identifier: Apache-2.0
//! PostgreSQL side of the admin tools: `db.schema`, `db.query`, `db.exec`, `db.explain`, the
//! `shenron://db/table/<name>` resource and the audit rows.
//!
//! Every call runs in its own transaction with a `statement_timeout`; reads run `READ ONLY` and
//! always roll back; `db.exec` commits only after the audit row was written in the same
//! transaction, so an unaudited write cannot persist.

use std::time::{Duration, Instant};

use deadpool_postgres::{ManagerConfig, Pool, PoolConfig, RecyclingMethod, Runtime as PoolRuntime, Timeouts};
use rmcp::schemars::{self, JsonSchema};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio_postgres::NoTls;

use crate::{
    admin::{AuditRecord, Config, Runtime, fit_rows, require_confirm},
    admin_sql,
};

const NOT_CONFIGURED: &str = "PostgreSQL is not configured: set SHENRON_MCP_DATABASE_URL (or DATABASE_URL) \
                              in the MCP server environment";

/// Arguments of `db.schema`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct SchemaInput {
    /// Only this schema (default: every non-system schema).
    pub schema: Option<String>,
    /// Only this table or view.
    pub table: Option<String>,
    /// Maximum number of relations (default and ceiling: the row cap).
    pub limit: Option<usize>,
}

/// Arguments of `db.query`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct QueryInput {
    /// One SELECT, WITH, VALUES or TABLE statement (a single trailing `;` is accepted). Runs in a
    /// READ ONLY transaction; rows come back as JSON objects.
    pub sql: String,
    /// Maximum rows (default and ceiling: SHENRON_MCP_DB_MAX_ROWS).
    pub limit: Option<usize>,
    /// Statement timeout in milliseconds (can only lower SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS).
    pub timeout_ms: Option<u64>,
}

/// Arguments of `db.exec`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct ExecInput {
    /// One write or DDL statement. Transaction control is refused: the server owns the transaction.
    pub sql: String,
    /// Must be true: the call writes.
    pub confirm: Option<bool>,
    /// Run the statement and roll it back, returning the affected rows without persisting.
    pub dry_run: Option<bool>,
    /// Statement timeout in milliseconds (can only lower SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS).
    pub timeout_ms: Option<u64>,
}

/// Arguments of `db.explain`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct ExplainInput {
    /// One SELECT, WITH, VALUES, TABLE, INSERT, UPDATE, DELETE or MERGE statement.
    pub sql: String,
    /// Execute the statement to report real timings (read statements only: the transaction is READ ONLY).
    pub analyze: Option<bool>,
    /// Statement timeout in milliseconds (can only lower SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS).
    pub timeout_ms: Option<u64>,
}

/// A database error as one message: severity, text, SQLSTATE and the position when known.
fn failure(error: &tokio_postgres::Error) -> String {
    match error.as_db_error() {
        Some(db) => {
            let mut message = format!("{}: {} (SQLSTATE {})", db.severity(), db.message(), db.code().code());
            if let Some(detail) = db.detail() {
                message.push_str(&format!("; {detail}"));
            }
            if let Some(hint) = db.hint() {
                message.push_str(&format!("; hint: {hint}"));
            }
            message
        },
        None => error.to_string(),
    }
}

fn pool_failure(error: &deadpool_postgres::PoolError) -> String {
    format!("PostgreSQL connection failed: {error}")
}

async fn pool(runtime: &Runtime) -> Result<&Pool, String> {
    runtime
        .pg
        .get_or_try_init(|| async {
            let url = runtime.config.database_url.clone().ok_or_else(|| NOT_CONFIGURED.to_owned())?;
            let mut config = deadpool_postgres::Config::new();
            config.url = Some(url);
            config.application_name = Some("shenron-mcp".to_owned());
            let mut pool_config = PoolConfig::new(runtime.config.pool_size);
            pool_config.timeouts = Timeouts {
                wait: Some(Duration::from_secs(5)),
                create: Some(Duration::from_secs(5)),
                recycle: Some(Duration::from_secs(5)),
            };
            config.pool = Some(pool_config);
            config.manager = Some(ManagerConfig { recycling_method: RecyclingMethod::Fast });
            config
                .create_pool(Some(PoolRuntime::Tokio1), NoTls)
                .map_err(|error| format!("invalid PostgreSQL DSN: {error}"))
        })
        .await
}

fn timeout_ms(config: &Config, requested: Option<u64>) -> u64 {
    requested.map_or(config.statement_timeout_ms, |value| value.clamp(100, config.statement_timeout_ms))
}

/// The session limits every transaction starts with.
fn limits_sql(timeout_ms: u64) -> String {
    format!(
        "SET LOCAL statement_timeout = {timeout_ms}; SET LOCAL lock_timeout = 3000; \
         SET LOCAL idle_in_transaction_session_timeout = {}",
        timeout_ms.saturating_mul(2).max(10_000)
    )
}

fn as_values(rows: &[tokio_postgres::Row]) -> Result<Vec<Value>, String> {
    rows.iter().map(|row| row.try_get::<_, Value>(0).map_err(|error| failure(&error))).collect()
}

/// `db.schema`: relations with columns, indexes, foreign keys, primary key and row estimates.
pub async fn schema(runtime: &Runtime, input: SchemaInput) -> Result<Value, String> {
    let config = &runtime.config;
    let limit = Config::clamp_to(input.limit, config.max_rows);
    let mut client = pool(runtime).await?.get().await.map_err(|error| pool_failure(&error))?;
    let tx = client
        .build_transaction()
        .read_only(true)
        .start()
        .await
        .map_err(|error| failure(&error))?;
    tx.batch_execute(&limits_sql(timeout_ms(config, None))).await.map_err(|error| failure(&error))?;
    let sql = "
SELECT to_jsonb(r) FROM (
  SELECT n.nspname AS schema, c.relname AS name,
    CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned table' WHEN 'v' THEN 'view'
      WHEN 'm' THEN 'materialized view' WHEN 'f' THEN 'foreign table' END AS kind,
    GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
    pg_total_relation_size(c.oid) AS total_bytes,
    obj_description(c.oid, 'pg_class') AS comment,
    (SELECT pg_get_constraintdef(k.oid) FROM pg_constraint k
       WHERE k.conrelid = c.oid AND k.contype = 'p') AS primary_key,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
        'nullable', NOT a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid)
      ) ORDER BY a.attnum), '[]'::jsonb)
       FROM pg_attribute a
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
    (SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid), '[]'::jsonb)
       FROM pg_index i WHERE i.indrelid = c.oid) AS indexes,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('name', k.conname, 'definition', pg_get_constraintdef(k.oid))
        ORDER BY k.conname), '[]'::jsonb)
       FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f') AS foreign_keys
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND ($1::text IS NULL OR n.nspname = $1)
    AND ($2::text IS NULL OR c.relname = $2)
  ORDER BY n.nspname, c.relname
  LIMIT $3
) r";
    let bound = i64::try_from(limit + 1).unwrap_or(i64::MAX);
    let rows = tx
        .query(sql, &[&input.schema, &input.table, &bound])
        .await
        .map_err(|error| failure(&error))?;
    let relations = as_values(&rows)?;
    tx.rollback().await.ok();
    let found = relations.len();
    let (kept, mut truncated) = fit_rows(relations, limit, config.max_bytes);
    truncated |= found > limit;
    Ok(json!({ "relations": kept, "count": kept.len(), "truncated": truncated }))
}

/// `db.query`: one read statement in a READ ONLY transaction.
pub async fn query(runtime: &Runtime, input: QueryInput) -> Result<Value, String> {
    let config = &runtime.config;
    let statement = admin_sql::read_query(&input.sql)?;
    let limit = Config::clamp_to(input.limit, config.max_rows);
    let timeout = timeout_ms(config, input.timeout_ms);
    let started = Instant::now();
    let mut client = pool(runtime).await?.get().await.map_err(|error| pool_failure(&error))?;
    let tx = client
        .build_transaction()
        .read_only(true)
        .start()
        .await
        .map_err(|error| failure(&error))?;
    tx.batch_execute(&limits_sql(timeout)).await.map_err(|error| failure(&error))?;
    // The statement is a subquery, so every column type is rendered by PostgreSQL itself and the
    // row cap is applied server side (one extra row tells whether the result was cut).
    let wrapped = format!(
        "SELECT to_jsonb(q) FROM (\n{}\n) AS q LIMIT {}",
        statement.text,
        limit + 1
    );
    let rows = tx.query(wrapped.as_str(), &[]).await.map_err(|error| failure(&error))?;
    let values = as_values(&rows)?;
    tx.rollback().await.ok();
    let found = values.len();
    let (kept, mut truncated) = fit_rows(values, limit, config.max_bytes);
    truncated |= found > limit;
    Ok(json!({
        "rows": kept,
        "row_count": kept.len(),
        "truncated": truncated,
        "limit": limit,
        "elapsed_ms": u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
    }))
}

/// `db.exec`: one write in a transaction that also holds its audit row.
pub async fn exec(runtime: &Runtime, input: ExecInput, caller: &str, args_hash: &str) -> Result<Value, String> {
    require_confirm(input.confirm, "db.exec")?;
    let config = &runtime.config;
    let statement = admin_sql::exec_statement(&input.sql)?;
    let dry_run = input.dry_run == Some(true);
    let timeout = timeout_ms(config, input.timeout_ms);
    let started = Instant::now();
    let mut client = pool(runtime).await?.get().await.map_err(|error| pool_failure(&error))?;
    let tx = client.transaction().await.map_err(|error| failure(&error))?;
    tx.batch_execute(&limits_sql(timeout)).await.map_err(|error| failure(&error))?;
    let affected = tx.execute(statement.text.as_str(), &[]).await.map_err(|error| failure(&error))?;
    if dry_run {
        tx.rollback().await.map_err(|error| failure(&error))?;
        return Ok(json!({ "affected_rows": affected, "committed": false, "dry_run": true }));
    }
    let record = AuditRecord {
        caller: caller.to_owned(),
        tool: "db.exec",
        args_hash: args_hash.to_owned(),
        duration_ms: i64::try_from(started.elapsed().as_millis()).unwrap_or(i64::MAX),
        ok: true,
        summary: format!("{} (affected {affected})", admin_sql::clip(&statement.text, 400)),
    };
    insert_audit(&tx, &config.audit_table, &record).await.map_err(|error| {
        format!(
            "audit row could not be written, the statement was rolled back ({}): apply \
             deploy/sql/20261119_shenron_mcp_audit.sql",
            failure(&error)
        )
    })?;
    tx.commit().await.map_err(|error| failure(&error))?;
    Ok(json!({ "affected_rows": affected, "committed": true, "audit": "inline" }))
}

/// `db.explain`: the plan of one statement as JSON.
pub async fn explain(runtime: &Runtime, input: ExplainInput) -> Result<Value, String> {
    let config = &runtime.config;
    let statement = admin_sql::explain_target(&input.sql)?;
    let timeout = timeout_ms(config, input.timeout_ms);
    let options = if input.analyze == Some(true) { "ANALYZE, BUFFERS, FORMAT JSON" } else { "FORMAT JSON" };
    let mut client = pool(runtime).await?.get().await.map_err(|error| pool_failure(&error))?;
    let tx = client
        .build_transaction()
        .read_only(true)
        .start()
        .await
        .map_err(|error| failure(&error))?;
    tx.batch_execute(&limits_sql(timeout)).await.map_err(|error| failure(&error))?;
    let rows = tx
        .query(format!("EXPLAIN ({options}) {}", statement.text).as_str(), &[])
        .await
        .map_err(|error| failure(&error))?;
    let plan = as_values(&rows)?.into_iter().next().unwrap_or(Value::Null);
    tx.rollback().await.ok();
    Ok(json!({ "plan": plan, "analyzed": input.analyze == Some(true) }))
}

/// Content of `shenron://db/table/<name>`: columns, estimate and a row sample.
pub async fn table_resource(runtime: &Runtime, name: &str) -> Result<Value, String> {
    let ident = admin_sql::qualified_ident(name)?;
    let config = &runtime.config;
    let sample = config.max_rows.min(50);
    let mut client = pool(runtime).await?.get().await.map_err(|error| pool_failure(&error))?;
    let tx = client
        .build_transaction()
        .read_only(true)
        .start()
        .await
        .map_err(|error| failure(&error))?;
    tx.batch_execute(&limits_sql(timeout_ms(config, None))).await.map_err(|error| failure(&error))?;
    let exists = tx
        .query_one("SELECT to_regclass($1)::text", &[&ident])
        .await
        .map_err(|error| failure(&error))?;
    if exists.try_get::<_, Option<String>>(0).map_err(|error| failure(&error))?.is_none() {
        return Err(format!("unknown relation {name}"));
    }
    let rows = tx
        .query(format!("SELECT to_jsonb(t) FROM {ident} AS t LIMIT {sample}").as_str(), &[])
        .await
        .map_err(|error| failure(&error))?;
    let values = as_values(&rows)?;
    tx.rollback().await.ok();
    let (kept, truncated) = fit_rows(values, sample, config.max_bytes);
    Ok(json!({ "table": name, "sample": kept, "sample_truncated": truncated }))
}

fn audit_insert(table: &str) -> String {
    format!(
        "INSERT INTO {table} (caller, tool, args_hash, duration_ms, ok, summary) \
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
}

/// Column values of an audit row that need converting (duration to `int4`, bounded summary).
fn audit_values(record: &AuditRecord) -> (i32, String) {
    (i32::try_from(record.duration_ms).unwrap_or(i32::MAX), admin_sql::clip(&record.summary, 600))
}

async fn insert_audit(
    tx: &deadpool_postgres::Transaction<'_>,
    table: &str,
    record: &AuditRecord,
) -> Result<u64, tokio_postgres::Error> {
    let (duration, summary) = audit_values(record);
    tx.execute(
        audit_insert(table).as_str(),
        &[&record.caller, &record.tool, &record.args_hash, &duration, &record.ok, &summary],
    )
    .await
}

/// Best-effort audit row of a call that was not audited inline (the `shenron_mcp::audit` tracing
/// event is always emitted first).
pub async fn record_audit(runtime: &Runtime, record: &AuditRecord) {
    let write = async {
        let client = pool(runtime).await?.get().await.map_err(|error| pool_failure(&error))?;
        let (duration, summary) = audit_values(record);
        client
            .execute(
                audit_insert(&runtime.config.audit_table).as_str(),
                &[&record.caller, &record.tool, &record.args_hash, &duration, &record.ok, &summary],
            )
            .await
            .map(|_| ())
            .map_err(|error| failure(&error))
    };
    match tokio::time::timeout(Duration::from_secs(3), write).await {
        Ok(Ok(())) => {},
        Ok(Err(error)) => tracing::warn!(target: "shenron_mcp::audit", %error, "audit row not written"),
        Err(_) => tracing::warn!(target: "shenron_mcp::audit", "audit row timed out"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offline() -> Runtime {
        Runtime::new(Config::from_environment(|_| None))
    }

    #[tokio::test]
    async fn db_query_refuses_writes_and_multiple_statements_before_connecting() {
        let runtime = offline();
        for sql in [
            "INSERT INTO t VALUES (1)",
            "DELETE FROM t",
            "SELECT 1; DROP TABLE t",
            "UPDATE t SET a = 1",
            "",
        ] {
            let error = query(&runtime, QueryInput { sql: sql.to_owned(), ..Default::default() })
                .await
                .expect_err(sql);
            assert!(!error.contains("not configured"), "{sql} must fail on the guard: {error}");
        }
    }

    #[tokio::test]
    async fn db_query_on_a_read_reaches_the_connection_step() {
        let runtime = offline();
        let error = query(&runtime, QueryInput { sql: "SELECT 1".to_owned(), ..Default::default() })
            .await
            .expect_err("no database configured");
        assert!(error.contains("not configured"), "{error}");
    }

    #[tokio::test]
    async fn db_exec_needs_confirm_before_anything_else() {
        let runtime = offline();
        for confirm in [None, Some(false)] {
            let error = exec(
                &runtime,
                ExecInput { sql: "DELETE FROM t".to_owned(), confirm, ..Default::default() },
                "stdio",
                "hash",
            )
            .await
            .expect_err("refused");
            assert!(error.contains("confirm: true"), "{error}");
        }
        let error = exec(
            &runtime,
            ExecInput { sql: "BEGIN".to_owned(), confirm: Some(true), ..Default::default() },
            "stdio",
            "hash",
        )
        .await
        .expect_err("transaction control");
        assert!(error.contains("transaction control"), "{error}");
        let error = exec(
            &runtime,
            ExecInput { sql: "DELETE FROM t; DELETE FROM u".to_owned(), confirm: Some(true), ..Default::default() },
            "stdio",
            "hash",
        )
        .await
        .expect_err("multiple statements");
        assert!(error.contains("statements"), "{error}");
    }

    #[test]
    fn timeouts_can_only_be_lowered() {
        let config = Config::from_environment(|name| {
            (name == "SHENRON_MCP_DB_STATEMENT_TIMEOUT_MS").then(|| "5000".to_owned())
        });
        assert_eq!(timeout_ms(&config, None), 5000);
        assert_eq!(timeout_ms(&config, Some(60_000)), 5000);
        assert_eq!(timeout_ms(&config, Some(1)), 100);
        assert_eq!(timeout_ms(&config, Some(750)), 750);
        assert!(limits_sql(5000).contains("statement_timeout = 5000"));
    }
}
