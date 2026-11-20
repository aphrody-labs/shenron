# Rust : déplacé dans aphrody-labs/wiki

Shenron est un dépôt Bun et TypeScript. L'espace de travail Rust (moteur, crates `shenron-*` et `koharu-*`, `dragon-pixel`, CLI, serveur MCP, FFI, `shenron-deployd`, `shenron-edge`, studio Koharu, bureau Tauri, `xtask`, configuration cargo, clippy, rustfmt, nextest) vit dans `github.com/aphrody-labs/wiki`, extrait en `../wiki` (variable `SHENRON_WIKI_DIR`). Les règles de style, la chaîne et la porte des crates y sont définies ; ce dépôt n'a plus de `Cargo.toml`, de `crates/` ni de workflow Rust.

## Données

`data/` reste ici : c'est le contenu Dragon Ball canonique, disposition inchangée. Le dépôt wiki le lit par `../shenron/data` (variable `SHENRON_DATA_DIR`).

## Comment les scripts Bun consomment la sortie de wiki

Rien n'est compilé ici. `packages/config/src/wiki-artifacts.ts` résout les sorties du dépôt wiki, échoue avec la marche à suivre quand elles manquent, et ne lance jamais cargo.

| Variable | Contenu | Défaut |
| --- | --- | --- |
| `SHENRON_WIKI_DIR` | extraction de `aphrody-labs/wiki` | `../wiki` |
| `SHENRON_NATIVE_DIR` | binaires natifs : `shenron-mcp`, `libshenron_ffi.so`, `koharu-sdk`, `shenron_ffi.dll` | `<wiki>/target` |
| `SHENRON_KOHARU_WASM_DIR`, `SHENRON_ENGINE_WASM_DIR`, `SHENRON_RE_WASM_DIR` | modules wasm de Koharu, du moteur et de `shenron-re` | sous `<wiki>` |
| `SHENRON_DRAGON_PIXEL_WASM_DIR` | build wasm de dragon-pixel | `<wiki>/target/wasm/dragon-pixel` |
| `SHENRON_NATIVE_GENERATED_DIR` | TypeScript généré par specta | sous `<wiki>` |
| `SHENRON_THEME_DIR` | thèmes GPUI natifs (`shenron.json`, `compose-m3-springs.json`) | `<wiki>/crates/shenron-theme/themes` |
| `SHENRON_DESKTOP_DIR` | application bureau | sous `<wiki>` |

Recettes `just` du groupe `wiki-artifacts` :

- `just wasm-sync` : `packages/koharu/scripts/sync-wasm.ts`, `packages/engine/scripts/sync-wasm.ts` et `packages/pipeline/scripts/sync-re-wasm.ts` copient les wasm dans les arbres `src/wasm` suivis ;
- `just native-generate` : `packages/native/scripts/generate.ts` copie le TypeScript généré par specta (`--check` échoue s'il est périmé) ;
- `just dragon-pixel-stage` : `scripts/ops/stage-dragon-pixel-wasm.ts` prépare le wasm de dragon-pixel (noms hachés, manifeste) ;
- `just dragon-pixel-wasm-check` : le chargeur du site ne référence que des fichiers et exports produits par le build.

Image et déploiement : `scripts/deploy/native-artifacts.ts digest|stage` fournit l'empreinte (clé `native` de la lane `server` dans `deploy/environment.json`) et la mise en place des trois binaires natifs ; le build Docker les reçoit par le contexte nommé `native` (`docker-bake.hcl`, `NATIVE_DIR`).

## Portes de ce dépôt

`just check`, `just lint`, `just test`, `just format-check` et `just ci` sont des recettes Bun seules. La version de release vient du `package.json` racine (`scripts/release/check-version.ts`).

## Bun compilé

`scripts/build/compile-mode.ts` choisit `--aot` seulement si le Bun qui compile l'annonce ; avec le Bun stable épinglé dans `deploy/environment.json` et `Dockerfile.build`, le mode effectif est `--bytecode`. `deploy/environment.json` porte le canal et la révision de Bun ; `bun scripts/deploy/environment.ts --verify-host` signale un hôte dont le canal ou la révision diffèrent.
