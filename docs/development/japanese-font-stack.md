# Police de l'interface japonaise

La feuille générée `apps/site/src/app/fonts.css` sélectionne explicitement
`--font-jp` pour `--font-sans` lorsque `html[lang="ja"]` est actif. Les tokens
de titres qui suivent la police sans-serif utilisent la même famille. Le
générateur `apps/site/scripts/fonts.ts` porte cette règle ; aucune police
supplémentaire ni téléchargement au build n'est nécessaire.

La régénération hors ligne conserve les 131 fichiers de police existants :

```sh
cd apps/site
bun scripts/fonts.ts --offline
bun scripts/fonts.ts --offline --check
```

Qualification du 2026-10-07 : le parcours Next/Bun/Obscura en français, anglais
et japonais reste fonctionnel, mais les captures japonaises du binaire natif
testé présentent encore des carrés. Cette règle CSS ne corrige pas ce défaut.

Dans le worktree Aphrody inspecté, `collect_web_fonts` de
`crates/web/obscura-render/src/paint.rs` filtre les faces CSS et dynamiques par
`font_face_covers_ascii`. Les faces dont les plages ne couvrent que les
caractères japonais sont donc exclues. Le chargement et la sélection des
sous-ensembles non latins nécessitent une correction et une qualification
natives distinctes. Aucun nouveau binaire n'est installé par ce lot.
