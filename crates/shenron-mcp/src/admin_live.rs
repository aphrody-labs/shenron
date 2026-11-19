// SPDX-License-Identifier: Apache-2.0
//! Real-time context: one `LISTEN` connection feeds MCP resource-updated notifications.
//!
//! Resources (admin tier only):
//!
//! - `shenron://events/<channel>`: every NOTIFY on `<channel>`; reading it returns the most recent
//!   payloads kept in memory.
//! - `shenron://db/table/<name>` (`name` or `schema.name`): changes of a table, announced by the
//!   opt-in trigger function of `deploy/sql/20261119_shenron_mcp_notify.sql` on the
//!   `shenron_mcp_table` channel; reading it returns a row sample.
//!
//! Clients subscribe with `resources/subscribe` (or `subscriptions/listen`); the task starts on the
//! first subscription (or at boot when `SHENRON_MCP_LISTEN_CHANNELS` is set) and reconnects with
//! backoff, re-issuing every LISTEN.

use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};

use futures_util::StreamExt as _;
use rmcp::{
    Peer, RoleServer,
    model::ResourceUpdatedNotificationParam,
    service::SubscriptionSink,
};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_postgres::{AsyncMessage, NoTls};

use crate::{
    admin::{Runtime, TABLE_CHANNEL},
    admin_sql,
};

/// URI prefix of event-channel resources.
pub const EVENTS_PREFIX: &str = "shenron://events/";
/// URI prefix of table resources.
pub const TABLE_PREFIX: &str = "shenron://db/table/";

/// Most events kept per channel for `resources/read`.
const RING: usize = 200;

/// What a resource URI designates.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    /// `shenron://db/table/<name>`.
    Table(String),
    /// `shenron://events/<channel>`.
    Events(String),
}

/// Parse an admin resource URI.
#[must_use]
pub fn parse_uri(uri: &str) -> Option<Target> {
    if let Some(name) = uri.strip_prefix(TABLE_PREFIX) {
        return admin_sql::qualified_ident(name).ok().map(|_| Target::Table(name.to_owned()));
    }
    let channel = uri.strip_prefix(EVENTS_PREFIX)?;
    admin_sql::is_channel(channel).then(|| Target::Events(channel.to_owned()))
}

/// Resource URI of an event channel.
#[must_use]
pub fn events_uri(channel: &str) -> String {
    format!("{EVENTS_PREFIX}{channel}")
}

/// Resource URIs updated by a NOTIFY of `payload` on `channel`: the channel itself, and, on the
/// table channel, the changed table under both `schema.name` and `name`.
#[must_use]
pub fn uris_for(channel: &str, payload: &str) -> Vec<String> {
    let mut uris = vec![events_uri(channel)];
    if channel == TABLE_CHANNEL
        && let Ok(Value::Object(body)) = serde_json::from_str::<Value>(payload)
        && let Some(table) = body.get("table").and_then(Value::as_str)
        && admin_sql::qualified_ident(table).is_ok()
    {
        uris.push(format!("{TABLE_PREFIX}{table}"));
        if let Some((_, bare)) = table.split_once('.') {
            uris.push(format!("{TABLE_PREFIX}{bare}"));
        }
    }
    uris
}

#[derive(Clone)]
enum Sink {
    Peer(Peer<RoleServer>),
    Stream(SubscriptionSink),
}

impl Sink {
    async fn notify(&self, uri: &str) -> Result<(), String> {
        match self {
            Self::Peer(peer) => peer
                .notify_resource_updated(ResourceUpdatedNotificationParam::new(uri))
                .await
                .map_err(|error| error.to_string()),
            Self::Stream(sink) => {
                sink.notify_resource_updated(uri).await.map_err(|error| error.to_string())
            },
        }
    }
}

#[derive(Clone)]
struct Subscriber {
    id: u64,
    session: String,
    sink: Sink,
}

/// Subscriptions, recent events and the LISTEN task state.
pub struct Hub {
    next_id: AtomicU64,
    subscribers: Mutex<HashMap<String, Vec<Subscriber>>>,
    events: Mutex<HashMap<String, VecDeque<Value>>>,
    channels: Mutex<BTreeSet<String>>,
    commands: mpsc::UnboundedSender<String>,
    receiver: Mutex<Option<mpsc::UnboundedReceiver<String>>>,
    started: AtomicBool,
    connected: AtomicBool,
    sequence: AtomicU64,
}

impl std::fmt::Debug for Hub {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Hub")
            .field("started", &self.started.load(Ordering::Relaxed))
            .field("connected", &self.connected.load(Ordering::Relaxed))
            .finish_non_exhaustive()
    }
}

fn locked<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

impl Hub {
    /// A hub that will LISTEN on `channels` (and on any channel a client subscribes to).
    #[must_use]
    pub fn new(channels: &[String]) -> Self {
        let (commands, receiver) = mpsc::unbounded_channel();
        Self {
            next_id: AtomicU64::new(1),
            subscribers: Mutex::new(HashMap::new()),
            events: Mutex::new(HashMap::new()),
            channels: Mutex::new(channels.iter().cloned().collect()),
            commands,
            receiver: Mutex::new(Some(receiver)),
            started: AtomicBool::new(false),
            connected: AtomicBool::new(false),
            sequence: AtomicU64::new(0),
        }
    }

    /// Is the LISTEN connection up?
    #[must_use]
    pub fn connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    /// Channels currently listened on.
    #[must_use]
    pub fn channels(&self) -> Vec<String> {
        locked(&self.channels).iter().cloned().collect()
    }

    /// Make sure the channel behind `target` is listened on.
    pub fn watch(&self, target: &Target) {
        let channel = match target {
            Target::Table(_) => TABLE_CHANNEL,
            Target::Events(channel) => channel,
        };
        if locked(&self.channels).insert(channel.to_owned()) {
            self.commands.send(channel.to_owned()).ok();
        }
    }

    fn add(&self, uri: &str, session: &str, sink: Sink) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let mut subscribers = locked(&self.subscribers);
        let list = subscribers.entry(uri.to_owned()).or_default();
        // One subscription per (resource, session): a repeated subscribe replaces the earlier one.
        list.retain(|existing| existing.session != session);
        list.push(Subscriber { id, session: session.to_owned(), sink });
        id
    }

    /// Subscribe a legacy `resources/subscribe` client (identified by its session key).
    pub fn subscribe_peer(&self, uri: &str, session: &str, peer: Peer<RoleServer>) -> u64 {
        self.add(uri, session, Sink::Peer(peer))
    }

    /// Subscribe a `subscriptions/listen` stream.
    pub fn subscribe_stream(&self, uri: &str, sink: SubscriptionSink) -> u64 {
        let session = format!("stream:{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        self.add(uri, &session, Sink::Stream(sink))
    }

    /// Remove the subscription of `session` on `uri`.
    pub fn unsubscribe(&self, uri: &str, session: &str) {
        let mut subscribers = locked(&self.subscribers);
        if let Some(list) = subscribers.get_mut(uri) {
            list.retain(|existing| existing.session != session);
            if list.is_empty() {
                subscribers.remove(uri);
            }
        }
    }

    /// Remove one subscription by id.
    pub fn remove(&self, id: u64) {
        let mut subscribers = locked(&self.subscribers);
        subscribers.retain(|_, list| {
            list.retain(|existing| existing.id != id);
            !list.is_empty()
        });
    }

    /// Number of live subscriptions.
    #[must_use]
    pub fn subscription_count(&self) -> usize {
        locked(&self.subscribers).values().map(Vec::len).sum()
    }

    /// Keep an event for `resources/read` of its channel.
    pub fn record(&self, channel: &str, payload: &str) {
        let at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let seq = self.sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let payload = serde_json::from_str::<Value>(payload).unwrap_or_else(|_| json!(payload));
        let mut events = locked(&self.events);
        let ring = events.entry(channel.to_owned()).or_default();
        if ring.len() == RING {
            ring.pop_front();
        }
        ring.push_back(json!({ "seq": seq, "at": at, "channel": channel, "payload": payload }));
    }

    /// The most recent events of `channel` (oldest first).
    #[must_use]
    pub fn recent(&self, channel: &str, limit: usize) -> Vec<Value> {
        let events = locked(&self.events);
        events.get(channel).map_or_else(Vec::new, |ring| {
            let skip = ring.len().saturating_sub(limit);
            ring.iter().skip(skip).cloned().collect()
        })
    }

    /// Record a NOTIFY and tell every subscriber of the affected resources.
    pub async fn dispatch(&self, channel: &str, payload: &str) {
        self.record(channel, payload);
        for uri in uris_for(channel, payload) {
            let targets: Vec<Subscriber> =
                locked(&self.subscribers).get(&uri).cloned().unwrap_or_default();
            for subscriber in targets {
                if let Err(error) = subscriber.sink.notify(&uri).await {
                    tracing::debug!(%uri, %error, "dropping a closed resource subscription");
                    self.remove(subscriber.id);
                }
            }
        }
    }
}

/// Start the LISTEN task once (a no-op when already started or without a database).
pub fn ensure_started(runtime: &Arc<Runtime>) {
    let hub = &runtime.hub;
    if runtime.config.database_url.is_none() || hub.started.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(commands) = locked(&hub.receiver).take() else {
        return;
    };
    tokio::spawn(listen_loop(Arc::clone(runtime), commands));
}

// A daemon: it reconnects for the whole life of the process, so the loop has no exit.
#[allow(clippy::infinite_loop)]
async fn listen_loop(runtime: Arc<Runtime>, mut commands: mpsc::UnboundedReceiver<String>) {
    let mut backoff = Duration::from_secs(1);
    loop {
        let started = tokio::time::Instant::now();
        let outcome = session(&runtime, &mut commands).await;
        runtime.hub.connected.store(false, Ordering::Relaxed);
        if let Err(error) = outcome {
            tracing::warn!(%error, "LISTEN connection lost; reconnecting");
        }
        if started.elapsed() > Duration::from_secs(60) {
            backoff = Duration::from_secs(1);
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}

async fn session(
    runtime: &Arc<Runtime>,
    commands: &mut mpsc::UnboundedReceiver<String>,
) -> Result<(), String> {
    let url = runtime.config.database_url.clone().ok_or("no database configured")?;
    let hub = &runtime.hub;
    let (client, mut connection) = tokio_postgres::connect(&url, NoTls)
        .await
        .map_err(|error| format!("connect: {error}"))?;
    let (notifications, mut inbox) = mpsc::unbounded_channel::<(String, String)>();
    let mut driver = tokio::spawn(async move {
        let mut messages = futures_util::stream::poll_fn(move |cx| connection.poll_message(cx));
        while let Some(message) = messages.next().await {
            match message {
                Ok(AsyncMessage::Notification(note)) => {
                    if notifications.send((note.channel().to_owned(), note.payload().to_owned())).is_err() {
                        break;
                    }
                },
                Ok(_) => {},
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(())
    });
    for channel in hub.channels() {
        client
            .batch_execute(&format!("LISTEN {}", admin_sql::quote_ident(&channel)))
            .await
            .map_err(|error| format!("LISTEN {channel}: {error}"))?;
    }
    hub.connected.store(true, Ordering::Relaxed);
    tracing::info!(channels = ?hub.channels(), "LISTEN connection up");
    loop {
        tokio::select! {
            Some((channel, payload)) = inbox.recv() => hub.dispatch(&channel, &payload).await,
            Some(channel) = commands.recv() => {
                client
                    .batch_execute(&format!("LISTEN {}", admin_sql::quote_ident(&channel)))
                    .await
                    .map_err(|error| format!("LISTEN {channel}: {error}"))?;
            },
            finished = &mut driver => {
                return match finished {
                    Ok(Ok(())) => Err("connection closed".to_owned()),
                    Ok(Err(error)) => Err(error),
                    Err(error) => Err(format!("connection task: {error}")),
                };
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_uris_parse_and_reject_hostile_names() {
        assert_eq!(
            parse_uri("shenron://db/table/bot.media_editions"),
            Some(Target::Table("bot.media_editions".to_owned()))
        );
        assert_eq!(parse_uri("shenron://db/table/users"), Some(Target::Table("users".to_owned())));
        assert_eq!(
            parse_uri("shenron://events/shenron_mcp_table"),
            Some(Target::Events("shenron_mcp_table".to_owned()))
        );
        for bad in [
            "shenron://db/table/",
            "shenron://db/table/a;drop",
            "shenron://db/table/a.b.c",
            "shenron://events/",
            "shenron://events/a-b",
            "shenron://guide",
            "https://example.com",
        ] {
            assert_eq!(parse_uri(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_table_notification_updates_both_name_forms() {
        let uris = uris_for(TABLE_CHANNEL, r#"{"table":"bot.media_editions","op":"UPDATE"}"#);
        assert_eq!(
            uris,
            vec![
                "shenron://events/shenron_mcp_table".to_owned(),
                "shenron://db/table/bot.media_editions".to_owned(),
                "shenron://db/table/media_editions".to_owned(),
            ]
        );
        assert_eq!(uris_for(TABLE_CHANNEL, "not json"), vec!["shenron://events/shenron_mcp_table"]);
        assert_eq!(uris_for(TABLE_CHANNEL, r#"{"table":"a;b"}"#).len(), 1);
        assert_eq!(uris_for("orders", r#"{"table":"x"}"#), vec!["shenron://events/orders"]);
    }

    #[test]
    fn the_event_ring_keeps_the_latest_payloads() {
        let hub = Hub::new(&[]);
        for n in 0..(RING + 25) {
            hub.record("orders", &format!(r#"{{"n":{n}}}"#));
        }
        hub.record("orders", "plain text");
        let recent = hub.recent("orders", 3);
        assert_eq!(recent.len(), 3);
        assert_eq!(recent[2]["payload"], "plain text");
        assert_eq!(recent[1]["payload"]["n"], RING + 24);
        assert_eq!(hub.recent("orders", 10_000).len(), RING);
        assert!(hub.recent("other", 5).is_empty());
    }

    #[test]
    fn watching_a_resource_listens_on_its_channel() {
        let hub = Hub::new(&[]);
        hub.watch(&Target::Table("bot.x".to_owned()));
        hub.watch(&Target::Events("orders".to_owned()));
        hub.watch(&Target::Events("orders".to_owned()));
        assert_eq!(hub.channels(), vec!["orders".to_owned(), TABLE_CHANNEL.to_owned()]);
        assert!(!hub.connected());
        assert_eq!(hub.subscription_count(), 0);
    }
}
