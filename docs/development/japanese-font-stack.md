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

## Reproduction native isolée

La qualification isolée emploie le même fichier local
`/fonts/noto-sans-jp/2c0a698f3f840c00.woff2` et le même texte `エ` dans deux
pages jetables. Seul `unicode-range` change : `U+30A8` pour le sous-ensemble,
`U+0000-10FFFF` pour le contrôle. Les deux pages téléchargent le fichier une
fois. La première capture montre un carré ; le contrôle montre le caractère
japonais. Le décodage du fichier fonctionne donc dans le binaire testé ; le
filtrage de la sélection pour le rendu est en cause.

Les preuves locales sont `var/reports/integration/japanese-subset.png`,
`japanese-broad.png`, `japanese-subset-counts.json` et
`japanese-subset-reproduction.log`. Elles ne sont pas commitées. Le moteur
inspecté limite aussi les faces chargées à seize : retirer le filtre sans
sélection des sous-ensembles utiles ne garantit pas le rendu d'une page
japonaise complète. Le correctif doit couvrir ce cas et le choix des glyphes
entre plusieurs faces d'une même famille.
