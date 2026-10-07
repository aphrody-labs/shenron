// SPDX-License-Identifier: Apache-2.0
//! Native client for the shared Shenron chat, conversations and memory contracts.

use std::io::Write as _;
use std::time::Duration;

use clap::{Args, Subcommand, ValueEnum};
use miette::IntoDiagnostic;
use serde_json::{Value, json};

#[derive(Debug, Args)]
pub(crate) struct Connection {
    /// Shenron server origin; otherwise SHENRON_CHAT_URL or the configured site.
    #[arg(long, global = true)]
    api: Option<String>,
}

impl Connection {
    fn endpoint(&self, route: &str) -> miette::Result<reqwest::Url> {
        let explicit = self.api.clone().or_else(|| {
            std::env::var("SHENRON_CHAT_URL").ok().filter(|value| !value.trim().is_empty())
        });
        let base = match explicit {
            Some(value) => reqwest::Url::parse(&value)
                .map_err(|_| miette::miette!("invalid Shenron server origin"))?,
            None => crate::shenron_cmd::site_base()?,
        };
        if !matches!(base.scheme(), "http" | "https")
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || base.path() != "/"
        {
            return Err(miette::miette!("--api must be an HTTP(S) origin without credentials"));
        }
        base.join(route).into_diagnostic()
    }

    fn request(
        &self,
        method: reqwest::Method,
        route: &str,
    ) -> miette::Result<reqwest::RequestBuilder> {
        let mut request = crate::shenron_cmd::http_client()?
            .request(method, self.endpoint(route)?)
            .timeout(Duration::from_secs(600));
        // This is the owner's Better Auth session token, never a bot/admin credential.
        if let Ok(token) = std::env::var("SHENRON_SESSION_TOKEN")
            && !token.trim().is_empty()
        {
            request = request.bearer_auth(token);
        }
        Ok(request)
    }

    pub(crate) async fn report(&self, route: &str, query: &[(&str, String)]) -> miette::Result<()> {
        let response = send(self.request(reqwest::Method::GET, route)?.query(query)).await?;
        let value: Value =
            response.json().await.map_err(|_| miette::miette!("invalid Shenron JSON response"))?;
        println!("{}", serde_json::to_string_pretty(&value).into_diagnostic()?);
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub(crate) enum Backend {
    Auto,
    GeminiWeb,
    Local,
    Extractive,
}

impl Backend {
    const fn name(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::GeminiWeb => "gemini-web",
            Self::Local => "local",
            Self::Extractive => "extractive",
        }
    }
}

#[derive(Debug, Args)]
pub(crate) struct ChatArgs {
    /// Question or instruction (up to 4,000 characters).
    message: String,
    #[command(flatten)]
    connection: Connection,
    /// Resume a conversation stored by this server for the authenticated owner.
    #[arg(long, value_parser = conversation_id)]
    conversation: Option<String>,
    /// Model id returned by `shenron models`.
    #[arg(long)]
    model: Option<String>,
    #[arg(long, value_enum, default_value = "auto")]
    backend: Backend,
    /// Disable persistent memory recall and writing for this turn.
    #[arg(long)]
    no_memory: bool,
    /// Disable source retrieval, including MCP retrieval, for this turn.
    #[arg(long)]
    no_rag: bool,
    /// Emit the complete non-streaming ChatResponse JSON.
    #[arg(long)]
    json: bool,
}

fn conversation_id(raw: &str) -> Result<String, String> {
    if (8..=64).contains(&raw.len())
        && raw.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"_:-".contains(&byte))
    {
        Ok(raw.to_owned())
    } else {
        Err("conversation id must contain 8-64 ASCII letters, digits, _, : or -".to_owned())
    }
}

#[derive(Debug, Subcommand)]
pub(crate) enum ConversationAction {
    /// List conversations visible to the authenticated owner.
    List {
        #[command(flatten)]
        connection: Connection,
    },
    /// Read one conversation and its messages.
    Show {
        #[arg(value_parser = conversation_id)]
        id: String,
        #[command(flatten)]
        connection: Connection,
    },
}

pub(crate) async fn conversations(action: ConversationAction) -> miette::Result<()> {
    match action {
        ConversationAction::List { connection } => {
            connection.report("/api/v1/conversations", &[]).await
        },
        ConversationAction::Show { id, connection } => {
            connection.report(&format!("/api/v1/conversations/{id}"), &[]).await
        },
    }
}

#[derive(Debug, Subcommand)]
pub(crate) enum MemoryAction {
    /// List or search the authenticated owner's persistent memories.
    List {
        #[command(flatten)]
        connection: Connection,
        #[arg(long)]
        query: Option<String>,
        #[arg(long, default_value_t = 100, value_parser = clap::value_parser!(u16).range(1..=500))]
        limit: u16,
    },
}

pub(crate) async fn memory(action: MemoryAction) -> miette::Result<()> {
    let MemoryAction::List { connection, query, limit } = action;
    let mut params = vec![("limit", limit.to_string())];
    if let Some(query) = query {
        params.push(("q", query));
    }
    connection.report("/api/v1/memory", &params).await
}

async fn send(request: reqwest::RequestBuilder) -> miette::Result<reqwest::Response> {
    let response =
        request.send().await.map_err(|_| miette::miette!("Shenron service unavailable"))?;
    if !response.status().is_success() {
        // Never include provider URLs, headers or arbitrary response bodies in diagnostics.
        return Err(miette::miette!("Shenron HTTP {}", response.status().as_u16()));
    }
    Ok(response)
}

pub(crate) async fn run(args: ChatArgs) -> miette::Result<()> {
    let message = args.message.trim();
    if message.is_empty() || message.chars().count() > 4_000 {
        return Err(miette::miette!("message must contain 1-4,000 characters"));
    }
    let mut body = json!({"message": message, "surface": "desktop",
        "backend": args.backend.name(), "stream": !args.json});
    if let Some(id) = args.conversation {
        body["conversationId"] = json!(id);
    }
    if let Some(model) = args.model {
        body["model"] = json!(model);
    }
    if args.no_memory {
        body["memoryOptIn"] = json!(false);
    }
    if args.no_rag {
        body["ragOptIn"] = json!(false);
        body["topK"] = json!(0);
        body["tools"] = json!(false);
    }
    let accept = if args.json { "application/json" } else { "text/event-stream" };
    let mut response = send(
        args.connection
            .request(reqwest::Method::POST, "/api/v1/chat")?
            .header(reqwest::header::ACCEPT, accept)
            .json(&body),
    )
    .await?;
    if args.json {
        let value: Value =
            response.json().await.map_err(|_| miette::miette!("invalid Shenron chat response"))?;
        if !matches!(value["done"]["finishReason"].as_str(), Some("stop" | "length"))
            || !value["answer"].is_string()
        {
            return Err(miette::miette!("Shenron generation did not finish successfully"));
        }
        println!("{}", serde_json::to_string_pretty(&value).into_diagnostic()?);
        return Ok(());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !content_type.starts_with("text/event-stream") {
        return Err(miette::miette!("expected a Shenron event stream"));
    }
    let mut stream = ChatStream::default();
    let interrupt = tokio::signal::ctrl_c();
    tokio::pin!(interrupt);
    loop {
        let chunk = tokio::select! {
            chunk = response.chunk() => chunk.map_err(|_| miette::miette!("Shenron stream interrupted"))?,
            result = &mut interrupt => {
                result.into_diagnostic()?;
                if let Some(id) = &stream.stream_id {
                    let route = format!("/api/v1/chat/streams/{id}/cancel");
                    let cancel = args.connection.request(reqwest::Method::POST, &route)?;
                    let _ = tokio::time::timeout(Duration::from_secs(5), send(cancel)).await;
                }
                return Err(miette::miette!("Shenron generation interrupted by user"));
            },
        };
        let Some(chunk) = chunk else { break };
        for (event, data) in stream.push(&chunk)? {
            match event.as_str() {
                "meta" => {
                    stream.stream_id = data["streamId"].as_str().map(str::to_owned);
                    eprintln!(
                        "conversation: {}",
                        data["conversationId"].as_str().unwrap_or("unknown")
                    );
                },
                "delta" => {
                    print!("{}", data["text"].as_str().unwrap_or_default());
                    std::io::stdout().flush().into_diagnostic()?;
                },
                "error" => {
                    return Err(miette::miette!(
                        "Shenron generation failed ({})",
                        data["code"].as_str().unwrap_or("unknown")
                    ));
                },
                "done" => {
                    if !matches!(data["finishReason"].as_str(), Some("stop" | "length")) {
                        return Err(miette::miette!(
                            "Shenron generation did not finish successfully"
                        ));
                    }
                    println!();
                    if let Some(citations) = data["citations"].as_array() {
                        for citation in citations {
                            println!(
                                "[{}] {}{}",
                                citation["n"],
                                citation["title"].as_str().unwrap_or_default(),
                                citation["url"]
                                    .as_str()
                                    .map(|url| format!(" — {url}"))
                                    .unwrap_or_default()
                            );
                        }
                    }
                    if data["stored"] != true {
                        eprintln!("conversation was not persisted by the server");
                    }
                    return Ok(());
                },
                _ => {},
            }
        }
    }
    Err(miette::miette!("Shenron stream ended before the completion event"))
}

#[derive(Default)]
struct ChatStream {
    buffer: Vec<u8>,
    stream_id: Option<String>,
}

impl ChatStream {
    fn push(&mut self, chunk: &[u8]) -> miette::Result<Vec<(String, Value)>> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > 1 << 20 {
            return Err(miette::miette!("Shenron event exceeds 1 MiB"));
        }
        let mut events = Vec::new();
        while let Some((end, delimiter)) = [
            self.buffer.windows(2).position(|v| v == b"\n\n").map(|end| (end, 2)),
            self.buffer.windows(4).position(|v| v == b"\r\n\r\n").map(|end| (end, 4)),
        ]
        .into_iter()
        .flatten()
        .min_by_key(|(end, _)| *end)
        {
            let frame = std::str::from_utf8(&self.buffer[..end])
                .map_err(|_| miette::miette!("invalid UTF-8 in Shenron event"))?;
            let mut event = "message";
            let mut data = Vec::new();
            for line in frame.lines() {
                if let Some(value) = line.strip_prefix("event:") {
                    event = value.trim();
                }
                if let Some(value) = line.strip_prefix("data:") {
                    data.push(value.strip_prefix(' ').unwrap_or(value));
                }
            }
            if !data.is_empty() {
                let value = serde_json::from_str(&data.join("\n"))
                    .map_err(|_| miette::miette!("invalid JSON in Shenron event"))?;
                events.push((event.to_owned(), value));
            }
            self.buffer.drain(..end + delimiter);
        }
        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_preserves_split_unicode_and_multiple_events() {
        let frames = "event: delta\r\ndata: {\"text\":\"龍 é\"}\r\n\r\nevent: done\ndata: {\"finishReason\":\"stop\"}\n\n";
        for split in 0..=frames.len() {
            let mut stream = ChatStream::default();
            let mut events = stream.push(&frames.as_bytes()[..split]).unwrap();
            events.extend(stream.push(&frames.as_bytes()[split..]).unwrap());
            assert_eq!(events.len(), 2, "split {split}");
            assert_eq!(events[0], ("delta".to_owned(), json!({"text":"龍 é"})));
            assert_eq!(events[1].0, "done");
        }
    }

    #[test]
    fn stream_ignores_comments_and_handles_multiline_data() {
        let mut stream = ChatStream::default();
        let events = stream
            .push(b": heartbeat\n\nevent: error\ndata: {\ndata: \"code\":\"provider_error\"}\n\n")
            .unwrap();
        assert_eq!(events, vec![("error".to_owned(), json!({"code":"provider_error"}))]);
    }

    #[test]
    fn connection_rejects_credentials_and_conversation_path_injection() {
        for api in [
            "https://user:secret@example.test",
            "file:///tmp/data",
            "https://example.test/token?secret=yes",
        ] {
            assert!(Connection { api: Some(api.to_owned()) }.endpoint("/api/v1/chat").is_err());
        }
        for id in ["../secret", "abc/defghi", "short", "éééééééé"] {
            assert!(conversation_id(id).is_err());
        }
        assert!(conversation_id("conversation:123").is_ok());
    }
}
