# Shenron: Sovereign Dragon Ball Universe Studio & Platform

<p align="center">
  <b>Production Site (dragonballfr.com), Discord Bot, OCR Databook Translation Pipeline, and Manga Studio</b><br/>
  <i>Engineered for Maximum Performance with Rust 2024, Upstream Bun v1.4.4+, Next.js 16.5+ / Leptos 0.8, Axum, and GPUI / Dioxus 0.8</i>
</p>

<p align="center">
  <a href="#state"><img src="https://img.shields.io/badge/Production-dragonballfr.com-4285F4?style=flat-square" alt="Production"/></a>
  <a href="#stack"><img src="https://img.shields.io/badge/Stack-Rust%202024%20%2B%20Bun%201.4.4-34A853?style=flat-square" alt="Stack"/></a>
  <a href="#quality-gates"><img src="https://img.shields.io/badge/Quality%20Gates-Checked%20%26%20Tested-FBBC05?style=flat-square" alt="Quality Gates"/></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-Apache%202.0-EA4335?style=flat-square" alt="License"/></a>
</p>

---

## 1. Vision & Sovereign Architecture

Shenron is the core platform powering **dragonballfr.com**, integrated into the YOLO Sovereign Fleet (`C:\src\products\shenron`):

- **Web Platform & API (`apps/site`, `apps/server`)**: High-throughput SSR web portal (Next.js 16.5+ standalone under Bun v1.4.4+ transitioning to Leptos 0.8 + Axum), PostgreSQL (`pgvector`), and Redis cache.
- **Shenron Studio (`crates/koharu-*`, `crates/shenron-desktop`)**: Native visual manga translation workbench, typesetting engine, and GPUI / Dioxus 0.8 desktop UI.
- **Editorial OCR & Databook Pipeline (`packages/pipeline`)**: Neural OCR extraction and terminology harmonization for Akira Toriyama databooks.
- **Discord Bot & Server MCP (`apps/bot`, `crates/shenron-mcp`)**: Rich bot features and Model Context Protocol integration for community interaction and autonomous NHITL agents.
- **Creative & Game Streaming (`packages/bun-blender`, `packages/bun-video-project`, `packages/bun-gamestream`, `crates/bun-engine-core`)**: 3D Blender 5.2.3 LTS asset pipelines, video rendering, and low-latency streaming.

---

## 2. Sovereign Fleet Triad (`vps` / `cdn` / `prod`)

| SSH Host       | Mesh IP / Public IP             | OS & Kernel               | Canonical Role                                                                                                                                                                                                                                                             |
| -------------- | ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ssh vps`**  | `10.200.77.1` / `51.77.147.152` | Ubuntu 26.10 (Linux 7.3)  | **Build Hub & Mesh Coordinator**: 12-core Rust/Bun build farm, sccache, OCR & RAG heavy compute, WireGuard hub (`10.200.77.0/24`).                                                                                                                                         |
| **`ssh cdn`**  | `10.200.77.3` / `51.255.162.6`  | Ubuntu 26.10 (Linux 7.3)  | **Cloudflare Edge Simulator**: Pingora L4/L7 Gateway, Garage S3 (`R2` role), RQLite Raft (`D1` role), `workerd` runtime, Mail & Better-Auth SSO.                                                                                                                           |
| **`ssh prod`** | `10.200.77.5` / `72.60.186.43`  | Arch Linux (Linux 7.2.11) | **Bare-Metal Production**: Hosts `dragonballfr.com` (`shenron-gateway`, `shenron-site`, `shenron-bot`, `shenron-chat`, `shenron-compute`, `shenron-embed`, `shenron-postgres`, `shenron-redis`, `shenron-cloudflared`) with 203 GiB free NVMe and autonomous NHITL fixers. |

---

## 3. Monorepo Map

```text
products/shenron/
├── apps/         # site (Next.js 16.5), bot (discordx), server (Bun single binary), activity
├── packages/     # Bun workspace packages (@aphrody/shenron-*, bun-blender, bun-gamestream, bun-video-project)
├── crates/       # Rust crates workspace (shenron-*, koharu-*, dragon-pixel, bun-engine-core)
├── deploy/       # Docker BuildKit, compose, Cloudflare Worker CDN, SQL migrations
├── scripts/      # Automated build, test, and zero-downtime Zstd deployment lanes
└── docs/         # Architecture decisions, operations, and runbooks
```

---

## 4. Toolchain & Quality Gates

```bash
just check          # Bun check (TypeScript 7) + Cargo workspace check
just lint           # Bun lint (oxlint) + Cargo clippy
just test           # Run unit and integration tests across Bun packages, scripts, and Rust crates
just deploy-check   # Validate deployment environment pins, lanes, and scripts
bun run ship        # Zero-downtime build on vps and Zstd stream deployment to prod
```

---

## 5. Autonomous Directives (NHITL)

This repository operates under the **No Human In The Loop (NHITL)** doctrine. Refer to [`AGENTS.md`](file:///C:/src/products/shenron/AGENTS.md) and [`GEMINI.md`](file:///C:/src/products/shenron/GEMINI.md) for full operational guidelines.
