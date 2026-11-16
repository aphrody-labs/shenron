// SPDX-License-Identifier: MIT OR Apache-2.0
//! `koharu-web`: Koharu's page pipeline (detection, OCR, translation, inpainting, typesetting)
//! as a headless HTTP service with a small upload page.
//!
//! - `GET  /`                          the upload page
//! - `GET  /healthz`                   liveness (the models load lazily on the first page)
//! - `POST /api/v1/pages`              raw PNG, JPEG or WebP body; answers `202 {"id": ...}`
//! - `GET  /api/v1/jobs/{id}`          status, stage timings and the typed page result
//! - `GET  /api/v1/jobs/{id}/events`   server-sent events (one JSON object per stage change)
//! - `GET  /api/v1/jobs/{id}/result.png` the typeset page
//!
//! One page is processed at a time (the models are CPU/GPU bound); the others queue.

use std::{
    collections::{HashMap, VecDeque},
    net::SocketAddr,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use anyhow::{Context as _, Result};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{
        Html, IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use clap::Parser;
use futures_util::stream::{self, Stream};
use koharu_library::{
    Document, Library, Operation, PipelineConfig, Progress, ProvidersConfig, Request, Scope,
};
use koharu_pipeline::{
    DetectionModel, InpaintingModel, KoharuLayoutRFDetrSeg2XLConfig, OcrModel, TranslationConfig,
};
use koharu_translator::{GenerationConfig, Language, ModelSelection, Provider};
use serde::Serialize;
use tokio::sync::{OnceCell, Semaphore, watch};
use uuid::Uuid;

const INDEX: &str = include_str!("index.html");
const OPENAPI: &str = include_str!("../../../docs/api/koharu-web.openapi.json");
/// Finished jobs kept in memory (result PNG included).
const KEEP_JOBS: usize = 32;

#[derive(Parser)]
#[command(version, about = "Koharu manga page service")]
struct Arguments {
    #[arg(long, env = "KOHARU_WEB_BIND", default_value = "127.0.0.1:8890")]
    bind: SocketAddr,
    /// Largest accepted page upload in bytes.
    #[arg(long, env = "KOHARU_WEB_MAX_BYTES", default_value_t = 32 * 1024 * 1024)]
    max_bytes: usize,
    /// Run the models on the CPU.
    #[arg(long, env = "KOHARU_WEB_CPU")]
    cpu: bool,
    /// Target language of the translation (BCP 47 tag or English name).
    #[arg(long, env = "KOHARU_WEB_TARGET_LANGUAGE", default_value = "fr-FR")]
    target_language: Language,
    /// OpenAI-compatible endpoint used for translation (for example `http://127.0.0.1:8799/v1`).
    #[arg(long, env = "KOHARU_WEB_TRANSLATE_URL")]
    translate_url: Option<String>,
    /// Model name sent to the translation endpoint.
    #[arg(long, env = "KOHARU_WEB_TRANSLATE_MODEL", default_value = "shenron-chat-v2")]
    translate_model: String,
    #[arg(long, env = "KOHARU_WEB_INSTRUCTIONS")]
    instructions: Option<String>,
    /// Bearer tokens accepted on /api (comma separated). Empty: the API is open (loopback or proxy-protected).
    #[arg(long, env = "KOHARU_WEB_TOKENS", value_delimiter = ',', hide_env_values = true)]
    tokens: Vec<String>,
    /// Home of the model store (defaults to SHENRON_HOME).
    #[arg(long, env = "SHENRON_HOME")]
    home: Option<PathBuf>,
}

#[derive(Clone, Serialize)]
struct StageEvent {
    stage: String,
    model: String,
    state: &'static str,
    seconds: Option<f64>,
}

#[derive(Clone, Serialize)]
struct PageText {
    reading_order: Option<usize>,
    source: Option<String>,
    source_language: Option<String>,
    translation: Option<String>,
    target_language: Option<String>,
    bounds: [f64; 4],
}

#[derive(Clone, Serialize)]
struct PageOutput {
    width: f64,
    height: f64,
    regions: usize,
    texts: Vec<PageText>,
}

#[derive(Clone, Serialize)]
struct JobView {
    id: Uuid,
    status: &'static str,
    message: String,
    stages: Vec<StageEvent>,
    seconds: Option<f64>,
    result: Option<PageOutput>,
    error: Option<String>,
}

struct Job {
    view: JobView,
    png: Option<Arc<Vec<u8>>>,
    tx: watch::Sender<JobView>,
}

struct App {
    arguments: Arguments,
    library: OnceCell<Arc<Library>>,
    gate: Semaphore,
    jobs: Mutex<(HashMap<Uuid, Job>, VecDeque<Uuid>)>,
}

type Shared = Arc<App>;

fn pipeline_config(arguments: &Arguments) -> PipelineConfig {
    PipelineConfig {
        detection: DetectionModel::KoharuLayoutRFDetrSeg2XL(
            KoharuLayoutRFDetrSeg2XLConfig::default(),
        ),
        ocr: OcrModel::MangaOcr,
        translation: TranslationConfig {
            model: ModelSelection {
                provider: Provider::OpenAiCompatible,
                model: Some(arguments.translate_model.clone()),
                quantization: None,
                vision: false,
                reasoning: false,
            },
            generation: GenerationConfig::default(),
            target_language: arguments.target_language,
            instructions: arguments.instructions.clone(),
        },
        inpainting: InpaintingModel::LaMa {},
        processor: Default::default(),
    }
}

fn providers_config(arguments: &Arguments) -> Result<ProvidersConfig> {
    let mut providers = ProvidersConfig::default();
    if let Some(url) = &arguments.translate_url {
        providers.openai_compatible.base_url =
            Some(url.parse().with_context(|| format!("invalid translate url {url}"))?);
    }
    Ok(providers)
}

impl App {
    async fn library(&self) -> Result<Arc<Library>> {
        self.library
            .get_or_try_init(|| async {
                if let Some(home) = &self.arguments.home {
                    // SAFETY: set once, before any model runtime reads it.
                    unsafe { std::env::set_var("SHENRON_HOME", home) };
                }
                let library = Library::initialize(
                    pipeline_config(&self.arguments),
                    providers_config(&self.arguments)?,
                    self.arguments.cpu,
                )
                .await?;
                Ok(Arc::new(library))
            })
            .await
            .cloned()
    }

    fn update(&self, id: Uuid, change: impl FnOnce(&mut Job)) {
        let mut guard = self.jobs.lock().expect("jobs lock");
        if let Some(job) = guard.0.get_mut(&id) {
            change(job);
            job.tx.send_replace(job.view.clone());
        }
    }
}

async fn run_job(app: Shared, id: Uuid, bytes: Bytes) {
    let _permit = app.gate.acquire().await.expect("semaphore open");
    let started = Instant::now();
    app.update(id, |job| {
        job.view.status = "running";
        job.view.message = "loading models".into();
    });
    let outcome = process(&app, id, bytes).await;
    app.update(id, |job| {
        job.view.seconds = Some(started.elapsed().as_secs_f64());
        match outcome {
            Ok((png, output)) => {
                job.view.status = "done";
                job.view.message = format!("done in {:.1}s", started.elapsed().as_secs_f64());
                job.view.result = Some(output);
                job.png = Some(Arc::new(png));
            },
            Err(error) => {
                job.view.status = "failed";
                job.view.message = format!("failed: {error:#}");
                job.view.error = Some(format!("{error:#}"));
            },
        }
    });
}

async fn process(app: &Shared, id: Uuid, bytes: Bytes) -> Result<(Vec<u8>, PageOutput)> {
    let library = app.library().await?;
    let mut document = Document::memory().await?;
    let page = document.import_raster("page", bytes.to_vec()).await?;
    let sink = {
        let app = Arc::clone(app);
        Arc::new(move |event: Progress| {
            let (stage, model, state, seconds) = match event {
                Progress::Loading { stage, model, .. } => (stage, model, "loading", None),
                Progress::Running { stage, model, .. } => (stage, model, "running", None),
                Progress::Finished { stage, model, elapsed, .. } => {
                    (stage, model, "finished", Some(elapsed.as_secs_f64()))
                },
                Progress::Skipped { stage, .. } => (stage, String::new(), "skipped", None),
                Progress::Started { .. } => return,
            };
            let stage = stage.to_string();
            app.update(id, |job| {
                job.view.message = format!("{stage}: {state}");
                job.view.stages.push(StageEvent { stage, model, state, seconds });
            });
        })
    };
    library
        .process(
            &mut document,
            Request {
                operation: Operation::Full,
                scope: Scope::Pages(vec![page]),
                progress: Some(sink),
                ..Request::default()
            },
        )
        .await?;
    let png = library.export_png(&document, page).await?;
    let result = document.page_result(page).await?;
    let texts = result
        .regions
        .iter()
        .flat_map(|region| {
            region.texts.iter().map(|text| PageText {
                reading_order: text.reading_order,
                source: text.source.clone(),
                source_language: text.source_language.clone(),
                translation: text.translation.clone(),
                target_language: text.target_language.clone(),
                bounds: region.bounds,
            })
        })
        .collect();
    let output = PageOutput {
        width: result.width,
        height: result.height,
        regions: result.regions.len(),
        texts,
    };
    Ok((png, output))
}

async fn submit(State(app): State<Shared>, body: Bytes) -> Response {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, "empty body: send a PNG, JPEG or WebP page")
            .into_response();
    }
    let id = Uuid::now_v7();
    let view = JobView {
        id,
        status: "queued",
        message: "queued".into(),
        stages: Vec::new(),
        seconds: None,
        result: None,
        error: None,
    };
    let (tx, _rx) = watch::channel(view.clone());
    {
        let mut guard = app.jobs.lock().expect("jobs lock");
        guard.0.insert(id, Job { view, png: None, tx });
        guard.1.push_back(id);
        while guard.1.len() > KEEP_JOBS {
            if let Some(old) = guard.1.pop_front() {
                guard.0.remove(&old);
            }
        }
    }
    tokio::spawn(run_job(Arc::clone(&app), id, body));
    (StatusCode::ACCEPTED, Json(serde_json::json!({ "id": id }))).into_response()
}

fn lookup<T>(app: &App, id: Uuid, read: impl FnOnce(&Job) -> T) -> Option<T> {
    app.jobs.lock().expect("jobs lock").0.get(&id).map(read)
}

async fn job(State(app): State<Shared>, Path(id): Path<Uuid>) -> Response {
    match lookup(&app, id, |job| job.view.clone()) {
        Some(view) => Json(view).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn result_png(State(app): State<Shared>, Path(id): Path<Uuid>) -> Response {
    match lookup(&app, id, |job| job.png.clone()) {
        Some(Some(png)) => {
            ([(header::CONTENT_TYPE, "image/png")], png.as_ref().clone()).into_response()
        },
        Some(None) => StatusCode::CONFLICT.into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn events(
    State(app): State<Shared>,
    Path(id): Path<Uuid>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, StatusCode> {
    let rx = {
        let guard = app.jobs.lock().expect("jobs lock");
        guard.0.get(&id).map(|job| job.tx.subscribe()).ok_or(StatusCode::NOT_FOUND)?
    };
    let stream = stream::unfold((rx, true, false), |(mut rx, first, finished)| async move {
        if finished {
            return None;
        }
        if !first && rx.changed().await.is_err() {
            return None;
        }
        let view = rx.borrow_and_update().clone();
        let end = matches!(view.status, "done" | "failed");
        let slim = serde_json::json!({ "status": view.status, "message": view.message });
        let event = Event::default().data(slim.to_string());
        Some((Ok(event), (rx, false, end)))
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

async fn authorize(
    State(app): State<Shared>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    if app.arguments.tokens.is_empty() {
        return next.run(request).await;
    }
    let presented = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    match presented {
        Some(token) if app.arguments.tokens.iter().any(|allowed| allowed == token) => {
            next.run(request).await
        },
        _ => (StatusCode::UNAUTHORIZED, "missing or invalid bearer token").into_response(),
    }
}

async fn openapi() -> impl IntoResponse {
    ([(header::CONTENT_TYPE, "application/json")], OPENAPI)
}

async fn healthz() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() -> Result<()> {
    let arguments = Arguments::parse();
    let bind = arguments.bind;
    let limit = arguments.max_bytes;
    let app = Arc::new(App {
        arguments,
        library: OnceCell::new(),
        gate: Semaphore::new(1),
        jobs: Mutex::new((HashMap::new(), VecDeque::new())),
    });
    let router = Router::new()
        .route("/api/v1/pages", post(submit))
        .route("/api/v1/jobs/{id}", get(job))
        .route("/api/v1/jobs/{id}/events", get(events))
        .route("/api/v1/jobs/{id}/result.png", get(result_png))
        .layer(middleware::from_fn_with_state(Arc::clone(&app), authorize))
        .route("/", get(|| async { Html(INDEX) }))
        .route("/healthz", get(healthz))
        .route("/openapi.json", get(openapi))
        .layer(DefaultBodyLimit::max(limit))
        .with_state(app);
    let listener =
        tokio::net::TcpListener::bind(bind).await.with_context(|| format!("bind {bind}"))?;
    eprintln!("koharu-web listening on http://{bind}");
    axum::serve(listener, router).await?;
    Ok(())
}
