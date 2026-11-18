# ADR 0008 : Architecture unifiee Pure GPUI Kit 0.10.0 et purge Tauri/Dioxus/Leptos

- **Statut** : Accepte
- **Date** : 2026-11-18
- **Remplace** : ADR 0001 (Leptos/Dioxus), ADR 0007 (Dioxus 0.7.10 pour admin)

## Contexte

Le monorepo accumulait cinq piles UI incompatibles (Next.js/React/Tailwind/BaseUI, Leptos 0.8, Dioxus 0.7.10, Tauri 3 + CEF + `tauri-specta`). Cette fragmentation imposait des ponts IPC inutiles, quatre exceptions RustSec dans `deny.toml` (`RUSTSEC-2026-0367` a `0429` via `tauri-plugin-updater`), des pins git `tauri-apps/*` et une double maintenance desktop/web.

## Decision

1. **Dependance UI unique** : `gpui-kit = { version = "0.10.0", features = ["gpui-fast"] }` sur desktop (`gpui-fast-platform`) et web (`gpui-fast-web` `wasm32-unknown-unknown`, WebGPU `wgpu = "30.0.1"` avec repli WebGL2).
2. **Organisation par crates de capacites** : `shenron-theme`, `shenron-admin-ui`, `shenron-studio`, `koharu-app`, puis `shenron-wiki`, `shenron-reader`, `shenron-watch`, `shenron-chat`, `shenron-arena`, assembles dans le shell `shenron-desktop` et servis sur le web par Axum (`shenron-server` / `shenron-admin`).
3. **Purge des couches heritees** : suppression complete de Tauri 3, `tauri-runtime-cef`, `tauri-specta`, Dioxus, Leptos et des dependances npm `@tauri-apps/*`.

## Consequences

- Un seul modele de rendu GPU (`gpui-fast` + `wgpu 30.0.1`) pour desktop et web.
- Suppression immediate des 4 ignores RustSec et des pins git Tauri dans `Cargo.toml` et `deny.toml`.
- `shenron-studio` et `koharu-app` exposent directement leurs services Rust et vues `gpui-kit` sans couche IPC Tauri.
