// SPDX-License-Identifier: Apache-2.0
//! Site tools of the Shenron MCP server: the remaining public read APIs of dragonballfr.com and
//! the write/admin surface that an elevated caller may use.
//!
//! Every tool here calls a route that exists in `apps/site/src/app/api/**`; nothing is a generic
//! method/path proxy.
//!
//! # Credentials (read from the MCP server process environment)
//!
//! | Variable | Used by |
//! | --- | --- |
//! | `SHENRON_DATABOOKS_API_TOKEN`, else `DATABOOKS_API_TOKEN`, `SHENRON_ADMIN_TOKEN`, `DBFR_TOKEN` | site bearer routes: databooks writes, site configuration, reports, OCR review |
//! | `SHENRON_AGENT_API_KEY` (`dbfr_agent_...`, created in `/admin/agents`) | `dragonball.agent_*` (`/api/agent/v1/*`; its scopes decide what is allowed) |
//!
//! These credentials never reach an anonymous caller: the tools that use them live only in the
//! elevated tool set (see [`crate::ShenronMcp::public_tools`]).

#![cfg(not(target_arch = "wasm32"))]

use rmcp::{
    model::CallToolResult,
    schemars::{self, JsonSchema},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shenron_rag::dragonball::process_env;

use crate::dragonball_tools::{DEFAULT_TIMEOUT, Query, call, done, err, site_api_base, site_get};

fn first_env(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| process_env(name))
}

fn site_token() -> Result<String, String> {
    first_env(&[
        "SHENRON_DATABOOKS_API_TOKEN",
        "DATABOOKS_API_TOKEN",
        "SHENRON_ADMIN_TOKEN",
        "DBFR_TOKEN",
    ])
    .ok_or_else(|| {
        "no site API token configured: set $SHENRON_DATABOOKS_API_TOKEN (or $DATABOOKS_API_TOKEN, \
         $SHENRON_ADMIN_TOKEN, $DBFR_TOKEN) in the MCP server environment"
            .to_owned()
    })
}

fn agent_key() -> Result<String, String> {
    process_env("SHENRON_AGENT_API_KEY").ok_or_else(|| {
        "no agent key configured: set $SHENRON_AGENT_API_KEY (a `dbfr_agent_...` key from \
         /admin/agents) in the MCP server environment"
            .to_owned()
    })
}

enum Auth {
    Site,
    Agent,
}

async fn send(
    method: reqwest::Method,
    path: &str,
    query: Query<'_>,
    body: Option<Value>,
    auth: Auth,
) -> CallToolResult {
    let token = match auth {
        Auth::Site => site_token(),
        Auth::Agent => agent_key(),
    };
    let token = match token {
        Ok(token) => token,
        Err(message) => return err(message),
    };
    done(
        call(method, &site_api_base(), path, &query, body.as_ref(), Some(&token), DEFAULT_TIMEOUT)
            .await,
    )
}

fn opt<T: ToString>(value: Option<T>) -> Option<String> {
    value.map(|v| v.to_string())
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

/// Input of `dragonball.search`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct SearchRequest {
    #[schemars(description = "Free-text query (2 to 100 characters), typo-tolerant")]
    pub query: String,
}

pub(crate) async fn search(r: SearchRequest) -> CallToolResult {
    let query: String = r.query.trim().chars().take(100).collect();
    if query.chars().count() < 2 {
        return err("query must contain at least 2 characters");
    }
    done(site_get("/api/search", vec![("q", Some(query))]).await)
}

/// Input of `dragonball.sources_search`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct SourcesSearchRequest {
    #[schemars(description = "Search terms")]
    pub query: String,
    #[schemars(description = "Source classification filter (the response lists the valid ones)")]
    #[serde(default)]
    pub kind: Option<String>,
    #[schemars(description = "Number of results (default 24)")]
    #[serde(default)]
    pub limit: Option<u32>,
    #[schemars(description = "Pagination offset")]
    #[serde(default)]
    pub offset: Option<u32>,
}

pub(crate) async fn sources_search(r: SourcesSearchRequest) -> CallToolResult {
    done(
        site_get(
            "/api/sources/search",
            vec![
                ("q", Some(r.query)),
                ("kind", r.kind),
                ("limit", opt(r.limit)),
                ("offset", opt(r.offset)),
            ],
        )
        .await,
    )
}

/// Input of `dragonball.wiki_events`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct WikiEventsRequest {
    #[schemars(description = "Search terms (title, Japanese title, participants, techniques)")]
    #[serde(default)]
    pub q: Option<String>,
    #[schemars(description = "Event kinds: battle, tournament, timeline (comma-separated)")]
    #[serde(default)]
    pub kind: Option<String>,
    #[schemars(description = "Canon filter: all, true, false or manga")]
    #[serde(default)]
    pub canon: Option<String>,
    #[schemars(description = "Series: DB, DBZ, DBS, DBGT or DB_DAIMA")]
    #[serde(default)]
    pub series: Option<String>,
    #[schemars(description = "Sort order: chronology or title")]
    #[serde(default)]
    pub sort: Option<String>,
    #[schemars(description = "Page number (default 1)")]
    #[serde(default)]
    pub page: Option<u32>,
    #[schemars(description = "Page size (default 24, max 100)")]
    #[serde(default)]
    pub limit: Option<u32>,
}

pub(crate) async fn wiki_events(r: WikiEventsRequest) -> CallToolResult {
    done(
        site_get(
            "/api/wiki/events",
            vec![
                ("q", r.q),
                ("type", r.kind),
                ("canon", r.canon),
                ("series", r.series),
                ("sort", r.sort),
                ("page", opt(r.page)),
                ("limit", opt(r.limit)),
            ],
        )
        .await,
    )
}

pub(crate) async fn wiki_timelines() -> CallToolResult {
    done(site_get("/api/wiki/timelines", vec![]).await)
}

/// Input of `dragonball.wiki_media`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct WikiMediaRequest {
    #[schemars(
        description = "Work kind: manga, databook, guide, light_novel, anime_comic or spin_off"
    )]
    #[serde(default)]
    pub kind: Option<String>,
    #[schemars(description = "Series code (DB, DBS, DBZ_ANIME_COMICS, DB_MOVIES, ...)")]
    #[serde(default)]
    pub series: Option<String>,
    #[schemars(description = "Work slug (e.g. dragon-ball)")]
    #[serde(default)]
    pub slug: Option<String>,
    #[schemars(description = "Edition: tankobon, full_color, kanzenban, soshuuhen, ...")]
    #[serde(default)]
    pub edition: Option<String>,
}

pub(crate) async fn wiki_media(r: WikiMediaRequest) -> CallToolResult {
    done(
        site_get(
            "/api/wiki/media",
            vec![("kind", r.kind), ("series", r.series), ("slug", r.slug), ("edition", r.edition)],
        )
        .await,
    )
}

/// Input of `dragonball.wiki_contributors`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct WikiContributorsRequest {
    #[schemars(description = "Search terms (name, kanji, romaji, biography)")]
    #[serde(default)]
    pub q: Option<String>,
    #[schemars(
        description = "Category: author, editorial_staff, scenario, animation, voice, music, \
                       publisher or other"
    )]
    #[serde(default)]
    pub category: Option<String>,
    #[schemars(description = "Spotlight filter: all, true or false")]
    #[serde(default)]
    pub spotlight: Option<String>,
    #[schemars(description = "Sort order: spotlight or name")]
    #[serde(default)]
    pub sort: Option<String>,
    #[schemars(description = "Page number (default 1)")]
    #[serde(default)]
    pub page: Option<u32>,
    #[schemars(description = "Page size (default 24, max 100)")]
    #[serde(default)]
    pub limit: Option<u32>,
}

pub(crate) async fn wiki_contributors(r: WikiContributorsRequest) -> CallToolResult {
    done(
        site_get(
            "/api/wiki/contributors",
            vec![
                ("q", r.q),
                ("category", r.category),
                ("spotlight", r.spotlight),
                ("sort", r.sort),
                ("page", opt(r.page)),
                ("limit", opt(r.limit)),
            ],
        )
        .await,
    )
}

pub(crate) async fn wiki_variants() -> CallToolResult {
    done(site_get("/api/wiki/variants", vec![]).await)
}

pub(crate) async fn manga_catalog() -> CallToolResult {
    done(site_get("/api/manga", vec![]).await)
}

/// A numeric identifier.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct IdRequest {
    #[schemars(description = "Numeric identifier (>= 1)")]
    pub id: u32,
}

pub(crate) async fn manga_volume(r: IdRequest) -> CallToolResult {
    if r.id == 0 {
        return err("id must be >= 1");
    }
    done(site_get(&format!("/api/manga/volume/{}", r.id), vec![]).await)
}

// ---------------------------------------------------------------------------
// Databooks: writes and review (site bearer token)
// ---------------------------------------------------------------------------

/// One plate of a databook record.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub(crate) struct DatabookPage {
    #[schemars(description = "Plate number (>= 1)")]
    pub number: u32,
    #[schemars(description = "Image URL or path of the plate")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[schemars(description = "Transcription of the plate")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

/// Writable fields of a databook record (all optional on update).
#[derive(Debug, Clone, Default, Deserialize, Serialize, JsonSchema)]
pub(crate) struct DatabookFields {
    #[schemars(description = "Kind: databook, interview or artbook")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[schemars(description = "Title (required on creation)")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[schemars(description = "Japanese title")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title_ja: Option<String>,
    #[schemars(description = "Author")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[schemars(description = "Publication date, Unix milliseconds")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_at: Option<i64>,
    #[schemars(description = "Cover image URL or path")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[schemars(description = "Description")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[schemars(description = "Source URL (never Fandom)")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[schemars(description = "Editorial category (e.g. 'V-Jump')")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[schemars(description = "Published on the public site (false hides the record)")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub visible: Option<bool>,
    #[schemars(description = "Plates; on update this REPLACES the whole plate array (prefer \
                              databook_page_edit or dbfr_deposit to touch single plates)")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pages: Option<Vec<DatabookPage>>,
}

pub(crate) async fn databook_create(r: DatabookFields) -> CallToolResult {
    if r.title.as_deref().map(str::trim).is_none_or(str::is_empty) {
        return err("title is required");
    }
    match serde_json::to_value(&r) {
        Ok(body) => {
            send(reqwest::Method::POST, "/api/databooks", vec![], Some(body), Auth::Site).await
        },
        Err(e) => err(e),
    }
}

/// Input of `dragonball.databook_update`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct DatabookUpdateRequest {
    #[schemars(description = "Databook id")]
    pub id: u32,
    #[serde(flatten)]
    pub fields: DatabookFields,
}

pub(crate) async fn databook_update(r: DatabookUpdateRequest) -> CallToolResult {
    if r.id == 0 {
        return err("id must be >= 1");
    }
    let body = match serde_json::to_value(&r.fields) {
        Ok(body) => body,
        Err(e) => return err(e),
    };
    if body.as_object().is_none_or(serde_json::Map::is_empty) {
        return err("nothing to update: pass at least one field");
    }
    send(
        reqwest::Method::PATCH,
        &format!("/api/databooks/{}", r.id),
        vec![],
        Some(body),
        Auth::Site,
    )
    .await
}

pub(crate) async fn databook_delete(r: IdRequest) -> CallToolResult {
    if r.id == 0 {
        return err("id must be >= 1");
    }
    send(reqwest::Method::DELETE, &format!("/api/databooks/{}", r.id), vec![], None, Auth::Site)
        .await
}

/// Input of `dragonball.databook_page_edit`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct DatabookPageEditRequest {
    #[schemars(description = "Databook id")]
    pub id: u32,
    #[schemars(description = "Plate number (>= 1); it must already exist in the record")]
    pub number: u32,
    #[schemars(description = "New transcription (at most 40,000 characters)")]
    #[serde(default)]
    pub text: Option<String>,
    #[schemars(description = "Erase this plate's transcription (the image stays)")]
    #[serde(default)]
    pub clear_text: bool,
    #[schemars(description = "Mark the plate as reviewed (true) or remove the mark (false)")]
    #[serde(default)]
    pub verified: Option<bool>,
}

pub(crate) async fn databook_page_edit(r: DatabookPageEditRequest) -> CallToolResult {
    if r.id == 0 || r.number == 0 {
        return err("id and number must be >= 1");
    }
    let mut body = json!({ "number": r.number });
    if r.clear_text {
        body["text"] = Value::Null;
    } else if let Some(text) = &r.text {
        if text.trim().is_empty() {
            return err("text is blank: pass clear_text=true to erase a transcription on purpose");
        }
        body["text"] = json!(text);
    }
    if let Some(verified) = r.verified {
        body["verifiee"] = json!(verified);
    }
    if body.as_object().is_some_and(|map| map.len() == 1) {
        return err("nothing to write: pass text, clear_text or verified");
    }
    send(
        reqwest::Method::PATCH,
        &format!("/api/databooks/{}/pages", r.id),
        vec![],
        Some(body),
        Auth::Site,
    )
    .await
}

pub(crate) async fn databook_anomalies(r: IdRequest) -> CallToolResult {
    if r.id == 0 {
        return err("id must be >= 1");
    }
    send(
        reqwest::Method::GET,
        &format!("/api/databooks/{}/anomalies", r.id),
        vec![],
        None,
        Auth::Site,
    )
    .await
}

/// Input of `dragonball.databook_ocr_review` (and its deprecated alias
/// `dragonball.databook_relecture_ocr`).
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct OcrReviewRequest {
    #[schemars(description = "Databook id")]
    pub id: u32,
    #[schemars(description = "Plate number to re-read")]
    pub plate: u32,
}

pub(crate) async fn databook_ocr_review(r: OcrReviewRequest) -> CallToolResult {
    if r.id == 0 || r.plate == 0 {
        return err("id and plate must be >= 1");
    }
    send(
        reqwest::Method::GET,
        &format!("/api/databooks/{}/ocr-review", r.id),
        vec![("page", Some(r.plate.to_string()))],
        None,
        Auth::Site,
    )
    .await
}

// ---------------------------------------------------------------------------
// Site configuration and reports (site bearer token)
// ---------------------------------------------------------------------------

/// The editable site configuration documents.
#[derive(Debug, Clone, Copy, Deserialize, JsonSchema)]
pub(crate) enum ConfigName {
    #[serde(rename = "timeline", alias = "chronologie")]
    Timeline,
    #[serde(rename = "home")]
    Home,
    #[serde(rename = "canon")]
    Canon,
    #[serde(rename = "banner")]
    Banner,
    #[serde(rename = "theme")]
    Theme,
    #[serde(rename = "wiki-launch")]
    WikiLaunch,
}

impl ConfigName {
    const fn path(self) -> &'static str {
        match self {
            Self::Timeline => "/api/timeline-config",
            Self::Home => "/api/home-config",
            Self::Canon => "/api/canon-config",
            Self::Banner => "/api/banner-config",
            Self::Theme => "/api/theme-config",
            Self::WikiLaunch => "/api/wiki-launch",
        }
    }
}

/// Input of `dragonball.site_config_get`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct ConfigGetRequest {
    #[schemars(
        description = "Configuration: timeline (formerly chronologie, still accepted), home, canon, banner, theme or wiki-launch"
    )]
    pub name: ConfigName,
}

pub(crate) async fn site_config_get(r: ConfigGetRequest) -> CallToolResult {
    send(reqwest::Method::GET, r.name.path(), vec![], None, Auth::Site).await
}

/// Input of `dragonball.site_config_put`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct ConfigPutRequest {
    #[schemars(
        description = "Configuration: timeline (formerly chronologie, still accepted), home, canon, banner, theme or wiki-launch"
    )]
    pub name: ConfigName,
    #[schemars(description = "Patch document, in the shape returned by site_config_get")]
    pub config: Value,
}

pub(crate) async fn site_config_put(r: ConfigPutRequest) -> CallToolResult {
    if !r.config.is_object() {
        return err("config must be a JSON object");
    }
    send(reqwest::Method::PUT, r.name.path(), vec![], Some(r.config), Auth::Site).await
}

/// Input of `dragonball.reports_list`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct ReportsListRequest {
    #[schemars(description = "Status: open (default), in_progress, resolved, closed or all")]
    #[serde(default)]
    pub status: Option<String>,
}

pub(crate) async fn reports_list(r: ReportsListRequest) -> CallToolResult {
    send(reqwest::Method::GET, "/api/admin/reports", vec![("status", r.status)], None, Auth::Site)
        .await
}

/// Input of `dragonball.reports_update`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportsUpdateRequest {
    #[schemars(description = "Report id (from reports_list)")]
    pub id: String,
    #[schemars(description = "New status: open, in_progress, resolved or closed")]
    #[serde(default)]
    pub status: Option<String>,
    #[schemars(description = "Internal note")]
    #[serde(default)]
    pub admin_note: Option<String>,
    #[schemars(
        description = "false hides the report (logical delete, revisioned); true restores it"
    )]
    #[serde(default)]
    pub visible: Option<bool>,
}

pub(crate) async fn reports_update(r: ReportsUpdateRequest) -> CallToolResult {
    if r.id.trim().is_empty() {
        return err("id is required");
    }
    let mut body = json!({ "id": r.id });
    if let Some(visible) = r.visible {
        body["visible"] = json!(visible);
    } else {
        if let Some(status) = &r.status {
            body["status"] = json!(status);
        }
        if let Some(note) = &r.admin_note {
            body["adminNote"] = json!(note);
        }
        if body.as_object().is_some_and(|map| map.len() == 1) {
            return err("nothing to update: pass status, adminNote or visible");
        }
    }
    send(reqwest::Method::PATCH, "/api/admin/reports", vec![], Some(body), Auth::Site).await
}

// ---------------------------------------------------------------------------
// Agent API (`/api/agent/v1/*`, agent key with scopes)
// ---------------------------------------------------------------------------

pub(crate) async fn agent_whoami() -> CallToolResult {
    send(reqwest::Method::GET, "/api/agent/v1/whoami", vec![], None, Auth::Agent).await
}

/// Input of `dragonball.agent_feed`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentFeedRequest {
    #[schemars(description = "Filter: tout (default), articles, wiki, communaute or discussions")]
    #[serde(default)]
    pub filter: Option<String>,
    #[schemars(description = "Page (1 to 25)")]
    #[serde(default)]
    pub page: Option<u32>,
    #[schemars(description = "Items per page (5 to 50, default 20)")]
    #[serde(default)]
    pub per_page: Option<u32>,
}

pub(crate) async fn agent_feed(r: AgentFeedRequest) -> CallToolResult {
    send(
        reqwest::Method::GET,
        "/api/agent/v1/feed",
        vec![("filter", r.filter), ("page", opt(r.page)), ("perPage", opt(r.per_page))],
        None,
        Auth::Agent,
    )
    .await
}

/// Input of `dragonball.agent_articles`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentArticlesRequest {
    #[schemars(description = "published (default), draft or all")]
    #[serde(default)]
    pub status: Option<String>,
    #[schemars(description = "Page (1 to 200)")]
    #[serde(default)]
    pub page: Option<u32>,
    #[schemars(description = "Items per page (1 to 100, default 25)")]
    #[serde(default)]
    pub per_page: Option<u32>,
}

pub(crate) async fn agent_articles(r: AgentArticlesRequest) -> CallToolResult {
    send(
        reqwest::Method::GET,
        "/api/agent/v1/articles",
        vec![("status", r.status), ("page", opt(r.page)), ("perPage", opt(r.per_page))],
        None,
        Auth::Agent,
    )
    .await
}

/// Input of `dragonball.agent_article_create`.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentArticleCreateRequest {
    #[schemars(description = "Title (3 characters minimum)")]
    pub title: String,
    #[schemars(description = "Article body in Markdown (at most 120,000 characters)")]
    pub markdown: String,
    #[schemars(description = "URL slug (derived from the title when omitted)")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[schemars(description = "Short excerpt")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excerpt: Option<String>,
    #[schemars(description = "Cover image URL")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[schemars(description = "Cover alt text")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover_alt: Option<String>,
    #[schemars(description = "Tags")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[schemars(description = "draft (default), scheduled or published; anything beyond draft \
                              needs the publish:articles scope, otherwise it is saved as a draft")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[schemars(description = "Publication date (ISO 8601)")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    #[schemars(description = "SEO title")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seo_title: Option<String>,
    #[schemars(description = "SEO description")]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seo_description: Option<String>,
}

pub(crate) async fn agent_article_create(r: AgentArticleCreateRequest) -> CallToolResult {
    if r.title.trim().chars().count() < 3 {
        return err("title needs at least 3 characters");
    }
    if r.markdown.trim().is_empty() {
        return err("markdown is required");
    }
    match serde_json::to_value(&r) {
        Ok(body) => {
            send(reqwest::Method::POST, "/api/agent/v1/articles", vec![], Some(body), Auth::Agent)
                .await
        },
        Err(e) => err(e),
    }
}

/// Input of `dragonball.agent_comments`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct AgentCommentsRequest {
    #[schemars(description = "Discussion target, `post:<id>`")]
    pub target: String,
    #[schemars(description = "Sort order (default recent)")]
    #[serde(default)]
    pub sort: Option<String>,
    #[schemars(description = "Page (1 to 500)")]
    #[serde(default)]
    pub page: Option<u32>,
}

pub(crate) async fn agent_comments(r: AgentCommentsRequest) -> CallToolResult {
    send(
        reqwest::Method::GET,
        "/api/agent/v1/comments",
        vec![("target", Some(r.target)), ("sort", r.sort), ("page", opt(r.page))],
        None,
        Auth::Agent,
    )
    .await
}

/// Input of `dragonball.agent_comment_post`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentCommentPostRequest {
    #[schemars(description = "Discussion target, `post:<id>`")]
    pub target: String,
    #[schemars(description = "Message text; it is always signed with the agent's name")]
    pub body: String,
    #[schemars(description = "Parent comment id, to reply in a thread")]
    #[serde(default)]
    pub parent_id: Option<String>,
}

pub(crate) async fn agent_comment_post(r: AgentCommentPostRequest) -> CallToolResult {
    if r.body.trim().is_empty() {
        return err("body is required");
    }
    let body = json!({ "target": r.target, "body": r.body, "parentId": r.parent_id });
    send(reqwest::Method::POST, "/api/agent/v1/comments", vec![], Some(body), Auth::Agent).await
}

/// Input of `dragonball.agent_comment_moderate`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct AgentCommentModerateRequest {
    #[schemars(description = "Comment id")]
    pub id: String,
    #[schemars(description = "hide, restore, pin or unpin (needs the moderate scope)")]
    pub action: String,
}

pub(crate) async fn agent_comment_moderate(r: AgentCommentModerateRequest) -> CallToolResult {
    if !["hide", "restore", "pin", "unpin"].contains(&r.action.as_str()) {
        return err("action must be hide, restore, pin or unpin");
    }
    let body = json!({ "id": r.id, "action": r.action });
    send(reqwest::Method::PATCH, "/api/agent/v1/comments", vec![], Some(body), Auth::Agent).await
}

pub(crate) async fn agent_wiki_schema() -> CallToolResult {
    send(reqwest::Method::GET, "/api/agent/v1/wiki/contribution-schema", vec![], None, Auth::Agent)
        .await
}

/// Input of `dragonball.agent_wiki_entities`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct AgentWikiEntitiesRequest {
    #[schemars(description = "A table of the contribution contract (see agent_wiki_schema), \
                              e.g. db_characters")]
    pub table: String,
    #[schemars(description = "Text filter")]
    #[serde(default)]
    pub q: Option<String>,
    #[schemars(description = "Rows (1 to 100, default 25)")]
    #[serde(default)]
    pub limit: Option<u32>,
}

pub(crate) async fn agent_wiki_entities(r: AgentWikiEntitiesRequest) -> CallToolResult {
    send(
        reqwest::Method::GET,
        "/api/agent/v1/wiki/entities",
        vec![("table", Some(r.table)), ("q", r.q), ("limit", opt(r.limit))],
        None,
        Auth::Agent,
    )
    .await
}

/// Input of `dragonball.agent_wiki_contributions`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct AgentWikiContributionsRequest {
    #[schemars(description = "pending (default), accepted, rejected, superseded or withdrawn")]
    #[serde(default)]
    pub status: Option<String>,
    #[schemars(description = "Rows (1 to 100, default 50)")]
    #[serde(default)]
    pub limit: Option<u32>,
}

pub(crate) async fn agent_wiki_contributions(r: AgentWikiContributionsRequest) -> CallToolResult {
    send(
        reqwest::Method::GET,
        "/api/agent/v1/wiki/contributions",
        vec![("status", r.status), ("limit", opt(r.limit))],
        None,
        Auth::Agent,
    )
    .await
}

/// Input of `dragonball.agent_wiki_contribute`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentWikiContributeRequest {
    #[schemars(description = "Table of the contribution contract (see agent_wiki_schema)")]
    pub table: String,
    #[schemars(description = "Primary key of the row (see agent_wiki_entities)")]
    pub row_id: String,
    #[schemars(description = "Column to correct")]
    pub column: String,
    #[schemars(description = "The proposed value")]
    pub value_after: String,
    #[schemars(description = "Sources: tome + plate, databook + page or a dated interview. \
                              Third-party wikis (Fandom) are not sources. Unsourced proposals \
                              are accepted but flagged.")]
    #[serde(default)]
    pub sources: Option<String>,
    #[schemars(description = "Comment for the moderator")]
    #[serde(default)]
    pub comment: Option<String>,
    #[schemars(description = "Public path of the entity page (e.g. /wiki/characters/1)")]
    #[serde(default)]
    pub path: Option<String>,
}

pub(crate) async fn agent_wiki_contribute(r: AgentWikiContributeRequest) -> CallToolResult {
    if r.table.trim().is_empty() || r.row_id.trim().is_empty() || r.column.trim().is_empty() {
        return err("table, rowId and column are required");
    }
    if r.value_after.trim().is_empty() {
        return err("valueAfter is required");
    }
    let body = json!({
        "table": r.table,
        "rowId": r.row_id,
        "column": r.column,
        "valueAfter": r.value_after,
        "sources": r.sources,
        "comment": r.comment,
        "path": r.path,
    });
    send(reqwest::Method::POST, "/api/agent/v1/wiki/contributions", vec![], Some(body), Auth::Agent)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(result: &CallToolResult) -> String {
        serde_json::to_string(result).unwrap_or_default()
    }

    #[test]
    fn config_names_map_to_real_routes() {
        assert_eq!(ConfigName::Timeline.path(), "/api/timeline-config");
        let old: ConfigName = serde_json::from_str("\"chronologie\"").expect("old name");
        assert_eq!(old.path(), "/api/timeline-config");
        assert_eq!(ConfigName::WikiLaunch.path(), "/api/wiki-launch");
        let parsed: ConfigName = serde_json::from_str("\"wiki-launch\"").expect("name");
        assert_eq!(parsed.path(), "/api/wiki-launch");
        assert!(serde_json::from_str::<ConfigName>("\"../admin\"").is_err());
    }

    #[tokio::test]
    async fn invalid_inputs_are_refused_before_any_request() {
        let blank = databook_create(DatabookFields::default()).await;
        assert!(text(&blank).contains("title is required"));
        let empty =
            databook_update(DatabookUpdateRequest { id: 3, fields: DatabookFields::default() })
                .await;
        assert!(text(&empty).contains("nothing to update"));
        let erase = databook_page_edit(DatabookPageEditRequest {
            id: 3,
            number: 1,
            text: Some("  ".into()),
            clear_text: false,
            verified: None,
        })
        .await;
        assert!(text(&erase).contains("clear_text"));
        let action = agent_comment_moderate(AgentCommentModerateRequest {
            id: "x".into(),
            action: "delete".into(),
        })
        .await;
        assert!(text(&action).contains("hide, restore, pin or unpin"));
    }

    #[test]
    fn databook_fields_serialize_only_what_is_set() {
        let fields = DatabookFields {
            title: Some("Daizenshuu 7".into()),
            title_ja: Some("ja".into()),
            ..DatabookFields::default()
        };
        let body = serde_json::to_value(&fields).expect("json");
        assert_eq!(body, json!({ "title": "Daizenshuu 7", "title_ja": "ja" }));
    }

    #[test]
    fn update_request_flattens_the_fields() {
        let request: DatabookUpdateRequest =
            serde_json::from_value(json!({ "id": 7, "visible": false })).expect("request");
        assert_eq!(request.id, 7);
        assert_eq!(request.fields.visible, Some(false));
    }
}
