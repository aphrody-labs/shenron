# 0006: tv., the Rust video service

## Context

Owner architecture (2026-11-16): Next.js keeps only the wiki, the main site, community and news; video, manga and admin move to pure Rust, each on its own subdomain. tv. is shared with the sibling product (rosegriffon), so it exposes a stable HTTP API and the crate stays reusable.

## Decision

- `crates/shenron-tv`: one axum binary, standalone (own `Cargo.lock`, excluded from the workspace), SQLite library, API v1: `GET /api/v1/videos`, `GET /api/v1/videos/{id}`, `POST /api/v1/videos` (Bearer token, ingest by URL), `GET /hls/{id}/{master.m3u8|vN.m3u8|segment|poster.jpg}`, `GET /healthz`, player page at `/`.
- Ingest: `yt-dlp` (checksum-pinned release) downloads and returns its metadata JSON (kept in the library DB); `ffprobe` reads height, duration and audio; `ffmpeg` writes an adaptive H.264/AAC HLS ladder (1080/720/480/360 at or below the source) and a poster frame. One job at a time by default.
- FFmpeg and yt-dlp run as child processes with argument vectors (no shell). FFI bindings (ffmpeg-next, libvlc) are not used on the server: they add a native link step without changing the output; libvlc stays for the desktop and admin player, where playback happens in process.
- Player: semantic HTML, keyboard reachable, `hls.js` served locally (no CDN); native HLS on Safari.
- Filmcraft keeps one source, `github.com/aphrody-labs/filmcraft`; the vendored `packages/filmcraft` copy is to be replaced by a pinned dependency.
- Deploy: own Compose project (`deploy/prod/tv.compose.yaml`), own nginx server block (`deploy/nginx/tv.conf`), CPU and memory limited; Next.js routes and rosegriffon services are not touched.

## Not done yet

Remotion-style rendering and hyperframe in Rust, libvlc playback, subtitles and multi-audio tracks, and the migration of `packages/video` and Crunchyroll features (account-bound sources) into the API.
