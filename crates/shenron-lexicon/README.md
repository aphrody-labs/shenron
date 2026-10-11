<!-- SPDX-License-Identifier: Apache-2.0 -->

# shenron-lexicon

Propriétaire de la logique du lexique unique ja/fr/en de Shenron : données embarquées
(`data/lexicon/terms.json`, `Lexicon::embedded`), recherche par langue et par alias,
normalisation (`fold`), masquage du plus long au plus court par jetons (`Masker`),
restauration tolérante (`restore`) et contrôle des jetons inventés ou perdus.

`koharu-translator` (`Glossary`) et `shenron-manga` le consomment ; `@aphrody/shenron-lexicon`
implémente les mêmes règles et lit les mêmes fixtures (`data/lexicon/fixtures/`,
`cargo test -p shenron-lexicon`). Voir [docs/architecture/lexicon.md](../../docs/architecture/lexicon.md).
