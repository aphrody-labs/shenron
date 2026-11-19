# Rust : style, durées de vie et boucle de travail des agents

Contrat Rust de l'espace de travail. Les niveaux de lint vivent dans `[workspace.lints]` de `Cargo.toml`, les réglages dans `clippy.toml` et `rustfmt.toml`, la chaîne dans `rust-toolchain.toml`. Ce texte ne répète pas ces fichiers : il dit comment écrire du code qui les passe et comment les agents le produisent. Carte du dépôt : `MAP.tsv` (`just map`).

## Style (règles Zed, lues dans `zed-industries/zed` AGENTS.md le 2026-11-19)

- Erreurs : pas de `unwrap()` hors tests (lint `unwrap_used` refusé), pas de `expect()` pour masquer une erreur récupérable ; propager avec `?`. Jamais `let _ =` sur un appel faillible : propager, `match`, ou journaliser l'erreur.
- Indexation : préférer `get()` et les itérateurs à `slice[i]` quand l'indice vient de l'extérieur.
- Modules : `src/nom.rs` à côté de `src/nom/`, jamais `mod.rs`. Ajouter au fichier existant plutôt que créer de petits fichiers.
- Noms complets (`queue`, pas `q`), sauf notation mathématique établie dans les noyaux numériques.
- Commentaires : seulement le pourquoi non évident. Un paragraphe pour justifier un contournement signale un code faux : corriger le code.
- Asynchrone : cloner par masquage dans le bloc lancé (`let state = state.clone(); async move { .. }`).

## Propriété et durées de vie

- Une donnée a un seul propriétaire ; le nettoyage passe par `Drop`, jamais par un appel manuel à chaque sortie.
- Les ressources confiées à une bibliothèque C ou à un rappel asynchrone (fichier, socket, poignée libuv ou CEF) restent vivantes jusqu'au rappel de fermeture : `Box::leak` puis reprise dans le rappel, ou un compteur de références, jamais un `Box` qui tombe en fin de bloc.
- Structures plates et tranches `&[u8]` aux frontières ; `#[repr(C)]` uniquement pour l'ABI C (`shenron-ffi`). Chaque `unsafe` tient sur un bloc court avec un commentaire `SAFETY:` qui dit quel invariant le rend sûr.
- Pièges vus lors du portage de Bun en Rust (bun.com/blog/bun-in-rust) : jamais d'effet de bord dans `debug_assert!` (supprimé en release) ; `bytemuck::cast_slice` panique sur une longueur impaire (tronquer à `len & !1`) ; les vérifications de bornes restent en release, une constante provisoire devient un plafond réel.

## Builds et portes

- Builds Rust sur `fr1` seulement, jamais sur le poste : `nice -n 19 ionice -c3 cargo ... -j2`, une compilation à la fois par répertoire cible.
- Porte d'une crate : la colonne `gate` de `MAP.tsv` (`cargo clippy -p <crate> --all-targets -- -D warnings`) ; porte complète : `just check`, `just lint`, `just test`.
- Crates autonomes hors espace de travail, avec leur propre `Cargo.lock` : `shenron-deployd`, `shenron-tv`.

## Boucle des agents

Le travail large passe par des boucles, pas par des agents à mandat général (« remplacer tout X ») :

1. une file de travail écrite (erreurs du compilateur groupées par crate, tests en échec, lignes d'audit), éléments petits et disjoints ;
2. un implémenteur par élément, sans écriture git ni `cargo` concurrent ;
3. deux relecteurs adverses, chacun dans son propre contexte, qui ne voient que le diff et doivent trouver pourquoi il est faux ; ils rejettent les bouchons écrits pour compiler, les tests sautés ou supprimés, et les contournements justifiés par un long commentaire ;
4. un correcteur applique leurs constats ; la porte tourne une fois, puis le commit se fait par chemins explicites (`git commit -- <chemins>`).

Essai sur trois éléments avant d'élargir. Quand la même erreur revient, on corrige la consigne de la boucle, pas la sortie.
