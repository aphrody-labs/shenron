# shenron-ffi

ABI C de Shenron (`libshenron_ffi`) pour `bun:ffi` (`@aphrody/shenron-native`) et tout hôte C : la
commande `shenron` en processus, la recherche RAG, le corpus local, le découpage Markdown, la
persona, la présence des identifiants, depuis l'ABI 2 des tâches annulables, depuis l'ABI 3
la mémoire persistante du chat (`aphrody-memory`), depuis l'ABI 4 les modèles de chat locaux
(`aphrody-llama-server`), depuis l'ABI 5 la carte prototype Xenoverse 3 avec ses sources,
et depuis l'ABI 6 les décisions Jev typées et le reclassement de passages publics.

## Versions

- `shenron_abi_version()` vaut `abi::ABI_VERSION` (**6**). L'ABI 6 garde tous les symboles de
  l'ABI 5 et ajoute `shenron_jev_decide_job` et `shenron_jev_rerank_job` : décisions typées
  et reclassement des passages publics, hors du thread principal et annulables.
- L'ABI 5 ajoute `shenron_re_xenoverse3_map`, qui rend le graphe cartographique AGE 1000
  original sous forme de JSON possédé. La géométrie est schématique et les lieux publiés
  incluent leur provenance officielle.
- L'ABI 4 garde tous les symboles de
  l'ABI 3 et ajoute le chat local d'Aphrody (`aphrody-llama-server`, contrat `LOCAL-CHAT.md`),
  en processus : `shenron_llama_provision_job` (catalogue, téléchargements repris et vérifiés
  dans un magasin choisi par l'appelant, progression lue par `shenron_llama_progress`),
  `shenron_llama_router_start` / `shenron_llama_router_stop` (un routeur OpenAI par processus,
  un `llama-server` à la fois) et `shenron_llama_daemon` (le démon du superviseur, pour un hôte
  qui se relance lui-même comme lanceur : `shenron-server llama-daemon`).
- L'ABI 3 garde tous les symboles de
  l'ABI 2 et ajoute `shenron_memory_{add,search,delete,clear}` : le fournisseur SQLite local
  d'Aphrody (`aphrody_memory::SqliteLocalProvider`, un par fichier pour la vie du processus,
  fichier créé en mode 600), chaque appel rendant `JobOutcome<…>` ; Shenron ne stocke rien
  lui-même, il valide la requête et cantonne lecture et suppression à un `agentId`.
- L'ABI 2 garde tous les symboles de
  l'ABI 1 (mêmes signatures, même propriété, même JSON ; seule nuance : un résultat du corpus
  local porte toujours `entity`, à `null` quand il manque) et ajoute `shenron_build_info`,
  `shenron_job_new`, `shenron_cancel`, `shenron_job_release`, `shenron_job_count` et les
  variantes `*_job`.
- `shenron_build_info()` rend `BuildInfo` : `version` (version du workspace), `abi`, `target`
  (triplet), `os`, `arch`, `profile`, `features`, `rustc` (écrits par `build.rs`).
  `@aphrody/shenron-native` refuse une ABI, une cible ou une version différentes avant tout autre appel.

## Source unique des signatures et des types

`src/abi.rs` déclare chaque export dans `SYMBOLS` (genre de chaque argument et du retour) ; la
macro vérifie chaque entrée contre la fonction réelle à la compilation. `src/types.rs` définit
les charges JSON (`serde` + `specta`). `tests/typescript.rs` en génère
`packages/native/src/generated/{symbols,types}.ts` et échoue si ces fichiers sont périmés :

```sh
bun packages/native/scripts/generate.ts           # régénère (UPDATE=1)
bun packages/native/scripts/generate.ts --check   # porte ; cargo test -p shenron-ffi fait de même
```

Un test vérifie aussi que `SYMBOLS` liste exactement les fonctions `#[unsafe(no_mangle)]`.

## Mémoire

| Genre                               | Type Rust       | Propriétaire                                                                                                                 |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `cstr` (entrée)                     | `*const c_char` | l'appelant ; lu pendant l'appel seulement                                                                                    |
| `owned_str` (retour)                | `*mut c_char`   | alloué ici (allocateur global Rust), libéré une fois par l'appelant avec `shenron_string_free`, depuis n'importe quel thread |
| `static_str`                        | `*const c_char` | la bibliothèque, pour la vie du processus ; jamais libéré                                                                    |
| `thread_str` (`shenron_last_error`) | `*const c_char` | le thread appelant, jusqu'à son appel suivant ; jamais libéré                                                                |

Chaque export attrape les paniques (`catch_unwind`) : rien ne déroule à travers la frontière.

## Threads et annulation

- Tout export s'appelle depuis n'importe quel thread. Les appels longs bloquent leur appelant :
  on les lance depuis un thread de travail (`@aphrody/shenron-native/worker`). Le travail asynchrone
  tourne sur un runtime tokio global.
- `shenron_last_error` est local au thread : le lire sur le thread de l'appel en échec.
- Tâches : `shenron_job_new()` enregistre un jeton (`u64`, jamais réutilisé) ; un seul export
  `*_job` le consomme et le retire du registre quelle que soit l'issue (valeur, échec,
  annulation, panique) ; `shenron_job_release` oublie une tâche jamais lancée.
  `shenron_cancel(job)` (tout thread) lève le drapeau : l'appel rend `status = 125` dès son
  prochain point d'attente (`select!`) ; le travail bloquant (corpus local) tourne sur le pool
  bloquant de tokio, l'appelant est libéré aussitôt.
- Enveloppe `JobOutcome<T>` : `status` `0` (valeur), `1` (échec de l'opération), `64` (requête
  invalide, tâche inconnue ou réutilisée), `70` (panique), `125` (annulée) ; `error` sinon.
- `shenron_rag_search*`, `shenron_rag_stats*` et `shenron_auth_status` appellent la bibliothèque
  `shenron-cli` directement. `shenron_run_captured*` et `shenron_persona_ask*` capturent
  stdout/stderr : la redirection est globale au processus (tout thread qui écrit pendant ce
  temps, la console de Bun comprise, est capturé) et sérialisée par un verrou, dont l'attente
  est elle-même annulable.
- `shenron_sleep_job(job, ms)` est un diagnostic sans E/S (mesure de la frontière).

## Portes

```sh
APHRODY_LOCAL_CARGO=1 cargo clippy -p shenron-ffi --all-targets -- -D warnings
APHRODY_LOCAL_CARGO=1 cargo test -p shenron-ffi   # registre, annulation, codes, build info, paniques, TS à jour
```
