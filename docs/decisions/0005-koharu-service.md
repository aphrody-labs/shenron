# 0005. Koharu as its own pure-Rust service

Status: accepted (2026-11-16). Owner: Next.js stays for wiki, site, community and news; Koharu
(manga, databooks, wiki images) moves to Rust on its own subdomain.

## Decision

- `crates/koharu-web` (axum 0.8, tokio) wraps `koharu-library` (`Library::process`, `Operation::Full`):
  upload a page, OCR, translation, inpainting, typesetting, PNG plus typed text records.
- Models: detection `koharu-layout-rfdetr-seg-2xl`, OCR `manga-ocr` (Japanese pages, CPU friendly;
  `paddleocr-vl` stays selectable), inpainting `LaMa`, translation through an OpenAI-compatible
  endpoint (the llama.cpp server already on the host), never a bundled 12B model on CPU.
- One page at a time (semaphore), job table of the last 32, SSE for stage events, no database.
- Rendering uses wgpu on lavapipe (Mesa) in the image; no GPU on the production host.

## Crates considered

axum + tokio (already the workspace HTTP stack, ADR 0004), `koharu-*` engine (kept: the code Shenron
ships), `candle`/`ort` (already behind `koharu-ml`), `tauri` only for the desktop. Duplicated `skrifa` and
`read-fonts` (vello 0.11 vs koharu-renderer) are tracked with the font stack upgrade, not here.

## Consumers

The API (`/api/v1/pages`, `/api/v1/jobs/{id}`) is stable and documented in `docs/api/koharu-web.openapi.json`;
rosegriffon consumes it over HTTP for wiki, zukan and databooks.
