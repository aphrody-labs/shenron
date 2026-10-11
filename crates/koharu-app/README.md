# koharu-app

Tauri command layer of the editor inside Shenron Studio (`shenron-desktop`, the only Tauri
app): a library, no binary and no `tauri::Builder` of its own. Each command is a thin Specta
signature over the engine of `koharu-library` (`koharu_library::Editor`), which owns the
project, canvas, jobs, agent and settings. `shenron-desktop` calls `setup` (one editor under
`SHENRON_HOME`) and mounts `bindings()`.

The command signatures are the frontend contract (`packages/koharu/src/protocol.ts`):

```sh
bun --filter @aphrody/shenron-koharu protocol   # cargo run -p koharu-app --example protocol
```

`koharu_library::editor::dispatch` answers the same commands outside Tauri (`koharu-sdk`, the
`/api/local/koharu` bridge of `shenron-server`); a test keeps both lists equal.
