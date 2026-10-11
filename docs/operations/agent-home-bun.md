<!-- SPDX-License-Identifier: Apache-2.0 -->

# Agent Home dbfr côté Bun/TS

État vérifié le 2026-10-03. Le profil privé reste dans
`~/.aphrody/workspaces/dbfr` ; aucun contenu de profil, corpus ou credential
n'est copié dans le dépôt. Les variables sont décrites dans [ENV.md](ENV.md).

## Résolution du domaine

`packages/pipeline/src/agent-home.ts` résout le domaine déclaré par
`APHRODY_AGENT_DOMAIN`, puis celui d'`APHRODY_WORKSPACE`, puis
`APHRODY_PROFILE` (`shenron` est l'alias historique de `dbfr`). Le défaut de
ce consommateur Shenron est `dbfr`. Un domaine étranger conserve la persona
canonique sans lire son profil ni revenir implicitement sur dbfr.

Un workspace explicite doit désigner `<APHRODY_HOME>/workspaces/<domaine>`
(les liens symboliques sont résolus) et correspondre au domaine déclaré.
Une configuration incohérente est refusée avant récupération ou génération.
`APHRODY_WORKSPACE` prime sur l'alias historique `APHRODY_PROFILE_HOME`.
Cet alias seul est refusé s'il désigne un workspace d'un autre domaine.
Sans dossier explicite, le profil canonique sert en priorité ; l'ancien
`workspace-shenron` ne sert que si le canonique manque.

## Consignes d'exécution

`runIaTask` lit seulement les fichiers `SOUL.md` et `IDENTITY.md` du profil
résolu. Seules trois clés de frontmatter atteignent le prompt : `tone`,
`brevity` et `vibe`. Chaque valeur devient une ligne bornée à 200 caractères,
sans caractères de contrôle. Le corps Markdown et les mémoires du profil
n'atteignent pas le prompt. La garde anti-injection reste en dernière position.

Les consignes s'appliquent au modèle AI SDK et à la fonction chat historique.
Un profil par défaut absent ou sans ces clés conserve la persona canonique.
Un dossier explicitement désigné mais introuvable produit une erreur.
`getToriyamaPersona` reste compatible et utilise désormais la même résolution ;
il renvoie les deux textes bruts à son appelant et exige les deux fichiers.
Il n'est pas utilisé pour construire les instructions de `runIaTask`.

Le bot et le site qui appellent directement `generateGroundedAnswer` gardent
les personas de `ai/prompts`. Les scripts d'entraînement/évaluation utilisent
leur option `--soul` et sa clé `tone`. Leur alignement complet n'est pas établi
par ce lot. `runIaTask` n'utilise pas de cache sémantique ; `PROMPT_VERSION`
reste inchangé. Pour les consommateurs avec cache, la portée lie déjà le
contenu du contexte, le modèle, la version du prompt et la persona.

## Qualification

Les tests du profil utilisent des dossiers temporaires ; les suites de
récupération utilisent le vrai corpus préchargé et `requireLiveRag`.

```bash
(cd packages/pipeline && bun test test/workflows.test.ts test/workflows-ia.test.ts test/ai/prompts.test.ts test/ai/generate.test.ts test/ai/portability.test.ts)
bun run --filter @aphrody/shenron-pipeline typecheck
bun run --filter @aphrody/shenron-pipeline rag:test
```

Les cinq suites ciblées passent : 61 tests, 249 assertions, deux tests ignorés
préexistants. Le test `workflows-rag.live.test.ts` contrôle que les citations
réellement récupérées atteignent le prompt ; seul le modèle de capture est
simulé. Il exige le préchargement complet, sans contournement par des réponses
RAG fabriquées. La qualification live reste ouverte pendant l'ingestion.

## Agent homes par utilisateur

Le gabarit public et versionné vit dans `templates/agent-home/` : les sept documents natifs
d'`aphrody-agent-home` (`AGENTS`, `SOUL`, `IDENTITY`, `USER`, `TOOLS`, `HEARTBEAT`, `BOOT`),
avec `USER.md` vide (frontmatter `agent_id`, `address_as`, `language`, `timezone`, `avatar`,
`preferences`, `updated_at`, `template_revision`). `packages/db/scripts/agent-home-template.ts`
l'embarque dans `@aphrody/shenron-db/agent-homes` (`--check` en CI) ; `scripts/build/server.ts` le copie
dans le payload (`home/`) et refuse tout document manquant, toute entrée privée (`MEMORY.md`,
`memory/`, `.aphrody/`, base, `.env`) et tout `USER.md` rempli.

- Identifiant : `discord:<user_id>`, sinon `local` ; dossier `sanitize_profile` d'Aphrody
  (`discord-<user_id>`).
- Shenron Studio : `<SHENRON_HOME>/agents/<id>/` au format natif (documents, `memory/`,
  `skills/`, `.aphrody/workspace-state.json`, mémoire du chat `.aphrody/memory.sqlite`),
  `agents/active.json` désigne le home actif. Premier démarrage : home `local` (langue et
  fuseau du système). Connexion Discord : `POST /api/local/agent-home/login` ouvre le
  navigateur système sur `/api/desktop/link` du site (Better Auth), qui redirige vers
  `http://127.0.0.1:<port>/api/local/agent-home/callback` avec un code signé de deux minutes ;
  le serveur local le vérifie par `POST /api/desktop/link/verify`, déplace le dossier `local`
  vers `discord-<id>` (mémoire comprise) et bascule `SHENRON_LOCAL_OWNER`.
- Bot : le premier message privé crée `discord:<user_id>` dans PostgreSQL
  `chat.agent_homes` (migration `0020_chat_agent_homes.sql`), sinon dans
  `<dossier de DATABASE_PATH>/agents/`.
- Synchronisation (modèle, non branchée) : desktop et cloud échangent des instantanés complets
  (sept documents, `updatedAt`) en last-writer-wins sur `updatedAt`, égalité départagée par le
  contenu, comme le store de conversations (`newerHome`, `PgAgentHomeStore.put`, curseur
  `chat.change_seq`).
- Chat : `createLocalApi({ agentHome })` lit le home du propriétaire ; `USER.md` ajoute le nom,
  la langue de réponse, le fuseau et les préférences (citées comme données) au prompt système
  de tous les modèles.
