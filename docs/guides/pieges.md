# Pièges critiques

Faits mesurés, pas des hypothèses : relire avant de rejouer un diagnostic. Les
pièges d'hôte (unités, Nginx, swap, bascule) relèvent d'`aphrody-infra`
([`INFRA-DELEGATION.md`](../operations/INFRA-DELEGATION.md)) et ne sont pas
tenus ici.

## Données et bases

- **Wiki = PostgreSQL, SQLite du bot = réplica.** On n'écrit plus le wiki dans
  SQLite : les écrivains éditoriaux sont gardés par
  `apps/bot/src/db/wiki-write-guard.ts` (`process.exit(1)` sauf
  `ALLOW_SQLITE_WIKI_WRITE=1`), car le reverse-sync
  (`apps/bot/scripts/sync-neon-to-sqlite.ts`) les écraserait. La garde ne
  s'applique pas quand l'entrée est `src/index.ts` : le bot importe l'auto-seed
  au démarrage, et un `exit` au niveau module échappait à son `try/catch`
  (boucle de redémarrage vécue). Le reverse-sync lui-même est exempté par son
  chemin exact, jamais par l'override.
- **Scripts de sync : pas de `main()` au niveau module dans un fichier
  importé.** Les constantes partagées (`WIKI_EDITORIAL`) vivent dans
  `apps/bot/scripts/_wiki-editorial.ts`, sinon l'import déclenche une seconde
  synchronisation.
- **NOT NULL et UNIQUE côté SQLite, absents côté PostgreSQL** : le reverse-sync
  remplace un NULL par le défaut SQLite (sinon 0 ou '') et écarte un doublon
  d'index unique, compteurs `nullsReplaced` et `duplicatesDropped` dans son
  rapport. Toujours poser une valeur par défaut en PostgreSQL pour ces colonnes
  (voir [`wiki-data-ingestion.md`](wiki-data-ingestion.md)).
- **`drizzle-kit migrate` échoue silencieusement sous Bun** et `db:push` est
  interdit (il propose de supprimer les tables du schéma `bot` créées hors
  Drizzle). Les migrations s'écrivent en SQL idempotent et s'appliquent par le
  runbook `aphrody-infra`.
- **jsonb avec postgres-js : `sql.json(value)`, jamais
  `${JSON.stringify(value)}::jsonb`** — la colonne recevrait un scalaire chaîne
  (`jsonb_typeof = 'string'`), ce qui casse aussi le revert de
  `/admin/wiki/history`. Réparation : `set col = (col #>> '{}')::jsonb where
  jsonb_typeof(col) = 'string'`. Pour un tableau, passer par un helper qui caste
  (voir `apps/site/scripts/depose-wiki.ts`).
- **Indexer un jsonb par paramètre exige `::int`** : `pages->${idx}` lie un
  texte, donc la clé d'objet, qui vaut toujours NULL sur un tableau ; et
  `jsonb_set(…, NULL)` vaut NULL, donc un `UPDATE` mal typé efface la colonne.
  Écrire `pages->${idx}::int` et ceinturer l'`UPDATE` d'un
  `jsonb_typeof(pages->${idx}::int) = 'object'`.
- **`= any(${tableau})`** échoue (`malformed array literal`). En drizzle,
  développer la liste avec `sql.join` ; en postgres-js pur, `in ${sql(ids)}`.
- **postgres-js rend les `bigint` en chaînes** : `Number()` sur toute borne lue
  en base, sinon `"9" <= "11"` est faux.
- **`.env` à deux `DATABASE_URL`** : ancrer `^DATABASE_URL=` et prendre la
  **dernière** ligne.
- **Bun interprète `$VAR` dans `.env`** : échapper par `\$` (les quotes simples
  ne protègent pas).
- **Ne jamais copier une base SQLite vivante ni écrire par-dessus.** Un
  `cat >` sur `results.db` pendant une lecture a corrompu le corpus OCR (2026-09-14).
  Émetteur : `VACUUM INTO` vers un instantané ; récepteur :
  `bun scripts/ops/recoit-ocr-results.ts` (fichier temporaire, `integrity_check`,
  refus d'une régression, `rename` atomique) ; lecteurs :
  `openOcrResultsReadonly()` de `scripts/ops/_ocr-results-db.ts`.
- **Une opération SQL ad hoc sur `apps/bot/data/bot.db` pendant que le bot
  tourne** (migration, `ALTER`, script de lecture) peut bloquer ses handlers
  HTTP : `/health` ne répond plus alors que le port écoute. Travailler sur une
  copie.
- **`name_ja` n'est pas garanti japonais** (rōmaji, coréen, noms de comédiens
  échappés d'une infobox) : exiger au moins un kana ou un kanji avant d'en faire
  un juge d'identité ; outil `apps/site/scripts/corrige-name-ja-fautifs.ts`.
- **Fuite d'infobox de l'ancien import** (`race = "Giras|Concepteur=…}}"`) :
  nettoyée par `apps/bot/scripts/fix-infobox-leak.ts` (idempotent, sur
  PostgreSQL) ; repropager au RAG par
  `packages/pipeline/scripts/rag-embed-vectors.ts`.
- **Drizzle et schémas personnalisés** : `schemaFilter` fait détecter les
  tables `bot.*` créées par les scripts comme orphelines et proposer leur
  suppression. Appliquer les changements en SQL (`ALTER TABLE … ADD COLUMN IF
  NOT EXISTS`).

## Bot

- **tsyringe + `import type`** casse `Reflect.metadata("design:paramtypes")` :
  toujours `import { Classe }` pour une classe injectée.
- **`_entries.ts` désynchronisé** : une commande ajoutée sans
  `bun --filter @aphrody/shenron-bot gen:entries` n'est pas chargée.
- **Intent retiré, handler muet** : sans l'intent `GuildMembers`,
  `message.member` vaut `null` et les handlers qui en dépendent (montée de
  niveau, rôles automatiques) deviennent des no-op silencieux. Vérifier les
  intents avant de toucher `apps/bot/src/lib/personas.ts`.
- **Better Auth bot ≠ site** : deux processus, deux bases ; toucher les tables
  `ba_*` d'un côté n'affecte pas l'autre.
- **`apps/bot/public/*` n'est pas servi automatiquement** : chaque fichier a sa
  route explicite dans `apps/bot/src/api/server.ts`.
- **Le chemin d'image en base n'est pas un chemin de disque** :
  `assets/wiki/*` est routé vers `apps/site/public/wiki/`. Vérifier la racine
  avant de conclure à une image manquante.
- **`EpisodeFrame`** : type source dans `apps/bot/src/db/episode-frames.ts`,
  dupliqué côté site ; garder les deux alignés (`imagePath`, `isNotable`).
- **`Bun.spawn` sous un gestionnaire de services** : `PATH` minimal ; lancer
  Bun par `process.execPath`, jamais par le nom `bun`.
- **Proxy HLS** : certains lecteurs renvoient un MP4 progressif ; détecter le
  type avant toute lecture texte et diffuser le corps tel quel.

## Site Next

- **Jamais de session (cookies, en-têtes) dans le layout racine** : toutes les
  pages basculent en `private, no-store`. L'authentification de la navigation
  est un îlot client (`/api/me`).
- **`generateStaticParams` obligatoire sur une route `[param]`** pour qu'elle
  soit prérendue et cachée malgré `revalidate`.
- **`shenron.ts` et `db-universe.ts` sont server-only** : un composant client
  qui a besoin d'`assetUrl` importe `@/lib/assets`, sinon `postgres` fuit dans le
  bundle client.
- **URL du site, de l'API et des assets** : `apps/site/src/lib/config.ts` est la
  source unique côté site ; ne jamais réécrire une origine en dur.
- **Toute nouvelle page sous `/wiki` est fermée par défaut** (`proxy.ts`) :
  l'inscrire dans `LAUNCH_CATEGORIES` (`apps/site/src/lib/wiki-launch.ts`).
- **`_next/image` n'accepte que `q=70`** (`qualities` dans `next.config.ts`) ;
  largeurs valides 640/828/1080/1200/1920.
- **Le thème vient de la base** : `public."SiteTheme"` (ligne `default`) surcharge
  les `--dbz-*` de `globals.css` à chaque rendu. Lire la ligne avant de
  conclure à un bug de couleur.
- **La home n'est pas dans le HTML servi** (`HomeExperience` en import
  dynamique) : vérifier un style dans le CSS compilé.
- **`<ViewTransition>` n'existe pas sur React stable** :
  `apps/site/src/components/ViewTransition.tsx` dégrade en fragment, à dessein.
- **Une page lourde n'est pas forcément une page qui rend tout** : décomposer le
  poids (`class=`, charge RSC, liens) avant de paginer. Inversement, un index qui
  sérialise toutes ses lignes est le premier suspect (`/wiki/manga` envoyait
  12 362 chemins pour 24 couvertures).
- **Tester un module `server-only` hors de Next** : précharger un plugin Bun qui
  remplace `server-only` par un module vide (`bun --preload stub.ts essai.ts`).
- **`next dev` réécrit `apps/site/tsconfig.json`** : restaurer le fichier avant
  de committer.
- **La vérification de types des tests du site couvre `apps/site/scripts/`** : un brouillon
  `_tmp-*.ts` oublié casse la porte ; écrire les brouillons hors du dépôt.
- **Un `next build` qui meurt au prérendu n'accuse pas le code** :
  `ENOENT … page.js` après « Error occurred prerendering » signale un worker
  tué. Le build est gourmand en mémoire (plus de 26 Gio de mémoire anonyme
  mesurés pour ~2 300 pages) ; vérifier la mémoire libre et borner les workers
  par `BUILD_CPUS` et `BUILD_STATIC_CONCURRENCY`. Au premier échec, reconstruire
  le dernier commit connu bon avant d'accuser le code.

## Interface

- **`mx-auto` sur un enfant direct de `<main>` casse le mobile** : la marge
  automatique annule le `stretch` du flex ; ajouter `w-full`. Mesurer les
  boîtes (`getBoundingClientRect`), pas `scrollWidth`.
- **Aucun champ de saisie sous 16 px** (zoom iOS) ; règle globale dans
  `globals.css`.
- **Cible tactile de 44 px** par `.cible-44`, dans sa couche CSS ; re-mesurer
  sur le plus petit écran après élargissement.
- **Animations pilotées par le défilement** : jamais de borne `cover` sur un
  conteneur haut (fondu bloqué à ~11 % d'opacité) ; borner sur `entry`.
- **Un test qui lit le source doit ignorer les commentaires**, sinon il accuse
  la documentation d'un correctif.

## RAG, OCR et modèles

- **`rag:build` dure ~2 h et émet un `DROP`/recreate** qui gèle les handlers
  HTTP : jamais au premier plan, jamais sur la base servie, jamais sur le bot de
  production. Pour recalculer les seuls vecteurs :
  `packages/pipeline/scripts/rag-embed-vectors.ts` (sans verrou d'écriture,
  insertion finale atomique). Détail : [`rag-enrichment.md`](../architecture/rag-enrichment.md).
- **Le japonais dense sature le modèle d'embedding** : un signe vaut à peu près
  un jeton ; estimer la durée d'un build au prorata des chunks est faux d'un
  facteur 5.
- **Le juge des défauts ne doit pas confondre mise en page et hallucination** :
  séparateurs de tableaux Markdown et files d'un même signe sont exclus du
  détecteur de boucle.
- **Modèles à raisonnement** : sans `think: false`, la réponse peut rester vide
  quand la limite de jetons tombe avant la fin du raisonnement ; l'endpoint
  OpenAI-compatible d'Ollama ignore ce paramètre.
- **Un continued-pretrain sur un dump brut dégrade la factualité** (éval du
  2026-06-24 : 33 % contre 75 % pour le modèle de base) : les faits passent par
  le RAG ; un modèle « faits » demanderait un instruction-tune sur des paires
  question-réponse propres.
- **PaddleOCR sur du français** : le reconnaisseur `PP-OCRv5_mobile_rec`
  (chinois/anglais) détruit accents et apostrophes ; `lang="fr"` charge le
  reconnaisseur latin.
- **Crawl BXC** : reprendre la file SQLite existante sans recréer les URL déjà
  terminées ; contrôler l'espace disque avant `bxc crawl-worker` ; exclure
  images, CSS, JavaScript et binaires des files éditoriales.

## Paquets et builds (mesurés le 2026-10-06)

- **`@aphrody/m3-motion` 3.3.4 casse le build Next** : ses sources importent
  `./components/M3Collapse.js` alors que seul le `.tsx` est livré. `apps/site/next.config.ts`
  résout m3-motion, m3-theme et m3-tokens sur leur `dist/` ; la 3.3.6 corrige les imports.
- **Le WASM de koharu-canvas n'est pas suivi par Git** : sur un arbre propre (CI, worktree,
  installeur), `packages/koharu/src/wasm/` reste vide tant que
  `bun --filter @aphrody/shenron-koharu build:wasm` n'a pas tourné, et `/studio` comme l'audit des
  paquets cassent.
- **`minimumReleaseAge` bloque une version `@aphrody/*` publiée le jour même** : l'exclusion
  se déclare dans `bunfig.toml`.
- **Un sprint UI peut effacer l'identité du site** : voir
  [`products/accueil-et-shell.md`](../products/accueil-et-shell.md).

## Outils

- **Le répertoire courant persiste entre appels du shell d'agent** : enfermer
  un `cd` dans un sous-shell (`(cd apps/site && …)`).
- **Une boucle d'attente `pgrep -f motif` se détecte elle-même** : attendre une
  trace de journal plutôt que l'absence d'un processus.
- **Bun et les gabarits HTML** : un `.html` importé ne doit référencer que des
  assets sources, jamais des sorties hachées d'un build précédent.
- **`fetch` et en-têtes conditionnels** : typer explicitement
  `Record<string, string>` au lieu d'une union inférée, refusée par
  `HeadersInit`.
