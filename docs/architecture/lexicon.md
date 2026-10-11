# Lexique unique (ja/fr/en)

Un seul lexique de traduction sert le site, l'API, le bot, le plugin, le pipeline et le
traducteur de Shenron Studio. Manga, scans et déclarations d'Akira Toriyama priment ; Fandom
n'est jamais une source.

## Format

- Source éditée à la main : `data/lexicon/terms.json`, schéma `data/lexicon/terms.schema.json`
  (`version: 1`, termes triés par `id`).
- Terme : `{ id, kind, ja, fr, en, romaji?, aliases?: { ja?, fr?, en? }, sources?: [{ lang?, ref }] }`.
  - `id` : slug anglais stable, jamais renommé ni réutilisé.
  - `kind` : `character`, `technique`, `transformation`, `race`, `place`, `item`, `event`,
    `title`, `saga`, `arc`, `organization`, `other`.
  - `ja`, `fr` : formes du wiki dragonballfr.com (`name_ja`, `name`) sauf source contraire.
  - `en` : forme anglaise officielle ; **vide tant qu'aucune source ne l'établit**. Les API
    renvoient alors la forme française avec `fallback: true`.
  - `aliases.ja` : autres graphies japonaises, masquées comme la forme principale ; une graphie
    japonaise n'appartient qu'à un terme. `aliases.fr`/`aliases.en` servent à la recherche.
  - `sources` : provenance des champs qui ne viennent pas du wiki (chemin du dépôt ou référence
    éditoriale : volume, chapitre, page de guide).

## Propriétaires

| Rôle                                                       | Propriétaire                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Données                                                    | `data/lexicon/terms.json`                                                                                                                                     |
| Logique (masquage, restauration, recherche, normalisation) | crate Rust `crates/shenron-lexicon` (données embarquées par `include_str!`)                                                                                   |
| Implémentation TypeScript conforme                         | `@aphrody/shenron-lexicon` (`packages/lexicon`, classe `pure` ; `./data` embarque les termes)                                                                 |
| Conformité                                                 | fixtures dorées `data/lexicon/fixtures/*.json`, lues par `cargo test -p shenron-lexicon` et `bun run --filter @aphrody/shenron-lexicon test`                  |
| Traducteur de Shenron Studio                               | `koharu-translator` (`Glossary::shenron`, `KOHARU_GLOSSARY`, `KOHARU_GLOSSARY_TARGET`)                                                                        |
| Pipeline manga                                             | `shenron-manga` (glossaire installé pour le français et l'anglais ; `SHENRON_LEXIQUE` remplace le lexique embarqué ; un `KOHARU_GLOSSARY` non vide l'emporte) |
| API                                                        | `GET /api/public/lexicon?lang=&kind=&q=&limit=&offset=`, `GET /api/public/lexicon/{idOrForm}?lang=` (`lang`, sinon `Accept-Language`, sinon `fr`)             |
| MCP                                                        | `dragonball.lexicon_search` (lecture, servi au public)                                                                                                        |
| Plugin                                                     | `references/lexique-canonique.{json,md}` et `scripts/lexique.js` de la skill `dragon-ball-japonais`, générés par `bun scripts/plugin/build-references.ts`     |
| Bot                                                        | expansion des requêtes RAG : `apps/bot/data/rag/lexique-requetes.json`, généré depuis le lexique par `packages/pipeline/scripts/rag-lexique.ts`               |

Règles communes (identiques en Rust et en TypeScript) :

- masquage du plus long au plus court, en une passe, sans chevauchement ; frontières de mot pour
  le katakana et le latin (`セル` ne mord pas dans `カプセル`) ; un terme garde le même jeton
  (`Zeta001`) ; au-delà du budget de jetons, les termes suivants restent en clair (`overflow`) ;
- restauration tolérante (casse, voyelles accentuées, un séparateur : `Zêta001`, `ZETA 001`),
  sans doublon (« la Terre Zeta003 ») ; jetons inventés rapportés dans `unresolved`, jetons
  perdus dans `missing` ;
- normalisation de recherche (`fold`) : pleine chasse → ASCII, minuscules, diacritiques latins
  retirés par table explicite, katakana → hiragana, lettres et chiffres seulement ;
- recherche : exact 100 (alias 90), préfixe 70 (60), sous-chaîne 50 (40), terme contenu dans la
  requête 20 ; ex æquo par forme la plus courte puis par `id`.

## Script

```sh
bun scripts/data/lexicon.ts build            # valide, puis écrit les sorties dérivées
bun scripts/data/lexicon.ts --check          # porte CI : validité, forme canonique, dérive
bun scripts/data/lexicon.ts coverage [--json] # couverture par langue et par type
```

Sorties dérivées (jamais éditées) : `packages/lexicon/src/terms.generated.ts` et
`data/lexique-db-canonique.json`. `import --force` a converti l'ancien fichier une fois
(2026-10-05) ; il n'est plus la source.

## Couverture (2026-10-05)

772 termes : ja 772 (100 %), fr 772 (100 %), en 47 (6,1 %), romaji 11 (1,4 %). Les formes
anglaises viennent des seules sources du dépôt (équivalences Viz/Funimation de
`rag-lexique.ts`, alias de races de `packages/config/src/races-alias.ts`,
`apps/site/messages/en.json`) ; le reste attend une source.

## Fin de vie de `data/lexique-db-canonique.json`

Sortie dérivée (`{ ja, fr, kind, length }[]`, types français historiques), gardée tant que des
consommateurs la lisent : le payload du serveur autonome (`scripts/build/server.ts`,
`server-data.ts`, `SHENRON_LEXIQUE` posé par `apps/server`), l'outil `lookup_lexicon` de
`koharu-library` (`editor/knowledge.rs`) et le VFS. Elle disparaît quand ils lisent
`data/lexicon/terms.json` ou le crate `shenron-lexicon`.
