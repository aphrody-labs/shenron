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
