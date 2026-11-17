---
name: crunchyroll
description: Headless Crunchyroll CLI, MCP server, and anime catalogue resolver for Shenron. Use when the user asks to query Crunchyroll, search anime, resolve episodes, or integrate official Crunchyroll watch URLs.
---

# Crunchyroll Service & MCP

Headless integration with Crunchyroll's official anime catalogue for Shenron.

## Features

- **CLI Tool:** `crunchyroll-cli` in system PATH (`crunchyroll-cli search <query>`, `crunchyroll-cli episode <id>`, `crunchyroll-cli resolve <id>`).
- **MCP Server:** Registered as `crunchyroll` via Bun on stdio. Exposes tools:
  - `crunchyroll_search`: Search series, seasons, and episodes.
  - `crunchyroll_get_series`: Retrieve series metadata and counts.
  - `crunchyroll_get_episode`: Retrieve episode title, duration, languages, and canonical watch URL.
  - `crunchyroll_resolve_offer`: Validate and format legal watch offers for Shenron's database.
- **Backend Service:** `@aphrody/shenron-crunchyroll` package in `packages/crunchyroll`.

## Usage Examples

```bash
# Search anime series and episodes
crunchyroll-cli search "beerus"

# Fetch episode metadata
crunchyroll-cli episode "GE00389313JAJP"

# Get direct canonical watch URL
crunchyroll-cli resolve "GE00389313JAJP"
```
