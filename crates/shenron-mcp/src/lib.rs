// SPDX-License-Identifier: Apache-2.0
//! Shenron MCP server: the `dragonball.*` tools (RAG, wiki, manga, databooks,
//! canon, bot, A2A and editorial admin) and the `dbfr_*` databooks tools.
//!
//! Transport only: the local corpus, persona and `APHRODY_AI_*` chat
//! resolution live in [`shenron_rag::dragonball`]; wiki, bot, databook, manga,
//! canon and A2A data stay behind the public Shenron bot and site APIs. Admin
//! tools fail closed without their tokens.

use rmcp::{ServerHandler, handler::server::wrapper::Parameters, tool, tool_handler, tool_router};

pub mod dbfr_tools;
pub mod dragonball_tools;
pub mod http;

use rmcp::handler::server::router::tool::ToolRouter;

/// The Shenron MCP server (stateless; every tool reads its configuration from the environment).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ShenronMcp {
    public: bool,
}

/// Read-only tools without heavy compute: what an anonymous public endpoint may serve.
fn is_public(tool: &rmcp::model::Tool) -> bool {
    let name = tool.name.as_ref();
    if name.contains("scanlate") {
        return false;
    }
    matches!(name, "dbfr_databooks" | "dbfr_pages" | "dbfr_textes")
        || tool.annotations.as_ref().and_then(|annotations| annotations.read_only_hint)
            == Some(true)
}

impl ShenronMcp {
    /// The full server (stdio, local agents): every tool, admin tools gated by their tokens.
    #[must_use]
    pub const fn full() -> Self {
        Self { public: false }
    }

    /// The public server: read-only tools only (no admin, deposit, A2A write or scanlation).
    #[must_use]
    pub const fn public() -> Self {
        Self { public: true }
    }

    /// Every tool of the full server.
    #[must_use]
    pub fn all_tools() -> ToolRouter<Self> {
        let mut router = Self::dbfr_router();
        router += Self::dragonball_router();
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
        info.capabilities = rmcp::model::ServerCapabilities::builder().enable_tools().build();
        info.server_info = implementation;
        info.instructions = Some(
            "shenron-mcp: Dragon Ball knowledge of dragonballfr.com. dragonball.rag_search and \
             dragonball.rag_context return sourced passages (cite their URL); dragonball.rag_ask \
             writes a grounded answer. local=true (or SHENRON_LOCAL_RAG=1) answers from the local \
             corpus without network. dbfr_* and dragonball.admin_* write to public corpora: they \
             are dry runs or refuse without their tokens (DBFR_TOKEN, SHENRON_API_ADMIN_TOKEN, \
             SHENRON_DATABOOKS_API_TOKEN)."
                .to_owned(),
        );
        info
    }
}

#[tool_router(router = dbfr_router)]
impl ShenronMcp {
    #[tool(description = "List Dragon Ball FR databook records (dragonballfr.com). Reads the \
                          public catalogue; `include_hidden` needs $DBFR_TOKEN and is refused \
                          without one rather than silently serving the public subset.")]
    async fn dbfr_databooks(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabooksListRequest>,
    ) -> String {
        dbfr_tools::list(req).await
    }

    #[tool(description = "Report one databook's plates: how many carry an image, how many are \
                          transcribed, and the numbers of those still missing a transcription. \
                          This is what says where OCR work remains.")]
    async fn dbfr_pages(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabookPagesRequest>,
    ) -> String {
        dbfr_tools::pages(req).await
    }

    #[tool(description = "Read the stored transcription of specific plates of one databook (at \
                          most 40 per call).")]
    async fn dbfr_textes(
        &self,
        Parameters(req): Parameters<dbfr_tools::DatabookTextesRequest>,
    ) -> String {
        dbfr_tools::textes(req).await
    }

    #[tool(description = "Deposit transcriptions into one databook. Writes into a public corpus, \
                          so it is a dry run unless `apply` is true, refuses a blank text (the \
                          API reads it as `nothing to say`), and merges by default so plates \
                          absent from the call are untouched. Needs $DBFR_TOKEN.")]
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
        description = "Recherche hybride (BM25 + embeddings, fusion RRF, reranking) dans la base Dragon Ball de dragonballfr.com (manga, databooks, Kanzenshuu, wiki). Renvoie des passages sourcés (rowid, kind, title, url, snippet, score) et le mode effectif. Filtres lang, entity, sourceId, kind. local=true (ou SHENRON_LOCAL_RAG=1) interroge le corpus local Aphrody. API : bot /api/public/rag/search.",
        annotations(
            title = "Recherche RAG Dragon Ball",
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
        description = "Passages les plus pertinents en texte intégral, numérotés [n] avec leur URL absolue, dans un budget maxChars (défaut 6000). Mêmes filtres que rag_search. API : bot /api/public/rag/context.",
        annotations(
            title = "Contexte sourcé prêt à citer",
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
        description = "Question en langage naturel : le RAG sélectionne les passages (hits, avec url) et le LLM rédige answer dans la voix du bot unique (persona Akira Toriyama par défaut en YOLO). Si le LLM est indisponible l'API répond une erreur. local=true utilise le modèle du contrat APHRODY_AI_* et le corpus local. API : bot /api/public/rag/chat.",
        annotations(
            title = "Réponse rédigée (RAG génératif)",
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
        description = "Liste les sources/corpus indexés par le RAG Dragon Ball (manga, databooks, Kanzenshuu…). API : bot /api/public/sources.",
        annotations(
            title = "Sources indexées du RAG",
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
        description = "Couverture réelle : passages par corpus et par type, modèle d'embeddings, date de l'index, nombre de fiches par rubrique du wiki. Une recherche vide sur un corpus absent ne prouve rien. API : bot /api/public/data/coverage.",
        annotations(
            title = "Couverture des données indexées",
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
        description = "Recherche plein-texte dans le wiki Dragon Ball ; résultats {category, id, slug, title, snippet} à ouvrir avec dragonball.wiki_get. API : bot /api/public/wiki/search.",
        annotations(
            title = "Recherche plein-texte du wiki",
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
        description = "Liste paginée des entités d'une catégorie du wiki avec son total. API : bot /api/public/wiki/{category}.",
        annotations(
            title = "Liste d'entités du wiki",
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
        description = "Détail d'une entité du wiki par identifiant numérique ou slug. API : bot /api/public/wiki/{category}/{idOrSlug}.",
        annotations(
            title = "Détail d'une entité du wiki",
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
        description = "Registre des catégories du wiki : name, label, total. API : bot /api/public/wiki/categories.",
        annotations(
            title = "Catégories du wiki",
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
        description = "Recherche textuelle (OCR) dans les planches du manga Dragon Ball (limit ≤ 50). API : bot /api/public/manga/search.",
        annotations(
            title = "Recherche dans le manga",
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
        name = "dragonball.manga_tomes",
        description = "Liste les tomes du manga, ou le détail d'un tome (avec ses planches) si series et tome sont fournis. API : bot /api/public/manga/tomes.",
        annotations(
            title = "Tomes du manga",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_tomes(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaTomesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_tomes(r).await
    }

    #[tool(
        name = "dragonball.manga_page",
        description = "Métadonnées et URL d'image d'une planche (coordonnées OCR series/tome/planche). API : bot /api/public/manga/page.",
        annotations(
            title = "Planche de manga",
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
        name = "dragonball.manga_chapitre",
        description = "Un chapitre planche par planche : transcription et URL de lecture ; texteSeul (défaut vrai) omet les URL d'images. API : site /api/manga/chapter/{id}.",
        annotations(
            title = "Lire un chapitre du manga",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_chapitre(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaChapitreRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_chapitre(r).await
    }

    #[tool(
        name = "dragonball.manga_planche",
        description = "Une planche d'un chapitre : image, transcription OCR, bulles, voisines et URL de lecture. API : site /api/manga/chapter/{id}/planche/{n}.",
        annotations(
            title = "Planche du manga (site)",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_manga_planche(
        &self,
        Parameters(r): Parameters<dragonball_tools::MangaPlancheRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::manga_planche(r).await
    }

    #[tool(
        name = "dragonball.manga_recherche",
        description = "Cherche un texte dans les transcriptions et rend des planches citables avec URL de lecture (limit ≤ 100). API : site /api/manga/search.",
        annotations(
            title = "Recherche de planches citables",
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
        dragonball_tools::manga_recherche(r).await
    }

    #[tool(
        name = "dragonball.manga_scanlate",
        description = "Analyse une planche manga via le CDN et Koharu : régions détectées, OCR, traduction, calque de nettoyage et export PSD. Requiert la fonctionnalité Koharu et ses modèles.",
        annotations(
            title = "Scanlation planche manga",
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
        name = "dragonball.chronologie",
        description = "La frise officielle dans son ordre éditorial (épisodes, films, tomes) ; ne pas la reconstruire par dates de diffusion. Filtres era et kind. API : site /api/chronologie.",
        annotations(
            title = "Chronologie officielle",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_chronologie(
        &self,
        Parameters(r): Parameters<dragonball_tools::ChronologieRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::chronologie(r).await
    }

    #[tool(
        name = "dragonball.bot_stats",
        description = "Statistiques publiques du bot Discord Dragon Ball et de son serveur. API : bot /api/public/stats.",
        annotations(
            title = "Statistiques du bot",
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
        description = "Persona actif du bot unique (Akira Toriyama par défaut en YOLO). set_persona enregistre un persona utilisateur dans <APHRODY_HOME>/persona.json. API : bot /api/public/personas, repli local.",
        annotations(
            title = "Persona du bot unique",
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
        description = "Classement public des membres du serveur Discord par niveau/XP (limit ≤ 100). API : bot /api/public/leaderboard.",
        annotations(
            title = "Classement des membres",
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
        description = "Commandes Discord publiques du bot Dragon Ball. API : bot /api/public/commands.",
        annotations(
            title = "Commandes du bot",
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
        description = "Dernières actualités Dragon Ball de dragonballfr.com (limit ≤ 50). API : bot /api/public/news.",
        annotations(
            title = "Actualités Dragon Ball",
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
        description = "Recherche parmi les fiches d'ouvrages (titre, auteur, description) avec couverture et nombre de planches ; ne lit pas le texte des planches (voir databooks_planches). API : site /api/databooks.",
        annotations(
            title = "Recherche dans les databooks",
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
        name = "dragonball.databooks_planches",
        description = "Cherche une expression dans la transcription des planches et rend ouvrage, planche et extrait autour du terme. API : site /api/databooks/search.",
        annotations(
            title = "Recherche dans le texte des planches",
            read_only_hint = true,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = true
        )
    )]
    async fn dragonball_databooks_planches(
        &self,
        Parameters(r): Parameters<dragonball_tools::DatabooksPlanchesRequest>,
    ) -> rmcp::model::CallToolResult {
        dragonball_tools::databooks_planches(r).await
    }

    #[tool(
        name = "dragonball.databooks_get",
        description = "Détail d'un guide, artbook ou interview : métadonnées, couverture, planches transcrites (maxPages défaut 50). API : site /api/databooks/{id}.",
        annotations(
            title = "Fiche databook",
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
        description = "Analyse une planche databook via le CDN et Koharu : régions détectées, OCR, traduction, calque de nettoyage et export PSD. Requiert la fonctionnalité Koharu et ses modèles.",
        annotations(
            title = "Scanlation planche databook",
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
        description = "Verdict déterministe de canonicité (doctrine curée, cinq rangs, score, règles, déclarations de Toriyama, planches, fiches). Sans question : la doctrine. API : site /api/canon.",
        annotations(
            title = "Vérifier la canonicité",
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
        name = "dragonball.canon_references",
        description = "Corpus de preuves de canonicité (déclarations de Toriyama, planches de databooks traduites), filtrable par q et provenance. API : site /api/canon/references.",
        annotations(
            title = "Corpus canon",
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
        description = "Protocole A2A (JSON-RPC 2.0) du hub Dragon Ball, Honest Delivery : rag rend des passages réels ; ocr/translation l'état mesuré ; les ordres pour codex, agycli, claude, local_model, subagents restent submitted/INCOMPLET jusqu'au résultat du pair. Avec taskId + verdict, clôt une tâche (FAIT exige un artefact). API : site /api/a2a.",
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
        description = "État, historique et artefacts d'une tâche A2A ; submitted/working n'a pas encore de résultat. API : site /api/a2a.",
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
        description = "Liste les tâches A2A du registre, filtrables par cible. API : site /api/a2a.",
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
        description = "AgentCard A2A du hub Dragon Ball (cibles et compétences).",
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
        description = "Admin : dépose des transcriptions OCR déjà vérifiées sur un databook (fusion ciblée, révisions réversibles côté site). Requiert $SHENRON_DATABOOKS_API_TOKEN.",
        annotations(
            title = "Déposer des transcriptions databooks",
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
        description = "Admin : commandes exécutables via l'API d'administration Shenron. Requiert $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Catalogue des commandes bot",
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
        description = "Admin : exécute une commande Discord sous l'identité administrateur du bot ; consulter d'abord admin_bot_commands. Requiert $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Exécuter une commande Shenron",
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
        description = "Admin : actions de service explicitement autorisées par Shenron. Requiert $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Actions de service autorisées",
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
        description = "Admin : exécute une action listée par admin_services ; aucun service ni shell arbitraire. Requiert $SHENRON_API_ADMIN_TOKEN.",
        annotations(
            title = "Exécuter une action de service",
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

#[cfg(test)]
mod tests {
    use super::ShenronMcp;

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
            "dragonball.a2a_send",
            "dragonball.manga_scanlate",
            "dragonball.databooks_scanlate",
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

    #[test]
    fn advertises_every_dbfr_and_dragonball_tool() {
        let router = ShenronMcp::all_tools();
        for name in ["dbfr_databooks", "dbfr_pages", "dbfr_textes", "dbfr_deposit"] {
            assert!(router.get(name).is_some(), "dbfr tool missing: {name}");
        }
        // The 37 tools ported from the retired Bun apps/shenron-mcp.
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
                "dragonball.manga_tomes",
                "dragonball.manga_page",
                "dragonball.manga_chapitre",
                "dragonball.manga_planche",
                "dragonball.manga_recherche",
                "dragonball.manga_scanlate",
                "dragonball.chronologie",
                "dragonball.bot_stats",
                "dragonball.bot_personas",
                "dragonball.bot_leaderboard",
                "dragonball.bot_commands",
                "dragonball.news",
                "dragonball.databooks_search",
                "dragonball.databooks_planches",
                "dragonball.databooks_get",
                "dragonball.databooks_scanlate",
                "dragonball.canon_check",
                "dragonball.canon_references",
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
            assert_eq!(count, names.len(), "unexpected dragonball.* tool count");

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
