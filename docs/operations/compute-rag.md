<!-- SPDX-License-Identifier: Apache-2.0 -->

# Calcul RAG et LLM — hôtes, propriétaires et qualification

Répartition demandée le 9 octobre 2026 : poste propriétaire pour le développement
léger Bun/Python, PC Windows d’Omar pour le GPU dédié, VPS pour les builds, la
collecte et les caches, DBFR pour la production. Aucun build lourd ni calcul GPU
ne tourne sur le poste propriétaire. Les adresses et allocations effectives
viennent du catalogue Infra et de ses fichiers privés.

## Inférence native et vLLM

Shenron consomme les capacités Aphrody. `resolveDirectChat` dans
`@shenron/pipeline/ai/config` résout le serveur explicitement choisi par Infra.
`createShenronProvider` expose ce serveur comme modèle AI SDK `chat`, y compris
la génération et les flux. `createOpenAiChat` conserve les consommateurs site/bot
existants. Les deux chemins envoient la clé amont `APHRODY_AI_CHAT_API_KEY`.

- `APHRODY_AI_CHAT_BASE_URL` : URL OpenAI-compatible en HTTP de boucle locale,
  terminée par `/v1`. Infra doit maintenir le tunnel authentifié vers Omar.
- `APHRODY_AI_CHAT_MODEL` : identifiant réellement annoncé par `/v1/models`.
- `APHRODY_AI_CHAT_API_KEY` : clé du modèle dans un store privé ; aucune valeur
  n’entre dans le dépôt, les rapports ou les arguments d’une commande.
- `APHRODY_SHENRON_INFERENCE=http` : le bot utilise ce transport explicitement
  au lieu de charger une bibliothèque GPU dans son conteneur de production.

Le serveur autonome relaie les routes OpenAI avec la séparation entre clé amont
et jeton de la passerelle. Une réponse d’erreur ou une capacité absente du modèle
reste visible ; le relais n’invente ni Responses, ni compaction, ni entraînement.
Les réponses personnalisées et les sessions ne deviennent pas un cache partagé.

`shenron-chat-v2` désigne Qwen3-4B-Instruct-2507 et son adaptateur Shenron, comme
le fixe `@shenron/config/chat-model`. Le Gemma 4 quantifié de la flotte Aphrody
est un candidat distinct. Sa seule disponibilité ne remplace pas le modèle
entraîné ni ne prouve une amélioration du RAG.

## RAG, PostgreSQL et agent home

La configuration du chat ne change pas la recherche : `RAG_BACKEND=aphrody`
conserve la passerelle privée `/api/v1/shenron/rag/*`, l’espace E5 multilingue
384 dimensions, le reclassement et les contrôles de citations. PostgreSQL DBFR
reste la source éditoriale. Aucune réplication de cookies, de comptes fournisseurs
ou d’historiques bruts n’est impliquée.

L’agent home `dbfr` et la persona `SOUL.md`/`IDENTITY.md` restent dans leurs stores
privés, avec le contrat d’isolation décrit dans [agent-home-bun.md](agent-home-bun.md).
Les capacités RAG, OCR, embeddings et vision conservent leur propriétaire même
si le chat direct fonctionne sans passerelle de calcul.

Préparer et qualifier le corpus sur l’hôte déclaré, avec la connexion PostgreSQL
et la passerelle RAG réellement configurées :

```sh
bun run --filter @shenron/pipeline rag:prepare
bun run --filter @shenron/pipeline rag:test
```

Le garde `requireLiveRag` refuse un preload incomplet, périmé ou des sources
éditoriales non validées. Un HTTP 200 ou un nombre de chunks ne ferme pas cette
qualification. Les captures de [Aphrody Web](dragon-ball-web.md) restent des
sources collectées ; leur ingestion ne les transforme pas en affirmations canoniques.

## Entraînement et promotion

`scripts/ops/train-shenron-chat-loop.ts` génère et évalue des rollouts. Cette
boucle historique ne lance pas encore l’entraînement malgré son ancien intitulé.
Le véritable entraîneur est `aphrody_train.lora` dans Aphrody, avec jeu gold
intouché, recontrôle anti-fuite, poids finis et export GGUF vérifié. Les jobs
sur le GPU d’Omar doivent détenir un bail exclusif et suspendre l’allocation
vLLM avant de charger le modèle de train ; ils ne concurrencent pas l’inférence.

Une nouvelle LoRA utilise un nouveau dossier privé. La promotion exige une
évaluation indépendante face à la version active et le passage des seuils du
propriétaire train. Aucun job ni changement de modèle de production n’est
justifié par le seul passage de tests de transport.

## Réception source du 9 octobre 2026

Les tests de transport natif exercent un vrai serveur HTTP Bun éphémère, la clé
amont, la génération et les événements SSE. Cela qualifie le raccordement produit,
pas encore un modèle vLLM réel, un training GPU, le preload courant ni l’activation
DBFR. Ces quatre réceptions sont séparées et doivent avoir leurs propres preuves.

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
