# @shenron/lexicon

Le lexique unique ja/fr/en de Shenron, en TypeScript (classe `pure`, sans dépendance).

- `@shenron/lexicon` : moteur — `Lexicon` (`resolve`, `label`, `search`, `mask`,
  `coverage`, `legacyEntries`), `maskText`, `restoreTokens`, `findTokens`, `fold`.
- `@shenron/lexicon/data` : `lexicon()`, les termes de `data/lexicon/terms.json` embarqués
  (`src/terms.generated.ts`, généré par `bun scripts/data/lexicon.ts build`).

Mêmes règles que le crate Rust `shenron-lexicon` : les deux lisent les fixtures dorées de
`data/lexicon/fixtures/` (`bun test`). Format, propriétaires et couverture :
[docs/architecture/lexicon.md](../../docs/architecture/lexicon.md).
