// SPDX-License-Identifier: Apache-2.0
//! The admin data-plane tool group: PostgreSQL (`db.*`), Redis (`redis.*`) and the auto-learn
//! memory (`memory.*`), plus the live resources (`shenron://db/table/<name>`,
//! `shenron://events/<channel>`). Admin tier only: see [`crate::admin`].

use rmcp::{
    RoleServer,
    handler::server::wrapper::Parameters,
    model::{CallToolResult, Resource, ResourceTemplate},
    service::RequestContext,
    tool, tool_router,
};
use serde_json::{Value, json};

use crate::{
    ShenronMcp,
    admin::{self, args_hash, caller_of, runtime},
    admin_live::{self, Target, events_uri},
    admin_memory::{self, LearnInput, RecallInput},
    admin_pg::{self, ExecInput, ExplainInput, QueryInput, SchemaInput},
    admin_redis::{self, DelInput, InfoInput, KeyInput, ScanInput, SetInput},
    admin_sql::clip,
    dragonball_tools::err,
};

const ADMIN_ONLY: &str = "the data-plane tools require elevated access (bearer token or allow-listed IP)";

fn denied() -> CallToolResult {
    err(ADMIN_ONLY)
}

#[tool_router(router = admin_router, vis = "pub(crate)")]
impl ShenronMcp {
    #[tool(
        name = "db.schema",
        description = "Admin only. Describe the PostgreSQL schema of Shenron: relations (tables, views, materialized views) with columns, types, defaults, primary key, indexes, foreign keys, size and estimated row count. Filter with schema and table. Read-only.",
        annotations(
            title = "PostgreSQL schema",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn db_schema(
        &self,
        Parameters(input): Parameters<SchemaInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = format!("{:?}.{:?}", input.schema, input.table);
        admin::run(caller_of(&context), "db.schema", &args, summary, admin_pg::schema(runtime(), input))
            .await
    }

    #[tool(
        name = "db.query",
        description = "Admin only. Run ONE read statement (SELECT, WITH, VALUES or TABLE) against PostgreSQL in a READ ONLY transaction with a statement timeout; rows come back as JSON objects, capped by rows and bytes (truncated says when). Multiple statements and writes are refused: use db.exec for writes.",
        annotations(
            title = "PostgreSQL read query",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn db_query(
        &self,
        Parameters(input): Parameters<QueryInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(&input.sql, 300);
        admin::run(caller_of(&context), "db.query", &args, summary, admin_pg::query(runtime(), input)).await
    }

    #[tool(
        name = "db.exec",
        description = "Admin only. Run ONE write or DDL statement against PostgreSQL. Requires confirm: true. Runs in a transaction with a statement timeout; the audit row (caller, tool, argument hash, duration) is written in the same transaction, so an unaudited write cannot persist. Returns the affected row count; dry_run rolls the statement back. Transaction control and multiple statements are refused. Check the effect afterwards with db.query.",
        annotations(
            title = "PostgreSQL write",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn db_exec(
        &self,
        Parameters(input): Parameters<ExecInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let caller = caller_of(&context);
        let hash = args_hash(&input);
        let args = input.clone();
        let summary = clip(&input.sql, 300);
        let call = admin_pg::exec(runtime(), input, &caller, &hash);
        admin::run(caller.clone(), "db.exec", &args, summary, call).await
    }

    #[tool(
        name = "db.explain",
        description = "Admin only. Plan one statement (SELECT, WITH, VALUES, TABLE, INSERT, UPDATE, DELETE, MERGE) as EXPLAIN (FORMAT JSON). analyze: true executes it to report real timings and buffers, in a READ ONLY transaction (so only read statements can be analyzed).",
        annotations(
            title = "PostgreSQL EXPLAIN",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn db_explain(
        &self,
        Parameters(input): Parameters<ExplainInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(&input.sql, 300);
        admin::run(caller_of(&context), "db.explain", &args, summary, admin_pg::explain(runtime(), input))
            .await
    }

    #[tool(
        name = "redis.info",
        description = "Admin only. Redis INFO as JSON, grouped by section (server, clients, memory, stats, replication, keyspace, ...). Read-only.",
        annotations(
            title = "Redis INFO",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn redis_info(
        &self,
        Parameters(input): Parameters<InfoInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = format!("{:?}", input.section);
        admin::run(caller_of(&context), "redis.info", &args, summary, admin_redis::info(runtime(), input))
            .await
    }

    #[tool(
        name = "redis.get",
        description = "Admin only. Read a Redis key of any common type (string, hash, list, set, sorted set, stream): type, size and the value, capped by element count and bytes (truncated says when). Read-only.",
        annotations(
            title = "Redis GET",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn redis_get(
        &self,
        Parameters(input): Parameters<KeyInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(&input.key, 200);
        admin::run(caller_of(&context), "redis.get", &args, summary, admin_redis::get(runtime(), input)).await
    }

    #[tool(
        name = "redis.scan",
        description = "Admin only. List Redis keys matching a glob pattern with SCAN (never KEYS), up to the key cap; next_cursor continues, complete says when the keyspace was exhausted. Read-only.",
        annotations(
            title = "Redis SCAN",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn redis_scan(
        &self,
        Parameters(input): Parameters<ScanInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(input.pattern.as_deref().unwrap_or("*"), 200);
        admin::run(caller_of(&context), "redis.scan", &args, summary, admin_redis::scan(runtime(), input))
            .await
    }

    #[tool(
        name = "redis.ttl",
        description = "Admin only. Existence, type and remaining time to live of a Redis key. Read-only.",
        annotations(
            title = "Redis TTL",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn redis_ttl(
        &self,
        Parameters(input): Parameters<KeyInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(&input.key, 200);
        admin::run(caller_of(&context), "redis.ttl", &args, summary, admin_redis::ttl(runtime(), input)).await
    }

    #[tool(
        name = "redis.set",
        description = "Admin only. SET a Redis string key (optional expiry in seconds, optional only-if-absent). Requires confirm: true. Audited by key name; the value is never logged.",
        annotations(
            title = "Redis SET",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn redis_set(
        &self,
        Parameters(input): Parameters<SetInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        // The value is neither hashed nor kept in the audit: only the key and the options.
        let args = SetInput { value: String::new(), ..input.clone() };
        let summary = clip(&input.key, 200);
        admin::run(caller_of(&context), "redis.set", &args, summary, admin_redis::set(runtime(), input)).await
    }

    #[tool(
        name = "redis.del",
        description = "Admin only. DEL up to 100 named Redis keys (no patterns). Requires confirm: true. Returns how many existed and were removed.",
        annotations(
            title = "Redis DEL",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn redis_del(
        &self,
        Parameters(input): Parameters<DelInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(&input.keys.join(" "), 300);
        admin::run(caller_of(&context), "redis.del", &args, summary, admin_redis::del(runtime(), input)).await
    }

    #[tool(
        name = "memory.learn",
        description = "Admin only. Store a fact you learned, with its source URL and the time. The same fact (ignoring case and spacing) updates its record and counts a confirmation. Dragon Ball canon still comes from the dragonball.* tools: store here what a session found out on top of them (schema quirks, ops findings, corrections), always with a source.",
        annotations(
            title = "Learn a fact",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn memory_learn(
        &self,
        Parameters(input): Parameters<LearnInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let caller = caller_of(&context);
        let args = input.clone();
        let summary = admin_memory::learn_summary(&input);
        let call = admin_memory::learn(runtime(), input, &caller);
        admin::run(caller.clone(), "memory.learn", &args, summary, call).await
    }

    #[tool(
        name = "memory.recall",
        description = "Admin only. Recall facts stored with memory.learn, newest first, with their source URL and learn time. Filter by text and tags. Read-only.",
        annotations(
            title = "Recall facts",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn memory_recall(
        &self,
        Parameters(input): Parameters<RecallInput>,
        context: RequestContext<RoleServer>,
    ) -> CallToolResult {
        if self.is_public() {
            return denied();
        }
        let args = input.clone();
        let summary = clip(input.query.as_deref().unwrap_or(""), 200);
        admin::run(caller_of(&context), "memory.recall", &args, summary, admin_memory::recall(runtime(), input))
            .await
    }
}

/// Resources of the admin tier: one per listened event channel.
#[must_use]
pub fn resources() -> Vec<Resource> {
    runtime()
        .hub
        .channels()
        .into_iter()
        .map(|channel| {
            Resource::new(events_uri(&channel), format!("events-{channel}"))
                .with_title(format!("NOTIFY events on {channel}"))
                .with_description("Recent PostgreSQL NOTIFY payloads; subscribe for live updates.")
                .with_mime_type("application/json")
        })
        .collect()
}

/// Resource templates of the admin tier.
#[must_use]
pub fn templates() -> Vec<ResourceTemplate> {
    vec![
        ResourceTemplate::new("shenron://db/table/{name}", "db-table")
            .with_title("PostgreSQL table")
            .with_description(
                "Row sample of a table (name or schema.name); subscribe to be told when it changes \
                 (needs the shenron_mcp_notify trigger on that table).",
            )
            .with_mime_type("application/json"),
        ResourceTemplate::new("shenron://events/{channel}", "db-events")
            .with_title("PostgreSQL NOTIFY channel")
            .with_description("Recent payloads of a NOTIFY channel; subscribe for live updates.")
            .with_mime_type("application/json"),
    ]
}

/// The JSON content of an admin resource.
///
/// # Errors
/// The database or the channel is unavailable.
pub async fn read_resource(target: Target) -> Result<Value, String> {
    let runtime = runtime();
    match target {
        Target::Table(name) => admin_pg::table_resource(runtime, &name).await,
        Target::Events(channel) => {
            runtime.hub.watch(&Target::Events(channel.clone()));
            admin_live::ensure_started(runtime);
            Ok(json!({
                "channel": channel,
                "listening": runtime.hub.connected(),
                "events": runtime.hub.recent(&channel, 100),
            }))
        },
    }
}

/// Register interest in an admin resource URI (starts the LISTEN task).
///
/// # Errors
/// The URI is not an admin resource.
pub fn watch(uri: &str) -> Result<Target, String> {
    let target = admin_live::parse_uri(uri).ok_or_else(|| format!("unknown resource {uri}"))?;
    let runtime = runtime();
    runtime.hub.watch(&target);
    admin_live::ensure_started(runtime);
    Ok(target)
}
