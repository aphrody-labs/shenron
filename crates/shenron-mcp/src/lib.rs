// SPDX-License-Identifier: Apache-2.0
//! Shenron MCP server: the `dragonball.*` tools (RAG, wiki, manga, databooks,
//! canon, bot, A2A, site writes and editorial admin) and the `dbfr_*` databooks tools.
//!
//! Transport only: the local corpus, persona and `APHRODY_AI_*` chat
//! resolution live in [`shenron_rag::dragonball`]; wiki, bot, databook, manga,
//! canon and A2A data stay behind the public Shenron bot and site APIs. Admin and
//! write tools fail closed without their tokens.
//!
//! Two tiers: the *public* tool set (read-only tools, no credentials used) and the *full* set
//! (every tool). Over stdio and on a loopback server the full set is served; on the public HTTP
//! server it is unlocked per request by a bearer token or an allow-listed IP (see [`access`]).

use rmcp::{ServerHandler, handler::server::wrapper::Parameters, tool, tool_handler, tool_router};

pub mod access;
pub mod dbfr_tools;
pub mod dragonball_tools;
pub mod guide;
pub mod http;
pub mod lexicon_tools;
pub mod site_tools;

use rmcp::handler::server::router::tool::ToolRouter;

/// The Shenron MCP server (stateless; every tool reads its configuration from the environment).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ShenronMcp {
    public: bool,
}

/// Tools backed by the Koharu engine (heavy compute, elevated only).
#[cfg(not(feature = "koharu"))]
const SCANLATION_TOOLS: [&str; 2] = ["dragonball.manga_scanlate", "dragonball.databooks_scanlate"];

/// Read tools that use a server-side credential or expose non-public data: elevated only, even
/// though they do not write.
const ELEVATED_READS: [&str; 5] = [
    "dragonball.databook_anomalies",
    "dragonball.databook_ocr_review",
    "dragonball.databook_relecture_ocr",
    "dragonball.site_config_get",
    "dragonball.reports_list",
];

/// Read-only tools without heavy compute: what an anonymous public endpoint may serve.
fn is_public(tool: &rmcp::model::Tool) -> bool {
    let name = tool.name.as_ref();
    // Admin catalogs, scanlation (heavy compute), writes and every tool backed by a server-side
    // credential (agent API, site configuration, reports, OCR review) never reach anonymous clients.
    if name.contains("scanlate")
        || name.contains("admin")
        || name.starts_with("dragonball.agent_")
        || ELEVATED_READS.contains(&name)
    {
        return false;
    }
    matches!(name, "dbfr_databooks" | "dbfr_pages" | "dbfr_texts" | "dbfr_textes")
        || tool.annotations.as_ref().and_then(|annotations| annotations.read_only_hint)
            == Some(true)
}

impl ShenronMcp {
    /// The full server (stdio, local agents, elevated HTTP callers): every tool, write and admin
    /// tools gated by their tokens.
    #[must_use]
    pub const fn full() -> Self {
        Self { public: false }
    }

    /// The public server: read-only tools only (no admin, write, A2A write or scanlation).
    #[must_use]
    pub const fn public() -> Self {
        Self { public: true }
    }

    /// Every tool of the full server. The scanlation tools exist only in builds with the
    /// `koharu` feature: without the engine they could only fail, so they are not registered.
    #[must_use]
    pub fn all_tools() -> ToolRouter<Self> {
        let mut router = Self::dbfr_router();
        router += Self::dragonball_router();
        router += Self::site_router();
        #[cfg(not(feature = "koharu"))]
        for name in SCANLATION_TOOLS {
            router.remove_route(name);
        }
        router
    }

    /// The tools of the public server.
    #[must_use]
    pub fn public_tools() -> ToolRouter<Self> {
        let mut router = Self::all_tools();
        let private: Vec<String> = router
            .list_all()
            .into_iter()
            .filter(|tool| !is_public(tool))
            .map(|tool| tool.name.to_string())
            .collect();
        for name in private {
            router.remove_route(&name);
        }
        router
    }

    fn tools(&self) -> ToolRouter<Self> {
        if self.public { Self::public_tools() } else { Self::all_tools() }
    }
}

#[tool_handler(router = self.tools())]
impl ServerHandler for ShenronMcp {
    fn get_info(&self) -> rmcp::model::ServerConfig {
        let mut implementation = rmcp::model::Implementation::default();
        "shenron-mcp".clone_into(&mut implementation.name);
        env!("CARGO_PKG_VERSION").clone_into(&mut implementation.version);
        let mut info = rmcp::model::ServerConfig::default();
        info.protocol_version = rmcp::model::ProtocolVersion::LATEST;
        info.capabilities = rmcp::model::ServerCapabilities::builder()
            .enable_tools()
            .enable_resources()
            .enable_prompts()
            .build();
        info.server_info = implementation;
        info.instructions = Some(
            "shenron-mcp: Dragon Ball knowledge of dragonballfr.com, the reference source for ANY \
             Dragon Ball question (manga, databooks, canon, timeline, wiki). Start with \
             dragonball.rag_search or dragonball.rag_context (sourced passages: cite their URL), \
             dragonball.search (typo-tolerant, whole wiki) and dragonball.canon_check (canon \
             verdicts); dragonball.rag_ask writes a grounded answer. local=true (or \
             SHENRON_LOCAL_RAG=1) answers from the local corpus without network. Anonymous callers \
             get the read-only tools. With a bearer token or from an allow-listed IP the server \
             also exposes the write and admin tools (dbfr_deposit, dragonball.databook_*, \
             dragonball.agent_*, dragonball.site_config_*, dragonball.reports_*, \
             dragonball.admin_*): they call the Shenron APIs with the server's own tokens \
             (DBFR_TOKEN, SHENRON_API_ADMIN_TOKEN, SHENRON_DATABOOKS_API_TOKEN, \
             SHENRON_AGENT_API_KEY), are dry runs where they say so, and refuse without them. \
             Manga, scans and Toriyama's own statements outrank everything; Fandom is never a \
             source."
                .to_owned(),
        );
        info
    }

    async fn list_resources(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<rmcp::model::ListResourcesResult, rmcp::ErrorData> {
        Ok(guide::list_resources())
    }

    async fn read_resource(
        &self,
        request: rmcp::model::ReadResourceRequestParams,
        _context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<rmcp::model::ReadResourceResponse, rmcp::ErrorData> {
        match guide::resource_text(&request.uri) {
            Some(text) => Ok(rmcp::model::ReadResourceResult::new(vec![
                rmcp::model::ResourceContents::text(text, request.uri)
                    .with_mime_type("text/markdown"),
            ])
            .into()),
            None => Err(rmcp::ErrorData::resource_not_found(
                format!("unknown resource {}", request.uri),
                None,
            )),
        }
    }

    async fn list_prompts(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<rmcp::model::ListPromptsResult, rmcp::ErrorData> {
        Ok(guide::list_prompts())
    }

    async fn get_prompt(
        &self,
        request: rmcp::model::GetPromptRequestParams,
        _context: rmcp::service::RequestContext<rmcp::RoleServer>,
    ) -> Result<rmcp::model::GetPromptResponse, rmcp::ErrorData> {
        let arguments = request.arguments.unwrap_or_default();
        match guide::prompt_messages(&request.name, &arguments) {
            Some(messages) => Ok(rmcp::model::GetPromptResult::new(messages).into()),
            None => Err(rmcp::ErrorData::invalid_params(
                format!("unknown prompt {}", request.name),
                None,
            )),
        }
    }
}

#[tool_router(router = dbfr_router)]
impl ShenronMcp {
    #[tool(
        description = "List Dragon Ball FR databook records (dragonballfr.com), the official guides, artbooks and interviews. Reads the public catalogue; `include_hidden` is elevated only (it needs elevated access and $DBFR_TOKEN) and is refused otherwise rather than silently serving the public subset."
    )]
    async fn dbfr_databooks(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabooksListRequest>,
    ) -> String {
        dbfr_tools::list(req, !self.public).await
    }

    #[tool(
        description = "Report one databook's plates: how many carry an image, how many are transcribed, and the numbers of those still missing a transcription. This is what says where OCR work remains."
    )]
    async fn dbfr_pages(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabookPagesRequest>,
    ) -> String {
        dbfr_tools::pages(req, !self.public).await
    }

    #[tool(
        description = "Read the stored transcription of specific plates of one databook (at most 40 per call)."
    )]
    async fn dbfr_texts(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabookTextsRequest>,
    ) -> String {
        dbfr_tools::texts(req, !self.public).await
    }

    #[tool(
        description = "Deprecated alias of dbfr_texts, kept for agents already configured with the old name. Read the stored transcription of specific plates of one databook (at most 40 per call)."
    )]
    async fn dbfr_textes(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabookTextsRequest>,
    ) -> String {
        dbfr_tools::texts(req, !self.public).await
    }

    #[tool(
        description = "Elevated only. Deposit transcriptions into one databook. Writes into a public corpus, so it is a dry run unless `apply` is true, refuses a blank text (the API reads it as `nothing to say`), and merges by default so plates absent from the call are untouched. Needs $DBFR_TOKEN in the server environment."
    )]
    async fn dbfr_deposit(
        &self,
        Parameters(req): Parameters<dbfr_tools::DepositRequest>,
    ) -> String {
        dbfr_tools::deposit(req).await
    }
}

#[tool_router(router = dragonball_router)]
impl ShenronMcp {
    #[tool(
        name = "dragonball.rag_search",
        description = "Use this for any Dragon Ball question: hybrid search (BM25 + embeddings, RRF fusion, reranking) over the Dragon Ball knowledge base of dragonballfr.com (manga, databooks, Kanzenshuu, wiki). Returns sourced passages (rowid, kind, title, url, snippet, score) and the effective mode; cite the url. Filters: lang, entity, sourceId, kind. local=true (or SHENRON_LOCAL_RAG=1) queries the local Aphrody corpus. API: bot /api/public/rag/search.",
        annotations(
            title = "Dragon Ball RAG search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_rag_search(
        &self,
        Parameters(r): Parameters<dragonball_tools::RagSearchRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::rag_search(r).await
    }

    #[tool(
        name = "dragonball.rag_context",
        description = "Use this for any Dragon Ball question you must answer with citations: the most relevant passages in full text, numbered [n] with their absolute URL, within a maxChars budget (default 6000). Same filters as rag_search. API: bot /api/public/rag/context.",
        annotations(
            title = "Sourced context ready to cite",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_rag_context(
        &self,
        Parameters(r): Parameters<dragonball_tools::RagContextRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::rag_context(r).await
    }

    #[tool(
        name = "dragonball.rag_ask",
        description = "Use this for any Dragon Ball question: a natural-language question; the RAG selects passages (hits, with url) and the LLM writes a grounded answer in the single bot's voice (Akira Toriyama persona by default in YOLO). The API errors if the LLM is unavailable. local=true uses the APHRODY_AI_* model and the local corpus. API: bot /api/public/rag/chat.",
        annotations(
            title = "Written answer (generative RAG)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_rag_ask(
        &self,
        Parameters(r): Parameters<dragonball_tools::RagAskRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::rag_ask(r).await
    }

    #[tool(
        name = "dragonball.sources",
        description = "Lists the sources/corpora indexed by the Dragon Ball RAG (manga, databooks, Kanzenshuu...). API: bot /api/public/sources.",
        annotations(
            title = "Indexed RAG sources",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_sources(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::sources().await
    }

    #[tool(
        name = "dragonball.data_coverage",
        description = "Real coverage: passages per corpus and kind, embedding model, index date, number of wiki records per section. An empty search on a missing corpus proves nothing. API: bot /api/public/data/coverage.",
        annotations(
            title = "Indexed data coverage",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_data_coverage(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::data_coverage().await
    }

    #[tool(
        name = "dragonball.wiki_search",
        description = "Use this for any Dragon Ball question about a character, place, technique, saga, film... : full-text search in the Dragon Ball wiki; results {category, id, slug, title, snippet} to open with dragonball.wiki_get. API: bot /api/public/wiki/search.",
        annotations(
            title = "Wiki full-text search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_search(
        &self,
        Parameters(r): Parameters<dragonball_tools::WikiSearchRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::wiki_search(r).await
    }

    #[tool(
        name = "dragonball.wiki_list",
        description = "Paginated list of the entities of a wiki category with its total. API: bot /api/public/wiki/{category}.",
        annotations(
            title = "Wiki entity list",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_list(
        &self,
        Parameters(r): Parameters<dragonball_tools::WikiListRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::wiki_list(r).await
    }

    #[tool(
        name = "dragonball.wiki_get",
        description = "Detail of a wiki entity by numeric id or slug. API: bot /api/public/wiki/{category}/{idOrSlug}.",
        annotations(
            title = "Wiki entity detail",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_get(
        &self,
        Parameters(r): Parameters<dragonball_tools::WikiGetRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::wiki_get(r).await
    }

    #[tool(
        name = "dragonball.wiki_categories",
        description = "Registry of the wiki categories: name, label, total. API: bot /api/public/wiki/categories.",
        annotations(
            title = "Wiki categories",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_categories(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::wiki_categories().await
    }

    #[tool(
        name = "dragonball.manga_search",
        description = "Text search (OCR) in the pages of the Dragon Ball manga (limit <= 50). API: bot /api/public/manga/search.",
        annotations(
            title = "Manga search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_search(
        &self,
        Parameters(r): Parameters<dragonball_tools::QueryLimitRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_search(r).await
    }

    #[tool(
        name = "dragonball.manga_volumes",
        description = "Lists the manga volumes, or one volume's detail (with its pages) when series and volume are given. API: bot /api/public/manga/tomes.",
        annotations(
            title = "Manga volumes",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_volumes(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaVolumesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_volumes(r).await
    }

    #[tool(
        name = "dragonball.manga_tomes",
        description = "Deprecated alias of dragonball.manga_volumes, kept for agents already configured with the old name (the tome argument is still accepted for volume).",
        annotations(
            title = "Manga volumes (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_tomes(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaVolumesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_volumes(r).await
    }

    #[tool(
        name = "dragonball.manga_page",
        description = "Metadata and image URL of one page (OCR coordinates series/volume/page). API: bot /api/public/manga/page.",
        annotations(
            title = "Manga page",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_page(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaPageRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_page(r).await
    }

    #[tool(
        name = "dragonball.manga_chapter",
        description = "One chapter page by page: transcription and reading URL; textOnly (default true) omits image URLs. API: site /api/manga/chapter/{id}.",
        annotations(
            title = "Read a manga chapter",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_chapter(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaChapterRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_chapter(r, false).await
    }

    #[tool(
        name = "dragonball.manga_chapitre",
        description = "Deprecated alias of dragonball.manga_chapter, kept for agents already configured with the old name (textOnly is still accepted as texteSeul; the page list is also returned as planches).",
        annotations(
            title = "Read a manga chapter (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_chapitre(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaChapterRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_chapter(r, true).await
    }

    #[tool(
        name = "dragonball.manga_chapter_page",
        description = "One page of a chapter: image, OCR transcription, speech bubbles, neighbours and reading URL. API: site /api/manga/chapter/{id}/pages/{n}.",
        annotations(
            title = "Manga chapter page (site)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_chapter_page(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaChapterPageRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_chapter_page(r).await
    }

    #[tool(
        name = "dragonball.manga_planche",
        description = "Deprecated alias of dragonball.manga_chapter_page, kept for agents already configured with the old name (the planche argument is still accepted for page).",
        annotations(
            title = "Manga chapter page (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_planche(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaChapterPageRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_chapter_page(r).await
    }

    #[tool(
        name = "dragonball.manga_search_pages",
        description = "Searches the transcriptions and returns citable pages with their reading URL (limit <= 100). API: site /api/manga/search.",
        annotations(
            title = "Citable page search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_search_pages(
        &self,
        Parameters(r): Parameters<dragonball_tools::QueryLimitRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_search_pages(r).await
    }

    #[tool(
        name = "dragonball.manga_recherche",
        description = "Deprecated alias of dragonball.manga_search_pages, kept for agents already configured with the old name.",
        annotations(
            title = "Citable page search (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_recherche(
        &self,
        Parameters(r): Parameters<dragonball_tools::QueryLimitRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_search_pages(r).await
    }

    #[tool(
        name = "dragonball.manga_scanlate",
        description = "Elevated only. Analyses a manga page through the CDN and Koharu: detected regions, OCR, translation, cleaning layer and PSD export. Only registered in builds with the koharu feature; needs the Koharu models.",
        annotations(
            title = "Manga page scanlation",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_scanlate(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaScanlateRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_scanlate(r).await
    }

    #[tool(
        name = "dragonball.timeline",
        description = "Use this for any Dragon Ball timeline or order question: the official timeline in its editorial order (episodes, films, volumes); never rebuild it from broadcast dates. Filters era and kind. API: site /api/timeline.",
        annotations(
            title = "Official timeline",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_timeline(
        &self,
        Parameters(r): Parameters<dragonball_tools::TimelineRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::timeline(r).await
    }

    #[tool(
        name = "dragonball.chronologie",
        description = "Deprecated alias of dragonball.timeline, kept for agents already configured with the old name. Use this for any Dragon Ball timeline or order question: the official timeline in its editorial order; filters era and kind.",
        annotations(
            title = "Official timeline (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_chronologie(
        &self,
        Parameters(r): Parameters<dragonball_tools::TimelineRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::timeline(r).await
    }

    #[tool(
        name = "dragonball.bot_stats",
        description = "Public statistics of the Dragon Ball Discord bot and its server. API: bot /api/public/stats.",
        annotations(
            title = "Bot statistics",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_bot_stats(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::bot_stats().await
    }

    #[tool(
        name = "dragonball.bot_personas",
        description = "Active persona of the single bot (Akira Toriyama by default in YOLO). set_persona (elevated only) saves a user persona in <APHRODY_HOME>/persona.json. API: bot /api/public/personas, local fallback.",
        annotations(
            title = "Single bot persona",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_bot_personas(
        &self,
        Parameters(r): Parameters<dragonball_tools::BotPersonasRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::bot_personas(r).await
    }

    #[tool(
        name = "dragonball.bot_leaderboard",
        description = "Public leaderboard of the Discord server's members by level/XP (limit <= 100). API: bot /api/public/leaderboard.",
        annotations(
            title = "Member leaderboard",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_bot_leaderboard(
        &self,
        Parameters(r): Parameters<dragonball_tools::LimitRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::bot_leaderboard(r).await
    }

    #[tool(
        name = "dragonball.bot_commands",
        description = "Public Discord commands of the Dragon Ball bot. API: bot /api/public/commands.",
        annotations(
            title = "Bot commands",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_bot_commands(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::bot_commands().await
    }

    #[tool(
        name = "dragonball.news",
        description = "Latest Dragon Ball news of dragonballfr.com (limit <= 50). API: bot /api/public/news.",
        annotations(
            title = "Dragon Ball news",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_news(
        &self,
        Parameters(r): Parameters<dragonball_tools::LimitRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::news(r).await
    }

    #[tool(
        name = "dragonball.databooks_search",
        description = "Searches the work records (title, author, description) with cover and plate count; does not read plate text (see databooks_plates). Official guides, artbooks and interviews are the primary sources. API: site /api/databooks.",
        annotations(
            title = "Databooks search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databooks_search(
        &self,
        Parameters(r): Parameters<dragonball_tools::DatabooksSearchRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::databooks_search(r).await
    }

    #[tool(
        name = "dragonball.databooks_plates",
        description = "Searches a phrase in the plate transcriptions and returns work, plate and an excerpt around the term. API: site /api/databooks/search.",
        annotations(
            title = "Plate text search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databooks_plates(
        &self,
        Parameters(r): Parameters<dragonball_tools::DatabooksPlatesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::databooks_plates(r).await
    }

    #[tool(
        name = "dragonball.databooks_planches",
        description = "Deprecated alias of dragonball.databooks_plates, kept for agents already configured with the old name (the excerpt is also returned as extrait).",
        annotations(
            title = "Plate text search (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databooks_planches(
        &self,
        Parameters(r): Parameters<dragonball_tools::DatabooksPlatesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::databooks_plates(r).await
    }

    #[tool(
        name = "dragonball.databooks_get",
        description = "Detail of a guide, artbook or interview: metadata, cover, transcribed plates (maxPages default 50) with pageCount, transcribedPages and truncatedPages (the former pagesTranscrites and pagesTronquees are kept as deprecated duplicates). API: site /api/databooks/{id}.",
        annotations(
            title = "Databook record",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databooks_get(
        &self,
        Parameters(r): Parameters<dragonball_tools::DatabooksGetRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::databooks_get(r).await
    }

    #[tool(
        name = "dragonball.databooks_scanlate",
        description = "Elevated only. Analyses a databook plate through the CDN and Koharu: detected regions, OCR, translation, cleaning layer and PSD export. Only registered in builds with the koharu feature; needs the Koharu models.",
        annotations(
            title = "Databook plate scanlation",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databooks_scanlate(
        &self,
        Parameters(r): Parameters<dragonball_tools::DatabooksScanlateRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::databooks_scanlate(r).await
    }

    #[tool(
        name = "dragonball.canon_check",
        description = "Use this for any Dragon Ball canon question (is X canon? what does Toriyama say?): a deterministic canonicity verdict (curated doctrine, five ranks, score, rules, Toriyama's statements, plates, records). Without a question it returns the doctrine. API: site /api/canon.",
        annotations(
            title = "Check canonicity",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_canon_check(
        &self,
        Parameters(r): Parameters<dragonball_tools::CanonCheckRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::canon_check(r).await
    }

    #[tool(
        name = "dragonball.lexicon_search",
        description = "Use this for any Dragon Ball name, technique, place or term to translate or spell: Shenron's one Japanese/French/English lexicon (official Japanese form, French form of the wiki, English form when a source establishes it, aliases), searched in any language and labelled in lang. Offline. API: /api/public/lexicon.",
        annotations(
            title = "Search the lexicon",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn dragonball_lexicon_search(
        &self,
        Parameters(r): Parameters<lexicon_tools::LexiconSearchRequest>,
    ) -> rmcp::model::CallToolResult {
        lexicon_tools::lexicon_search(r)
    }

    #[tool(
        name = "dragonball.canon_references",
        description = "Use this for any Dragon Ball canon question: the corpus of canonicity evidence (Toriyama's statements, translated databook plates), filterable by q and provenance. API: site /api/canon/references.",
        annotations(
            title = "Canon corpus",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_canon_references(
        &self,
        Parameters(r): Parameters<dragonball_tools::CanonReferencesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::canon_references(r).await
    }

    #[tool(
        name = "dragonball.a2a_send",
        description = "Elevated only. A2A protocol (JSON-RPC 2.0) of the Dragon Ball hub, Honest Delivery: rag returns real passages; ocr/translation the measured state; orders for codex, agycli, claude, local_model, subagents stay submitted/INCOMPLET until the peer reports. With taskId + verdict, closes a task (FAIT requires an artifact). API: site /api/a2a.",
        annotations(
            title = "A2A Send",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_a2a_send(
        &self,
        Parameters(r): Parameters<dragonball_tools::A2aSendRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::a2a_send(r).await
    }

    #[tool(
        name = "dragonball.a2a_task_status",
        description = "State, history and artifacts of an A2A task; submitted/working has no result yet. API: site /api/a2a.",
        annotations(
            title = "A2A Task Status",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_a2a_task_status(
        &self,
        Parameters(r): Parameters<dragonball_tools::A2aTaskStatusRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::a2a_task_status(r).await
    }

    #[tool(
        name = "dragonball.a2a_task_list",
        description = "Lists the A2A tasks of the registry, filterable by target. API: site /api/a2a.",
        annotations(
            title = "A2A Task List",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_a2a_task_list(
        &self,
        Parameters(r): Parameters<dragonball_tools::A2aTaskListRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::a2a_task_list(r).await
    }

    #[tool(
        name = "dragonball.a2a_agent_card",
        description = "A2A AgentCard of the Dragon Ball hub (targets and skills).",
        annotations(
            title = "A2A Agent Card",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_a2a_agent_card(&self) -> rmcp::model::CallToolResult {
        rmcp::model::CallToolResult::success(vec![rmcp::model::ContentBlock::text(
            serde_json::to_string_pretty(&dragonball_tools::agent_card()).unwrap_or_default(),
        )])
    }

    #[tool(
        name = "dragonball.admin_databooks_deposit",
        description = "Elevated only. Admin: deposits already-verified OCR transcriptions into a databook (targeted merge, reversible revisions on the site). Needs $SHENRON_DATABOOKS_API_TOKEN.",
        annotations(
            title = "Deposit databook transcriptions",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_admin_databooks_deposit(
        &self,
        Parameters(r): Parameters<dragonball_tools::AdminDepositRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::admin_databooks_deposit(r).await
    }

    #[tool(
        name = "dragonball.admin_bot_commands",
        description = "Elevated only. Admin: commands runnable through the Shenron admin API. Needs $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Bot command catalog",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_admin_bot_commands(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::admin_bot_commands().await
    }

    #[tool(
        name = "dragonball.admin_bot_command_execute",
        description = "Elevated only. Admin: runs a Discord command as the bot's administrator identity; call admin_bot_commands first. Needs $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Run a Shenron command",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_admin_bot_command_execute(
        &self,
        Parameters(r): Parameters<dragonball_tools::AdminCommandRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::admin_bot_command_execute(r).await
    }

    #[tool(
        name = "dragonball.admin_services",
        description = "Elevated only. Admin: service actions explicitly allowed by Shenron. Needs $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Allowed service actions",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_admin_services(&self) -> rmcp::model::CallToolResult {
        dragonball_tools::admin_services().await
    }

    #[tool(
        name = "dragonball.admin_service_action",
        description = "Elevated only. Admin: runs an action listed by admin_services; no arbitrary service or shell. Needs $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Run a service action",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_admin_service_action(
        &self,
        Parameters(r): Parameters<dragonball_tools::AdminServiceActionRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::admin_service_action(r).await
    }
}

#[tool_router(router = site_router)]
impl ShenronMcp {
    #[tool(
        name = "dragonball.search",
        description = "Use this for any Dragon Ball question that names a character, place, technique, saga, film, episode, volume, databook or contributor: typo-tolerant cross-entity search over the whole dragonballfr.com wiki and the external source index. Returns grouped matches to open with wiki_get or databooks_get. API: site /api/search.",
        annotations(
            title = "Global site search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_search(
        &self,
        Parameters(r): Parameters<site_tools::SearchRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::search(r).await
    }

    #[tool(
        name = "dragonball.sources_search",
        description = "Searches the BXC index of external Dragon Ball sources (archives, interviews, press). Never a canon verdict: use canon_check for that. API: site /api/sources/search.",
        annotations(
            title = "External source index search",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_sources_search(
        &self,
        Parameters(r): Parameters<site_tools::SourcesSearchRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::sources_search(r).await
    }

    #[tool(
        name = "dragonball.wiki_events",
        description = "Use this for any Dragon Ball question about battles, tournaments or story events: unified search over combats, tournaments and timeline events with canon, series and kind facets. API: site /api/wiki/events.",
        annotations(
            title = "Narrative events",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_events(
        &self,
        Parameters(r): Parameters<site_tools::WikiEventsRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::wiki_events(r).await
    }

    #[tool(
        name = "dragonball.wiki_timelines",
        description = "The narrative timelines (manga-canon, anime-toei, movies-dbz, xenoverse) with their event counts. API: site /api/wiki/timelines.",
        annotations(
            title = "Narrative timelines",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_timelines(&self) -> rmcp::model::CallToolResult {
        site_tools::wiki_timelines().await
    }

    #[tool(
        name = "dragonball.wiki_media",
        description = "Media works (manga, databooks, guides, novels, anime comics) and their physical/digital editions (tankobon, kanzenban, full color). API: site /api/wiki/media.",
        annotations(
            title = "Media works and editions",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_media(
        &self,
        Parameters(r): Parameters<site_tools::WikiMediaRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::wiki_media(r).await
    }

    #[tool(
        name = "dragonball.wiki_contributors",
        description = "Use this for any question about who made Dragon Ball: authors, editors, screenwriters, animators, voice actors and composers, with biographies and credits. API: site /api/wiki/contributors.",
        annotations(
            title = "Authors, staff and voice actors",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_contributors(
        &self,
        Parameters(r): Parameters<site_tools::WikiContributorsRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::wiki_contributors(r).await
    }

    #[tool(
        name = "dragonball.wiki_variants",
        description = "The character versions (forms and variants) grouped by saga. API: site /api/wiki/variants.",
        annotations(
            title = "Character versions by saga",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_wiki_variants(&self) -> rmcp::model::CallToolResult {
        site_tools::wiki_variants().await
    }

    #[tool(
        name = "dragonball.manga_catalog",
        description = "Entry point of the manga on the site: series, volumes, chapters and transcribed pages, each with its exact URL. API: site /api/manga.",
        annotations(
            title = "Manga catalogue",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_catalog(&self) -> rmcp::model::CallToolResult {
        site_tools::manga_catalog().await
    }

    #[tool(
        name = "dragonball.manga_volume",
        description = "One manga volume and its chapters, each addressable (use the volume id from manga_catalog). API: site /api/manga/volume/{id}.",
        annotations(
            title = "Manga volume (site)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_volume(
        &self,
        Parameters(r): Parameters<site_tools::IdRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::manga_volume(r).await
    }

    #[tool(
        name = "dragonball.databook_create",
        description = "Elevated only. Creates a databook record (guide, artbook or interview). The title is required. Needs a site API token in the server environment. API: site POST /api/databooks.",
        annotations(
            title = "Create a databook record",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_create(
        &self,
        Parameters(r): Parameters<site_tools::DatabookFields>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_create(r).await
    }

    #[tool(
        name = "dragonball.databook_update",
        description = "Elevated only. Updates the metadata of a databook record (title, author, cover, description, visibility, ...). Passing pages REPLACES the whole plate array: to touch single plates use databook_page_edit or dbfr_deposit. API: site PATCH /api/databooks/{id}.",
        annotations(
            title = "Update a databook record",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_update(
        &self,
        Parameters(r): Parameters<site_tools::DatabookUpdateRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_update(r).await
    }

    #[tool(
        name = "dragonball.databook_delete",
        description = "Elevated only. Deletes a databook record. Prefer databook_update with visible=false to hide it reversibly. API: site DELETE /api/databooks/{id}.",
        annotations(
            title = "Delete a databook record",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_delete(
        &self,
        Parameters(r): Parameters<site_tools::IdRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_delete(r).await
    }

    #[tool(
        name = "dragonball.databook_page_edit",
        description = "Elevated only. Targeted and atomic edit of ONE plate: set its transcription, erase it (clear_text) or mark it reviewed (verified). Other plates are never rewritten. Refused while databook writes are frozen. API: site PATCH /api/databooks/{id}/pages.",
        annotations(
            title = "Edit one databook plate",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_page_edit(
        &self,
        Parameters(r): Parameters<site_tools::DatabookPageEditRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_page_edit(r).await
    }

    #[tool(
        name = "dragonball.databook_anomalies",
        description = "Elevated only. Probable misreadings of a whole databook, plate by plate, with the expected form. API: site /api/databooks/{id}/anomalies.",
        annotations(
            title = "Probable OCR errors of a databook",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_anomalies(
        &self,
        Parameters(r): Parameters<site_tools::IdRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_anomalies(r).await
    }

    #[tool(
        name = "dragonball.databook_ocr_review",
        description = "Elevated only. A second OCR reading of one plate by an engine of another family (a second opinion, never a replacement of the transcription). API: site /api/databooks/{id}/ocr-review.",
        annotations(
            title = "Second OCR reading of a plate",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_ocr_review(
        &self,
        Parameters(r): Parameters<site_tools::OcrReviewRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_ocr_review(r).await
    }

    #[tool(
        name = "dragonball.databook_relecture_ocr",
        description = "Elevated only. Deprecated alias of dragonball.databook_ocr_review, kept for agents already configured with the old name.",
        annotations(
            title = "Second OCR reading of a plate (deprecated name)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databook_relecture_ocr(
        &self,
        Parameters(r): Parameters<site_tools::OcrReviewRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::databook_ocr_review(r).await
    }

    #[tool(
        name = "dragonball.site_config_get",
        description = "Elevated only. Reads one site configuration document: timeline, home, canon, banner, theme or wiki-launch (chronologie is still accepted for timeline). API: site /api/{name}-config (/api/wiki-launch).",
        annotations(
            title = "Read a site configuration",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_site_config_get(
        &self,
        Parameters(r): Parameters<site_tools::ConfigGetRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::site_config_get(r).await
    }

    #[tool(
        name = "dragonball.site_config_put",
        description = "Elevated only. Saves a patch of one site configuration document (timeline, home, canon, banner, theme or wiki-launch; chronologie is still accepted for timeline) and purges the affected pages. Read it first with site_config_get. API: site PUT /api/{name}-config (/api/wiki-launch).",
        annotations(
            title = "Write a site configuration",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_site_config_put(
        &self,
        Parameters(r): Parameters<site_tools::ConfigPutRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::site_config_put(r).await
    }

    #[tool(
        name = "dragonball.reports_list",
        description = "Elevated only. Lists the reports sent by site visitors with per-status counters. API: site /api/admin/reports.",
        annotations(
            title = "List user reports",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_reports_list(
        &self,
        Parameters(r): Parameters<site_tools::ReportsListRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::reports_list(r).await
    }

    #[tool(
        name = "dragonball.reports_update",
        description = "Elevated only. Changes a report's status or internal note, or hides/restores it (logical, revisioned). API: site PATCH /api/admin/reports.",
        annotations(
            title = "Update a user report",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_reports_update(
        &self,
        Parameters(r): Parameters<site_tools::ReportsUpdateRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::reports_update(r).await
    }

    #[tool(
        name = "dragonball.agent_whoami",
        description = "Elevated only. First call to make with the agent key: who am I, which scopes do I hold, how many writes remain this hour. Needs $SHENRON_AGENT_API_KEY. API: site /api/agent/v1/whoami.",
        annotations(
            title = "Agent identity and scopes",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_whoami(&self) -> rmcp::model::CallToolResult {
        site_tools::agent_whoami().await
    }

    #[tool(
        name = "dragonball.agent_feed",
        description = "Elevated only. The site's activity feed (articles, wiki, community, discussions) with the same visibility rules as the public page. Needs $SHENRON_AGENT_API_KEY. API: site /api/agent/v1/feed.",
        annotations(
            title = "Site activity feed",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_feed(
        &self,
        Parameters(r): Parameters<site_tools::AgentFeedRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_feed(r).await
    }

    #[tool(
        name = "dragonball.agent_articles",
        description = "Elevated only. Lists articles (published by default; draft/all on request). Needs $SHENRON_AGENT_API_KEY. API: site /api/agent/v1/articles.",
        annotations(
            title = "List articles",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_articles(
        &self,
        Parameters(r): Parameters<site_tools::AgentArticlesRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_articles(r).await
    }

    #[tool(
        name = "dragonball.agent_article_create",
        description = "Elevated only. Writes an article in Markdown (converted and re-rendered server-side, same path as the admin editor). Without the publish:articles scope everything lands as a draft. Needs $SHENRON_AGENT_API_KEY with write:articles. API: site POST /api/agent/v1/articles.",
        annotations(
            title = "Write an article",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_article_create(
        &self,
        Parameters(r): Parameters<site_tools::AgentArticleCreateRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_article_create(r).await
    }

    #[tool(
        name = "dragonball.agent_comments",
        description = "Elevated only. Reads the comment thread of a target (`post:<id>`) as a visitor sees it. Needs $SHENRON_AGENT_API_KEY. API: site /api/agent/v1/comments.",
        annotations(
            title = "Read a discussion",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_comments(
        &self,
        Parameters(r): Parameters<site_tools::AgentCommentsRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_comments(r).await
    }

    #[tool(
        name = "dragonball.agent_comment_post",
        description = "Elevated only. Posts a comment signed with the agent's name (visibly marked as an agent). Needs $SHENRON_AGENT_API_KEY with the comment scope. API: site POST /api/agent/v1/comments.",
        annotations(
            title = "Post a comment",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_comment_post(
        &self,
        Parameters(r): Parameters<site_tools::AgentCommentPostRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_comment_post(r).await
    }

    #[tool(
        name = "dragonball.agent_comment_moderate",
        description = "Elevated only. Hides, restores, pins or unpins a comment. Needs $SHENRON_AGENT_API_KEY with the moderate scope. API: site PATCH /api/agent/v1/comments.",
        annotations(
            title = "Moderate a comment",
            read_only_hint = false,
            destructive_hint = true,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_comment_moderate(
        &self,
        Parameters(r): Parameters<site_tools::AgentCommentModerateRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_comment_moderate(r).await
    }

    #[tool(
        name = "dragonball.agent_wiki_schema",
        description = "Elevated only. The map of what wiki proposals accept (tables, columns, dynamic targets, rules). Read it before agent_wiki_contribute. Needs $SHENRON_AGENT_API_KEY. API: site /api/agent/v1/wiki/contribution-schema.",
        annotations(
            title = "Wiki contribution schema",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_wiki_schema(&self) -> rmcp::model::CallToolResult {
        site_tools::agent_wiki_schema().await
    }

    #[tool(
        name = "dragonball.agent_wiki_entities",
        description = "Elevated only. Resolves the primary key (rowId) and label of public wiki rows of one contribution table, so a proposal targets the right row. Needs $SHENRON_AGENT_API_KEY. API: site /api/agent/v1/wiki/entities.",
        annotations(
            title = "Resolve a wiki row",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_wiki_entities(
        &self,
        Parameters(r): Parameters<site_tools::AgentWikiEntitiesRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_wiki_entities(r).await
    }

    #[tool(
        name = "dragonball.agent_wiki_contributions",
        description = "Elevated only. Lists wiki proposals by status (pending by default). Needs $SHENRON_AGENT_API_KEY with the moderate scope. API: site /api/agent/v1/wiki/contributions.",
        annotations(
            title = "Wiki moderation queue",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_wiki_contributions(
        &self,
        Parameters(r): Parameters<site_tools::AgentWikiContributionsRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_wiki_contributions(r).await
    }

    #[tool(
        name = "dragonball.agent_wiki_contribute",
        description = "Elevated only. Proposes a correction of one wiki cell (table, rowId, column, valueAfter, sources). It writes nothing public: it enters the moderation queue with its diff and sources, and a human accepts it. Cite manga/databook/interview sources, never Fandom. Needs $SHENRON_AGENT_API_KEY with the contribute scope. API: site POST /api/agent/v1/wiki/contributions.",
        annotations(
            title = "Propose a wiki correction",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = true
        )
    )]
    async fn dragonball_agent_wiki_contribute(
        &self,
        Parameters(r): Parameters<site_tools::AgentWikiContributeRequest>,
    ) -> rmcp::model::CallToolResult {
        site_tools::agent_wiki_contribute(r).await
    }
}

#[cfg(test)]
mod tests {
    use super::ShenronMcp;

    /// Tools backed by the Koharu engine.
    const SCANLATION_TOOLS: [&str; 2] =
        ["dragonball.manga_scanlate", "dragonball.databooks_scanlate"];

    /// Site read tools served to anonymous callers.
    const SITE_PUBLIC_TOOLS: [&str; 9] = [
        "dragonball.search",
        "dragonball.sources_search",
        "dragonball.wiki_events",
        "dragonball.wiki_timelines",
        "dragonball.wiki_media",
        "dragonball.wiki_contributors",
        "dragonball.wiki_variants",
        "dragonball.manga_catalog",
        "dragonball.manga_volume",
    ];

    /// Site tools reserved for elevated callers (writes, admin, credential-backed reads).
    const SITE_ELEVATED_TOOLS: [&str; 22] = [
        "dragonball.databook_create",
        "dragonball.databook_update",
        "dragonball.databook_delete",
        "dragonball.databook_page_edit",
        "dragonball.databook_anomalies",
        "dragonball.databook_ocr_review",
        "dragonball.databook_relecture_ocr",
        "dragonball.site_config_get",
        "dragonball.site_config_put",
        "dragonball.reports_list",
        "dragonball.reports_update",
        "dragonball.agent_whoami",
        "dragonball.agent_feed",
        "dragonball.agent_articles",
        "dragonball.agent_article_create",
        "dragonball.agent_comments",
        "dragonball.agent_comment_post",
        "dragonball.agent_comment_moderate",
        "dragonball.agent_wiki_schema",
        "dragonball.agent_wiki_entities",
        "dragonball.agent_wiki_contributions",
        "dragonball.agent_wiki_contribute",
    ];

    /// Former French tool names, kept registered as deprecated aliases of their English
    /// successors so agents already configured with them keep working.
    const DEPRECATED_ALIASES: [(&str, &str); 8] = [
        ("dbfr_textes", "dbfr_texts"),
        ("dragonball.chronologie", "dragonball.timeline"),
        ("dragonball.manga_tomes", "dragonball.manga_volumes"),
        ("dragonball.manga_chapitre", "dragonball.manga_chapter"),
        ("dragonball.manga_planche", "dragonball.manga_chapter_page"),
        ("dragonball.manga_recherche", "dragonball.manga_search_pages"),
        ("dragonball.databooks_planches", "dragonball.databooks_plates"),
        ("dragonball.databook_relecture_ocr", "dragonball.databook_ocr_review"),
    ];

    #[test]
    fn deprecated_french_tool_names_stay_registered_as_aliases() {
        let full = ShenronMcp::all_tools();
        let public = ShenronMcp::public_tools();
        for (old, new) in DEPRECATED_ALIASES {
            let old_tool = full.get(old).unwrap_or_else(|| panic!("alias missing: {old}"));
            let new_tool = full.get(new).unwrap_or_else(|| panic!("successor missing: {new}"));
            let description = old_tool.description.as_deref().unwrap_or_default();
            assert!(description.contains("Deprecated alias of"), "alias not marked: {old}");
            assert!(
                description.contains(new.trim_start_matches("dragonball.")),
                "alias does not name its successor: {old}"
            );
            let read_only =
                |tool: &rmcp::model::Tool| tool.annotations.as_ref().and_then(|a| a.read_only_hint);
            assert_eq!(read_only(old_tool), read_only(new_tool), "annotations differ: {old}");
            assert_eq!(public.get(old).is_some(), public.get(new).is_some(), "tier differs: {old}");
        }
    }

    #[test]
    fn renamed_tool_inputs_still_accept_their_old_names() {
        use crate::dragonball_tools::{
            MangaChapterPageRequest, MangaChapterRequest, MangaPageRequest, MangaVolumesRequest,
        };
        let page: MangaChapterPageRequest =
            serde_json::from_str(r#"{"chapterId":4,"planche":3}"#).expect("old page name");
        assert_eq!(page.page, 3);
        let page: MangaChapterPageRequest =
            serde_json::from_str(r#"{"chapterId":4,"page":5}"#).expect("page");
        assert_eq!(page.page, 5);
        let chapter: MangaChapterRequest =
            serde_json::from_str(r#"{"chapterId":4,"texteSeul":false}"#).expect("old flag name");
        assert_eq!(chapter.text_only, Some(false));
        let chapter: MangaChapterRequest =
            serde_json::from_str(r#"{"chapterId":4,"textOnly":true}"#).expect("flag");
        assert_eq!(chapter.text_only, Some(true));
        let volumes: MangaVolumesRequest =
            serde_json::from_str(r#"{"series":"DB","tome":13}"#).expect("old volume name");
        assert!(volumes.volume.is_some());
        let volumes: MangaVolumesRequest =
            serde_json::from_str(r#"{"series":"DB","volume":"vol13"}"#).expect("volume");
        assert!(volumes.volume.is_some());
        let ocr: MangaPageRequest =
            serde_json::from_str(r#"{"series":"DB","tome":13,"planche":7}"#).expect("old page");
        assert_eq!(ocr.page, 7);
    }

    #[test]
    fn site_tools_are_split_between_the_public_and_the_elevated_tier() {
        let full = ShenronMcp::all_tools();
        let public = ShenronMcp::public_tools();
        for name in SITE_PUBLIC_TOOLS {
            assert!(public.get(name).is_some(), "public site tool missing: {name}");
        }
        for name in SITE_ELEVATED_TOOLS {
            assert!(full.get(name).is_some(), "elevated site tool missing: {name}");
            assert!(public.get(name).is_none(), "elevated tool exposed publicly: {name}");
        }
        for name in ["dbfr_deposit", "dragonball.bot_personas", "dragonball.a2a_send"] {
            assert!(public.get(name).is_none(), "write tool exposed publicly: {name}");
        }
    }

    #[test]
    fn every_tool_description_is_english_and_search_tools_say_when_to_use_them() {
        let full = ShenronMcp::all_tools();
        for tool in full.list_all() {
            let description = tool.description.as_deref().unwrap_or_default();
            assert!(!description.is_empty(), "tool without description: {}", tool.name);
            assert!(
                description.is_ascii()
                    || !description.contains(" le ") && !description.contains(" les "),
                "French description: {}",
                tool.name
            );
        }
        for name in [
            "dragonball.rag_search",
            "dragonball.rag_context",
            "dragonball.rag_ask",
            "dragonball.wiki_search",
            "dragonball.search",
            "dragonball.canon_check",
            "dragonball.canon_references",
            "dragonball.timeline",
            "dragonball.chronologie",
        ] {
            let description =
                full.get(name).and_then(|tool| tool.description.clone()).unwrap_or_default();
            assert!(description.contains("any Dragon Ball"), "no use-for-any hint: {name}");
        }
    }

    #[test]
    fn public_server_serves_only_read_only_tools() {
        let full = ShenronMcp::all_tools();
        let public = ShenronMcp::public_tools();
        let names: Vec<String> =
            public.list_all().into_iter().map(|t| t.name.to_string()).collect();
        for name in
            ["dragonball.rag_search", "dragonball.rag_context", "dragonball.wiki_get", "dbfr_pages"]
        {
            assert!(names.iter().any(|n| n == name), "public tool missing: {name}");
        }
        for name in [
            "dbfr_deposit",
            "dragonball.admin_databooks_deposit",
            "dragonball.admin_bot_command_execute",
            "dragonball.admin_service_action",
            "dragonball.admin_bot_commands",
            "dragonball.admin_services",
            "dragonball.a2a_send",
        ] {
            assert!(full.get(name).is_some(), "full tool missing: {name}");
            assert!(public.get(name).is_none(), "private tool exposed publicly: {name}");
        }
        for tool in public.list_all() {
            let destructive =
                tool.annotations.as_ref().and_then(|a| a.destructive_hint).unwrap_or(false);
            assert!(!destructive, "destructive tool in the public server: {}", tool.name);
        }
    }

    /// Scanlation needs the Koharu engine: registered with the feature, absent without it.
    #[test]
    fn scanlation_tools_follow_the_koharu_feature() {
        let full = ShenronMcp::all_tools();
        let public = ShenronMcp::public_tools();
        for name in SCANLATION_TOOLS {
            assert_eq!(full.get(name).is_some(), cfg!(feature = "koharu"), "full: {name}");
            assert!(public.get(name).is_none(), "scanlation exposed publicly: {name}");
        }
    }

    #[test]
    fn advertises_every_dbfr_and_dragonball_tool() {
        let router = ShenronMcp::all_tools();
        for name in ["dbfr_databooks", "dbfr_pages", "dbfr_texts", "dbfr_textes", "dbfr_deposit"] {
            assert!(router.get(name).is_some(), "dbfr tool missing: {name}");
        }
        // The tools ported from the retired Bun apps/shenron-mcp, with the deprecated French
        // names kept as aliases of their English successors.
        {
            let names = [
                "dragonball.rag_search",
                "dragonball.rag_context",
                "dragonball.rag_ask",
                "dragonball.sources",
                "dragonball.data_coverage",
                "dragonball.wiki_search",
                "dragonball.wiki_list",
                "dragonball.wiki_get",
                "dragonball.wiki_categories",
                "dragonball.manga_search",
                "dragonball.manga_volumes",
                "dragonball.manga_tomes",
                "dragonball.manga_page",
                "dragonball.manga_chapter",
                "dragonball.manga_chapitre",
                "dragonball.manga_chapter_page",
                "dragonball.manga_planche",
                "dragonball.manga_search_pages",
                "dragonball.manga_recherche",
                "dragonball.timeline",
                "dragonball.chronologie",
                "dragonball.bot_stats",
                "dragonball.bot_personas",
                "dragonball.bot_leaderboard",
                "dragonball.bot_commands",
                "dragonball.news",
                "dragonball.databooks_search",
                "dragonball.databooks_plates",
                "dragonball.databooks_planches",
                "dragonball.databooks_get",
                "dragonball.canon_check",
                "dragonball.canon_references",
                "dragonball.lexicon_search",
                "dragonball.a2a_send",
                "dragonball.a2a_task_status",
                "dragonball.a2a_task_list",
                "dragonball.a2a_agent_card",
                "dragonball.admin_databooks_deposit",
                "dragonball.admin_bot_commands",
                "dragonball.admin_bot_command_execute",
                "dragonball.admin_services",
                "dragonball.admin_service_action",
            ];
            for name in names {
                assert!(router.get(name).is_some(), "dragonball tool missing: {name}");
            }
            let count =
                router.list_all().iter().filter(|t| t.name.starts_with("dragonball.")).count();
            assert_eq!(
                count,
                names.len()
                    + SITE_PUBLIC_TOOLS.len()
                    + SITE_ELEVATED_TOOLS.len()
                    + if cfg!(feature = "koharu") { SCANLATION_TOOLS.len() } else { 0 },
                "unexpected dragonball.* tool count"
            );

            for (name, read_only, destructive) in [
                ("dragonball.admin_databooks_deposit", false, true),
                ("dragonball.admin_bot_commands", true, false),
                ("dragonball.admin_bot_command_execute", false, true),
                ("dragonball.admin_services", true, false),
                ("dragonball.admin_service_action", false, true),
                ("dragonball.a2a_send", false, false),
                ("dragonball.a2a_task_status", true, false),
            ] {
                let annotations =
                    router.get(name).and_then(|tool| tool.annotations.as_ref()).unwrap_or_else(
                        || panic!("Shenron MCP tool has no behavior annotations: {name}"),
                    );
                assert_eq!(annotations.read_only_hint, Some(read_only), "{name}");
                assert_eq!(annotations.destructive_hint, Some(destructive), "{name}");
            }
        }
    }
}
