# Shenron: Sovereign Dragon Ball Universe Studio & Platform

<p align="center">
  <b>Production Site (dragonballfr.com), Discord Bot, OCR Databook Translation Pipeline, and Manga Studio</b><br/>
  <i>Engineered for Maximum Performance with Rust 2024, Upstream Bun v1.4.4+, Axum, and Dioxus 0.8</i>
</p>

<p align="center">
  <a href="#state"><img src="https://img.shields.io/badge/Production-dragonballfr.com-4285F4?style=flat-square" alt="Production"/></a>
  <a href="#stack"><img src="https://img.shields.io/badge/Stack-Rust%202024%20%2B%20Bun-34A853?style=flat-square" alt="Stack"/></a>
  <a href="#quality-gates"><img src="https://img.shields.io/badge/Quality%20Gates-Checked%20%26%20Tested-FBBC05?style=flat-square" alt="Quality Gates"/></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-Apache%202.0-EA4335?style=flat-square" alt="License"/></a>
</p>

---

## 1. Vision & Components

Shenron is the core platform powering **dragonballfr.com**:
- **Web Platform & API**: High-throughput SSR web portal, PostgreSQL, and Redis cache.
- **Shenron Studio**: Native visual manga translation workbench, typesetting engine, and Dioxus desktop UI.
- **Editorial OCR & Databook Pipeline**: Neural OCR extraction and terminology harmonization for Akira Toriyama databooks.
- **Discord Bot & Server MCP**: Rich bot features and Model Context Protocol integration for community interaction.

---

## 2. Monorepo Map

```text
shenron/
├── apps/         # Web site, Discord bot, server, Discord Activity
├── packages/     # Bun workspace packages (@aphrody/shenron-*)
├── crates/       # Rust crates workspace (shenron-*, koharu-*, dragon-pixel)
├── deploy/       # Docker, compose, Cloudflare Worker CDN, SQL migrations
└── docs/         # Architecture decisions and technical specifications
```

---

## 3. Toolchain & Quality Gates

```bash
just check        # Bun check (TypeScript 7) + Cargo workspace check
just test         # Run unit and integration tests across web and Rust crates
```

> [!NOTE]
> Heavy Rust builds run on `vps` (12 cores) or `bunos` under shared lock; web and fast tests run locally on Bun.

---

## 4. Autonomous Directives (NHITL)

This repository operates under the **No Human In The Loop (NHITL)** doctrine. Refer to [`AGENTS.md`](file:///C:/src/shenron/AGENTS.md), [`GEMINI.md`](file:///C:/src/shenron/GEMINI.md), and [`CLAUDE.md`](file:///C:/src/shenron/CLAUDE.md) for full operational guidelines.
