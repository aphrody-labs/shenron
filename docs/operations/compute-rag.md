# Calcul RAG et LLM — hôte de calcul, bases et tunnels

Le RAG et le LLM de production ne tournent pas sur le vps : le bot et le site appellent
`aphrody-ai-http` (`/api/v1/shenron/*`), servi par l'**hôte de calcul** (le poste WSL du
mainteneur, GPU RTX 4070), joint par un tunnel SSH inverse.

```
vps (bot, site) ──127.0.0.1:8789──▶ tunnel inverse ──▶ WSL : aphrody-ai-http :8789
                                                         ├─ aphrody-shenron-embed :8085 (e5 multilingue)
                                                         ├─ llama.cpp géré (Qwen3-4B + adaptateur shenron-chat-v2)
                                                         └─ PostgreSQL 16 + pgvector :54322 (schéma aphrody_ai)
dbfr : PostgreSQL 18 (shenron_site) et Redis, joints par `shenron-data-tunnel` depuis WSL.
```

## Unités (WSL, `systemctl --user`)

| Unité                         | Rôle                                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aphrody-ai-http`             | API Shenron du calcul (`aphrody-mcp http --bind 127.0.0.1:8789`), `EnvironmentFile=~/.aphrody/private/shenron/ai-http.env`.                                                                                                                       |
| `aphrody-shenron-embed`       | Embeddings e5 (`aphrody-embed serve`, port 8085).                                                                                                                                                                                                 |
| `aphrody-compute-vps-tunnel`  | `ssh -R 127.0.0.1:8789:127.0.0.1:8789 vps`, relancé en continu ; connexion propre (`-oControlMaster=no -oControlPath=none`) : accrochée à la connexion maîtresse du poste, elle se terminait aussitôt et systemd la relançait toutes les 5 s.     |
| `shenron-data-tunnel`         | Accès privé à PostgreSQL (15433) et Redis (16379) de dbfr.                                                                                                                                                                                        |
| `shenron-rag-sync` (minuteur) | Rafraîchit le corpus éditorial depuis PostgreSQL (`rag-sync-aphrody.ts --toutes --appliquer`) ; son drop-in fixe `SHENRON_FFI_LIB` (la bibliothèque native refuse un chemin implicite), à reconstruire en release après un changement de version. |

Le cluster `16/rag` (PostgreSQL 16, port 54322, démarrage automatique) porte la base du RAG :
rôle `aphrody_ai_http`, schéma `aphrody_ai` (`aphrody_rag_documents`, `aphrody_shenron_vectors`
en `vector(384)` avec index HNSW). Le rôle doit avoir `search_path = aphrody_ai, public` : les
requêtes du service ne qualifient pas leurs tables.

## Côté vps

Le bot lit `/etc/rose-griffon/shenron-bot.env` puis `/etc/aphrody/shenron-compute-client.env`
(URL et jeton du calcul). Deux réglages sont nécessaires pour le LLM :

- `APHRODY_SHENRON_INFERENCE=http` : sans lui, le bot charge une bibliothèque d'inférence
  native absente du vps et répond par la réplique de repli.
- `APHRODY_AI_CHAT_MODEL=qwen3-4b-instruct-2507-q4km` : le défaut `gemini-web/flash` exige une
  session Gemini Web côté calcul.

`APHRODY_AI_HTTP_TOKEN` doit être identique des deux côtés (WSL : `ai-http.env`). Un 401 du
bot sur `/api/v1/shenron/rag/*` signale un jeton désaligné ; ne jamais l'afficher.

## Reconstruire la base du RAG

La base vient d'un dump complet du cluster Supabase local (`~/aphrody/.portable/dumps/`).

```sh
sudo pg_createcluster 16 rag --port 54322            # puis listen_addresses = '127.0.0.1'
bun scripts/ops/extract-rag-schema.ts <dump.sql> <rag.sql>
sudo -u postgres psql -p 54322 < <role.sql>          # lignes CREATE/ALTER ROLE aphrody_ai_http du dump
sudo -u postgres psql -p 54322 -v ON_ERROR_STOP=1 < <rag.sql>   # passer le fichier par stdin
sudo -u postgres psql -p 54322 -c "ALTER ROLE aphrody_ai_http SET search_path = aphrody_ai, public"
systemctl --user restart aphrody-ai-http             # le pool garde l'ancien search_path sinon
```

Contrôle : `GET /api/v1/shenron/health` annonce `rag: true` ; `rag/stats` donne environ
254 000 documents et autant de vecteurs. `rag:build` ne tourne jamais au premier plan ni sur le
bot de production.

## Contrôle de la chaîne

`bun scripts/ops/compute-doctor.ts` (`--local` sans le vps) vérifie les unités, le cluster, les liens d'unités
morts, la santé et les statistiques du calcul, les bases de dbfr, le tunnel inverse, l'alignement du jeton
(empreintes seulement) et la recherche RAG de production. À lancer après tout redémarrage de WSL ou
changement d'Aphrody : un lien d'unité mort a déjà coupé le RAG pendant des heures sans alerte.

## Sondes

`scripts/ops/release.ts` sonde `https://bot.dragonballfr.com/api/public/rag/search?q=Kid Buu` :
un statut autre que 200 ou zéro résultat (`index_unavailable`) fait échouer la release.

## dbfr

PostgreSQL 18 (`shenron_site`, sauvegarde quotidienne `shenron-pg-backup` vers
`/var/backups/shenron-pg`, 14 dumps) et Redis (`maxmemory 4gb`, politique `noeviction`,
instantané RDB). Rien d'autre n'y tourne.

## Fidélité du chat RAG

`POST /api/public/rag/chat` (bot) répond depuis des passages numérotés `[n]` et ne sort jamais
de ce périmètre. Le contrôle est déterministe (`@shenron/pipeline/ai/grounding`, sans appel
modèle) :

- **Rappel** : le bot demande 12 hits, puis classe : canon d'abord (`db_*`, `canon_references`,
  `databooks`, `manga`), autres sources ensuite, fiches `wiki_pages` marquées « Cette fiche décrit
  un document collecté. Elle ne constitue pas une assertion canonique. » en dernier. Elles ne
  quittent pas l'index ; elles ne sont envoyées au modèle que s'il y a moins de 3 autres passages,
  et seules elles n'établissent rien (refus). La réponse renvoie les 8 premiers hits classés.
- **Citations** : le prompt impose `[n]` en fin d'affirmation. Une citation hors des passages
  fournis est supprimée ; une citation que le passage n'appuie pas est remplacée par le passage le
  plus proche (mots de contenu communs, au moins 2 en français) ; une phrase sans citation reçoit
  le passage le plus proche ; une phrase qui apporte un nom propre absent de tous les passages est
  retirée. La réponse JSON porte `citations` (`n`, `id`, `title`, `url`, `sourceId`), tous issus
  de `hits`. Réponse et passages dans deux langues (ex. réponse française sur des passages
  japonais) : un seul mot commun suffit et aucune phrase n'est retirée, la vérification est plus
  faible.
- **Refus** : `refusal: true` et « Non établi dans les sources » (fr, en, ja, selon `lang` puis
  la langue de la question) quand aucun passage n'existe, quand seules des fiches collectées
  existent, quand aucune entité de la question (mots capitalisés, katakana, kanji ; noms ja/fr/en
  du lexique) n'apparaît dans les passages, ou quand aucune phrase de la réponse n'est appuyée.
  Le refus ne coûte aucune génération.
- Le cache sémantique est rangé par `PROMPT_VERSION` (2) : l'ancien cache ne sert plus.

Mesures du 2026-10-05 (20 questions, GPU, adaptateur actif ; « après » = trois passages du code
livré, le bot de production n'étant pas redéployé par ce lot) :

| Mesure                                  | Avant (production) | Après                                              |
| --------------------------------------- | ------------------ | -------------------------------------------------- |
| Réponses avec citation valide (∈ hits)  | 0 / 20             | 100 %                                              |
| Entités hors corpus refusées (6)        | 0 / 6 (inventées)  | 6 / 6                                              |
| Faux refus (14 questions répondables)   | 0                  | 0 à 7 %                                            |
| Mots attendus dans la réponse           | 100 %              | 86 à 93 %                                          |
| Fiches collectées dans le top 3 (moyen) | 0,95               | 0,35                                               |
| Latence p50 / p95 (GPU)                 | 1,9 s / 3,3 s      | 0,5 à 0,8 s / 1,2 à 1,6 s (le refus ne génère pas) |

Avant le passage sur GPU, le même jeu ne passait pas : le chat dépassait les 30 s du proxy du
vps (503 « maintenance » sur les 20 questions). Limites : le modèle de 4 milliards de paramètres
répond parfois en français à une question en ja ou en anglais (la vérification lexicale est alors
plus faible, voir ci-dessus) ; les noms que le lexique ne connaît pas dans une autre langue que
celle des passages peuvent donner un faux refus.

Mesure : `bun scripts/ops/eval-rag-faithfulness.ts [--url <chat>] [--label x]` (20 questions fr, en,
ja, dont 6 entités hors corpus, dans `packages/pipeline/test/ai/fixtures/eval/rag-faithfulness.json`)
écrit `var/reports/rag-faithfulness-<label>-<date>.json` : citations valides (source ∈ hits),
références inventées (« épisode 142 »), refus correct, faux refus, mots attendus, fiches collectées
dans le top 3, latence.

## Inférence : adaptateur LoRA et GPU

- **Adaptateur** : `APHRODY_SHENRON_CHAT_LORA` est appliqué. Preuves : `llama-server` est lancé
  avec `--lora …/shenron-chat-v2/adapter.gguf --lora-init-without-apply`, puis le superviseur
  Aphrody l'active (`GET /lora-adapters` sur le port du serveur renvoie `scale: 1.0`) ; sur un
  serveur éphémère, les mêmes prompts (température 0, graine fixe) donnent des textes différents
  à `scale: 0` et `scale: 1` (14 réponses sur 20 de l'évaluation). Effet mesuré : style plus bref
  et plus proche des passages ; refus et citations inchangés (ils sont contrôlés dans le code).
- **GPU** : le `llama-server` installé (`~/.local/bin`, b11312, GNU 11.4) est une compilation
  CPU seule (`--list-devices` : aucun appareil) ; `--fit on` n'avait donc rien à décharger
  (7 tokens/s, GPU à 422 MiB). Réglage : compilation CUDA (sm_89, statique) de la même version
  dans `~/.aphrody/bin/llama-cuda/llama-server`, déclarée par `APHRODY_LLAMA_BIN` dans
  `ai-http.env` (sauvegarde `ai-http.env.before-p2d`, droits 0600). Après redémarrage de
  `aphrody-ai-http` : 5,8 Go de VRAM, 90 à 110 tokens/s, réponse du chat en 1 à 3 s au lieu de
  20 à 30 s.

```sh
# recompiler (WSL, cuda dans /usr/local/cuda, nice : charge élevée pendant 20 min)
git clone --depth 1 --branch b11312 https://github.com/ggml-org/llama.cpp.git && cd llama.cpp
PATH=/usr/local/cuda/bin:$PATH cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON \
  -DCMAKE_CUDA_ARCHITECTURES=89 -DBUILD_SHARED_LIBS=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF && nice -n 19 cmake --build build --target llama-server -j 4
```

Contrôle : `~/.aphrody/bin/llama-cuda/llama-server --list-devices` liste `CUDA0`, et
`nvidia-smi` montre le modèle en mémoire après la première requête de chat. Le service exige
le nom de fichier `llama-server` (`APHRODY_LLAMA_BIN`).

À savoir : l'unité `aphrody-compute-vps-tunnel` sort aussitôt avec le code 0 (la connexion
partagée `ControlMaster` de `~/.ssh/config` porte déjà la redirection) et systemd la relance
toutes les 5 s ; la redirection tient, mais le compteur de redémarrage grimpe.
