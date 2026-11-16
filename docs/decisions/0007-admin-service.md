# ADR 0007: admin. in Rust, desktop first, web second

Status: accepted, 2026-11-16.

## Decision

- UI: Dioxus 0.7.10 (newest stable on crates.io; 0.8 is alpha). One codebase, `crates/shenron-admin-ui`: `--features desktop` (native window, system webview) and `--features web` (wasm, served by the service). GPUI and egui were set aside: neither ships a web target from the same code today.
- Service: `crates/shenron-admin` (axum 0.8). It serves the web bundle and `/api/{health,me,panels,panels/{id}}`.
- Auth: the shared Better Auth model. A session or bearer token is checked against the issuer (`SHENRON_AUTH_URL`, `GET /api/auth/get-session`, role in `SHENRON_ADMIN_ROLES`), or the operator token `SHENRON_ADMIN_TOKEN` is compared in constant time. The caller's credentials travel to the upstream API, which keeps its own authorization.
- Extension point: panels. Built-in panels cover the Next.js admin (status, queues, pipeline, IA cockpit, A2A, community, content). A sibling product adds panels with JSON manifests in `SHENRON_ADMIN_PANELS_DIR` (`[{ "id", "title", "group", "upstream": {"kind": "url", "base": "<origin>"}, "path": "/api/..." }]`); origins must be listed in `SHENRON_ADMIN_UPSTREAMS`, paths stay under `/api/`, built-in ids cannot be shadowed.
- Deploy: own compose project on prd (`deploy/prod/admin.compose.yaml`), loopback `127.0.0.1:5020`, nginx vhost `deploy/nginx/admin.conf`; the Next.js routes are untouched.

## Not yet

- Panels read JSON from the site and bot APIs; write actions (moderation, uploads, reruns) stay in the Next.js admin until each is ported.
- Windows desktop binary (cargo-xwin on fr1) is not yet produced.
