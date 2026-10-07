# Shenron Chat: desktop, website, and bot

The same Shenron assistant serves three surfaces: **Shenron Studio** (desktop app, `/desktop`),
**the website** (`/api/chat`), and **the Discord bot** (DMs). This document describes each
surface's models, persona, memory, and limits. Code is authoritative; environment variables are
listed in [`operations/ENV.md`](../operations/ENV.md), and process topology in
[`architecture/RUNTIME.md`](../architecture/RUNTIME.md).

## Models

| ID | Model | Where it runs |
| --- | --- | --- |
| `shenron-chat-v2` | Qwen3-4B Instruct 2507 Q4_K_M + Shenron LoRA adapter | Desktop (default) |
| `gemma4-e2b` | Gemma 4 E2B instruct Q4_K_M (Unsloth, Apache-2.0) | Desktop (on-demand download), website and bot (production) |
| `gemini-web/flash` | Gemini web app, operator's Google session | Optional remote backend |

- **Desktop:** Aphrody's router and provisioner (`aphrody-llama-server`, contract
  `LOCAL-CHAT.md`) run inside `shenron-server` through `libshenron_ffi` (ABI 5,
  `shenron_llama_*`). `apps/server/src/chat-model.ts` only selects files (defaults pinned in
  `@shenron/config/chat-model`). One `llama-server` starts on first use; the supervisor
  re-executes `shenron-server llama-daemon`, so no Aphrody executable ships with the app. The
  model store is `<SHENRON_HOME>/models` (`registry.json`). The installer includes the Vulkan
  llama.cpp runtime and LoRA adapter. Qwen (2.5 GB) and Gemma (3.1 GB) download on first launch
  or on request from pinned Hugging Face revisions, with resume and SHA-256 verification.
  Without the adapter, `POST /api/local/models/shenron-chat-v2/import {path}` imports a local
  file.
- **Production:** Gemma 4 E2B is preloaded (weights locked in memory) in a service managed by
  `aphrody-infra`, reachable only over loopback. The website and bot call it when
  `APHRODY_AI_CHAT_BASE_URL` is set; RAG search remains on `aphrody-ai-http`. Measured on
  2026-10-06 without a GPU: about 350 ms to first token and 14–15 tokens/s.
- **Catalog:** `GET /api/v1/models` returns `{ order, backends, models, defaultModel, embedder }`.
  Each entry has a `state` (`ready | loading | downloading | installable | failed | unavailable`)
  and may include `progress`, `installUrl`, or `importUrl`. Requests select a model with
  `ChatRequest.model`; `done.model` identifies the responder.
- **OpenAI protocol:** the llama.cpp router used by `shenron-server` exposes `/v1/models` and
  `/v1/chat/completions`. `shenron-server` forwards those endpoints on its own origin for
  loopback clients only, preserving OpenAI JSON and SSE responses while stripping caller
  credentials before forwarding. This local endpoint is not Shenron's public API, which remains
  `/api/v1/chat` with its own SSE contract and owner authentication. See the
  [OpenAI compatibility matrix](openai-compatibility.md).
- **Gemini web** uses the operator's Google cookies (`~/.aphrody/google-cookies.json`). The
  catalog marks it unavailable after the first request with an expired session.

## Persona, agent home, and plugin

- **Template:** `templates/agent-home/` follows the native aphrody-agent-home format. It carries
  Shenron's persona, editorial rules (the manga, scans, and Akira Toriyama's statements take
  priority; Fandom is not an authority), the fr/en/ja language rule, and an empty `USER.md`. It
  is embedded by `@shenron/db/agent-homes` (`bun packages/db/scripts/agent-home-template.ts
  --check` in CI) and copied into the server payload. The guard in `scripts/build/server.ts`
  rejects private data.
- **One home per user**, identified as `discord:<user_id>`, or `local`:
  - **Desktop:** a `local` home is created on first launch under `<SHENRON_HOME>/agents/`.
    Discord sign-in (`POST /api/local/agent-home/login`) opens the system browser to the site
    (`/api/desktop/link`, Better Auth), which issues a signed code valid for two minutes. The home
    then becomes `discord-<id>`, including its memory.
  - **Discord DMs:** the bot creates the home on the first message in PostgreSQL
    `chat.agent_homes` (migration `0020_chat_agent_homes.sql`, applied by the `aphrody-infra`
    runbook). Until that migration is applied, the bot replies without creating a home; otherwise
    it stores files beside its database.
  - Desktop-to-cloud synchronization (full snapshots, latest `updatedAt` wins) is designed but
    not connected.
- **Every model acts as Shenron:** each backend's system prompt, including Gemini web, includes
  the home persona, user fields (name, language, timezone, preferences, treated as data), the
  `shenron` plugin index (`@shenron/api/plugin`, context only and not callable tools yet), and
  memory.

## Persistent memory

- **Storage:** `aphrody_memory` (`SqliteLocalProvider`) is called by `crates/shenron-ffi`
  (ABI 3) through `@shenron/native`; `apps/server/src/memory.ts` supplies the host factory. Each
  home has a database at `<home>/.aphrody/memory.sqlite` (default
  `<SHENRON_HOME>/data/memory.sqlite`), created with mode 600; access is scoped to one agent ID.
- **Each turn:** up to five relevant memories are attached to the question as data
  (`memory:recall` event), then up to three notable facts are stored (introduction, preferences,
  or explicit “remember that…” requests). `done.memory` is `{ recalled, stored }`;
  `memoryOptIn: false` excludes a turn. Memory failures never fail the turn.
- **Remote models:** memory is sent to all models by default; `SHENRON_MEMORY_REMOTE=off` keeps
  it local.
- **Owner-only endpoints:** `GET /api/v1/memory?q=&tag=&limit=`,
  `POST /api/v1/memory/{id}/delete`, and `POST /api/v1/memory/clear`; availability is reported in
  `groups.memory` from `/api/local/health`. In the bot, memory is active only when
  `SHENRON_FFI_LIB` points to the native library shipped with the release.

## Surfaces

- **Shenron Studio** (`/desktop`, `packages/ui/src/chat`): Material 3 chat assembled with
  `@aphrody/m3-ai` (MessageBubble, ChatComposer, ModelSelector), with persisted conversations,
  citations, a “model unavailable” state, memory controls (search, forget, clear all), and a model
  panel (install Gemma, import the adapter through the native file picker). Links open in the
  system browser. UI labels are localized in French, English, and Japanese.
- **Discord DMs** (`apps/bot/src/events/DirectMessageRelay.ts`): available to guild members.
  Defaults from `@shenron/config/dm-chat`: two concurrent generations, 20 queued requests with
  announced position, one in-flight request and five replies per user every 10 minutes, 90
  seconds per generation, 320 tokens and 1,800 characters per reply. Owners are unlimited and
  prioritized; `SHENRON_DM_CHAT=off` restricts chat to owners. Responses do not stream; the
  typing indicator is renewed.

## Decisions dated 2026-10-06

- The `shenron-chat-v2` LoRA adapter ships in the installer: it is model weight, not corpus data.
  It has no public download source and is not published elsewhere.
- No weights are republished on an Aphrody mirror; downloads use pinned Hugging Face revisions.
- Shenron consumes Aphrody capabilities rather than reimplementing them. The owner rule is WASM
  for the web, a binary for desktop, and `bun:ffi` for the Bun backend. Aphrody's router and
  provisioner are linked through `libshenron_ffi` (revision `30b0e8a4`, ahead of the generated
  dependency block and to be included when that block is updated); memory remains the SQLite
  provider from `aphrody-memory` in the same library (same file as `aphrody memory --db`), with
  `local_ops` arriving in that update.

## Open work

- Browser model: WebLLM with Qwen3-4B merged with the adapter (MLC `q4f16_1`, about 2.3 GB), not
  yet converted or tested.
- Next fine-tune on an RTX 4070 (12 GB): Qwen3.5-4B LoRA bf16, which requires Transformers v5
  in Aphrody's pipeline; immediate fallback is Qwen3-4B-Instruct-2507 (about 30 minutes for
  three epochs).
- Replace the `@shenron/pipeline` A2A hub (about 2,000 lines, legacy dialect) with `@aphrody/a2a`
  when published; move pipeline calls to the `aphrody` binary through FFI, which requires
  allowing `@shenron/native` through the `bun:ffi` guard.
