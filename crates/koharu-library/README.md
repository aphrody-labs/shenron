# koharu-library

`koharu-library` is the Koharu engine of Shenron Studio and its only owner. `editor::Editor`
holds the editor state (open project, canvas presentation, processing jobs, Codex agent,
settings) behind the editor commands; `koharu-app` (Tauri, in the Shenron Studio process),
`koharu-sdk` (JSON Lines) and `Service` (headless methods) are thin bindings over it.
`Library` and `Document` run the pipeline on in-memory or stored documents without an editor
(batch scanlation of `shenron-manga`). It owns project creation, persisted pages, import,
scene editing, undo/redo, processing, rendering and PNG/PSD/CBZ export, and exposes the
underlying scene, storage, config, pipeline, translator, ML, runtime, renderer, rasterizer,
PSD, desktop preparation, secrets and agent crates.

Storage (`home`): projects under `$SHENRON_HOME/data/koharu/projects` (the upstream
`Documents/Koharu` stays readable), packages and model weights under
`$SHENRON_HOME/cache/koharu/packages` (an upstream store is reused until the new one exists).

The `koharu-sdk` executable speaks JSON Lines over stdin/stdout for Bun and
`shenron-server`. `--root <absolute-directory>` picks a project collection (default: the
projects of Shenron's home), `--cpu` pins the models to the CPU and `--shenron-url <url>`
lets the agent search the local Shenron corpus. The `desktop` feature adds native file
pickers (`import`, `export`) and opens the Codex sign-in page.

Editor commands, as `@shenron/koharu/protocol` names them, run concurrently:
`{ "id": 1, "command": "get_project", "args": {} }` → `{ "id": 1, "result": ... }`; a byte
result is `{ "result": { "$bytes": "<base64>" } }`; channel arguments are IPC tokens
(`"__CHANNEL__:7"`) whose values arrive as `{ "channel": 7, "message": ... }`, then
`{ "channel": 7, "end": true }`.

Headless methods run in order: each input is
`{ "id": 1, "method": "project.list", "params": {} }`; each response is
`{ "id": 1, "result": ... }` or `{ "id": 1, "error": "..." }`. Errors do not claim success.
One project is open per process, shared with the editor commands.

Methods currently available:

| Area | Methods |
| --- | --- |
| Project | `list`, `create`, `open`, `close`, `delete`, `info`, `pages`, `page`, `selectPage`, `importPaths`, `undo`, `redo` |
| Page | `rename`, `delete`, `move`, `result`, `sourceSha256`, `exportPng`, `exportPsd` |
| Editing | `text.addPoint`, `text.addBox`, `text.setSource`, `text.setTranslation`, `text.setTypography`, `layer.setGeometry`, `layer.setVisibility`, `layer.move`, `layer.delete`, `raster.stroke` |
| Processing | `pipeline.run`, `pipeline.start`, `pipeline.status`, `pipeline.cancel` |
| Canvas preparation | `canvas.preparePage`, `canvas.manifest`, `canvas.resource` |
| Settings | `preferences.get`, `setPipeline`, `setProviders`, `setTypesetting`, `setCredential` |
| Discovery | `models.translation`, `models.pipeline`, `resources.status` |
| Agent | `agent.status`, `agent.models`, `agent.setConfig`, `agent.clear`, `agent.login`, `agent.cancelLogin`, `agent.logout`, `agent.run`, `agent.cancel` |

`agent.run` accepts `{ "prompt": "...", "cpu": false }` and returns
`{ "run": "<uuid>" }`. The process also writes event lines without an `id`:
`{ "event": "agent", "run": "<uuid>", "value": { "type": "started", ... } }`.
The `value.type` variants are `started`, `text_delta`, `reasoning_delta`,
`tool_started`, `tool_finished`, `completed`, `failed` and `cancelled`.
`agent.cancel` accepts `{ "run": "<uuid>" }`. Agent authentication uses the
existing native Codex credential store; `agent.status` exposes only whether an
account is present, the active run ID, and model preferences.
`agent.login` starts the native device login flow and emits `agent_login`
events containing progress, a device verification code, and a terminal result.
`agent.cancelLogin` requests cancellation. No access token or account identity
is returned. `agent.clear` resets the in-process conversation history; the
history otherwise survives multiple runs against the same open project.

`pipeline.start` accepts the same optional `operation`, `scope` and `cpu`
parameters as `pipeline.run` and returns `{ "job": 1 }`. Its JSONL events have
`{ "event": "pipeline", "job": 1, "value": { "type": "..." } }` and include
model loading, stage progress, and a terminal `completed`, `stopped` or `failed`
value. `pipeline.status` reports the currently running job ID, and
`pipeline.cancel` accepts `{ "job": 1 }` to request cancellation via the
pipeline's native stop token.

`page.sourceSha256` accepts `{ "page": "<entity-id>" }` and returns
`{ "sha256": "<64 lowercase hex characters>" }`. It hashes the encoded source
image bytes actually persisted in the project. For an imported PDF, this is
the rendered page image, not the entire PDF document.

The Rust API supports `Document::memory`, import from images and archives,
`Library::process` with a progress sink and stop token, page results, native
rendering and export. Project and document edits are revisioned. The JSONL
`pipeline.run` call is synchronous; `pipeline.start` is the event-driven path.
Native runtime libraries and model weights can be downloaded
from their configured upstream releases on first use. This checkout does not
bundle those binaries or weights, so offline operation is not guaranteed.
The Tauri/CEF desktop shell and update distribution remain outside this
headless API.
