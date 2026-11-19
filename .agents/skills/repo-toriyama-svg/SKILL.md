---
name: repo-toriyama-svg
description: Create measured Dragon Ball SVG assets from inspected manga or animation references and qualify their rendered sizes.
metadata:
  short-description: Measured Dragon Ball SVG
---

# Measured Dragon Ball SVG

Before creating an asset, read the canonical procedure in [plugin/skills/toriyama-svg/SKILL.md](../../../plugin/skills/toriyama-svg/SKILL.md) and only its relevant linked references. Keep that file as the single source for measurement, geometry, render, and asset-delivery requirements. Do not invent measurements or claim a pixel/render check that was not performed.

Repository context: `MAP.tsv` for the area gates, `just toriyama-catalog-check` and `bun test packages/ui` for the geometry, `just plugin-pack` for the plugin. Manga and frame references are read from `cdn.dragonballfr.com` (GET or HEAD only); the CDN is moving from R2 and the Worker to Garage behind `shenron-edge` (ADR 0009 step 4, `docs/runbooks/cdn-garage-cutover.md`). Format and optimizer choices: `docs/research/media-formats-2026-11-19.md`.
