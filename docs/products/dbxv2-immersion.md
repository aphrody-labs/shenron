# Immersion DBXV2 (accès staff actuel)

Le propriétaire déclare le 2026-10-20 que l'accord confidentiel Toei, Shueisha et Bandai Namco
couvre Xenoverse 2 et demande la publication des CPK et données DBXV2. L'accord n'a pas été
vérifié indépendamment. L'intégration actuelle de [`@aphrody/shenron-dbxv2`](dbxv2-plugin.md)
reste limitée à l'admin et au mesh ; l'accès public demandé n'est pas encore livré. Les CPK et
la base ne doivent pas être copiés dans Git ni intégrés aux artefacts de build.

## Portes

1. `dbxv2SiteGate()` (`apps/site/src/lib/dbxv2-gate.ts`, sans dépendance) : faux sans
   `DBXV2_SERVER_URL` (http/https) et `DBXV2_TOKEN` (≥ 16 caractères), **toujours faux** en rendu ou
   build public (`SHENRON_PROFILE=public`, `SHENRON_PUBLIC_RENDER`, `SHENRON_PUBLIC_BUILD`) et avec
   `NODE_ENV=production`. Cette porte décrit l'implémentation actuelle et devra évoluer pour la
   surface publique demandée ; le paquet recontrôle `isDbxv2Enabled` une fois chargé.
2. `src/proxy.ts` garde `/admin/**` avant tout rendu ; la page et **chaque action serveur** rappellent
   `requireAdmin()` (une action est un point d'entrée public).
3. Seuls des codes d'erreur stables (`disabled`, `unavailable`, `invalid`, `unsupported`, `failed`)
   quittent le serveur, jamais un message brut.

## Chargement sans empaquetage

`apps/site/src/lib/dbxv2.ts` charge le paquet privé par un `import()` dynamique masqué au bundler
(`webpackIgnore` / `turbopackIgnore`) depuis le checkout (`packages/dbxv2/src/index.ts`). Le site ne
le déclare pas dans son `package.json` et ne l'importe jamais statiquement : aucun bundle ne le
contient. Runtime Bun requis ; sans lui, l'espace affiche « serveur indisponible ».

Le navigateur ne reçoit que des **URL signées de même origine**
(`/admin/dbxv2/media/<type>/<cpk>/<chemin>?exp&sig`, HMAC, 300 s), jamais le jeton ni l'adresse du
proxy. La route `app/admin/dbxv2/media/[...path]` (404 sans porte ouverte ou sans session admin)
relaie vers le proxy loopback du site, qui vérifie signature et expiration, et transmet `Range`
(lecture son/vidéo). Un proxy sur un autre port est cross-origin : Chrome le refuse (CORP
`NotSameSite`, pas de CORS pour `fetch`), d'où le relais. Le poste doit être celui du serveur privé
ou joindre son serveur par tunnel.

## Espace admin

- `/admin/dbxv2` : statistiques, recherche hybride (fr/en/ja, BM25 + e5, lexical sans embeddings),
  fichiers filtrés (chemin, format, CPK) avec aperçu texture / son / vidéo / modèle, messages par clé.
- `/admin/dbxv2/immersion` : emplacements nommés de l'immersion de Dragon Pixel.
- Libellés : `apps/site/messages/dbxv2/{fr,en,ja}.json` (hors dictionnaires publics, importés
  uniquement par `src/lib/dbxv2-text.ts`, donc absents des bundles publics). Tests de parité.

## Immersion de Dragon Pixel

Le jeu public reste identique. Le propriétaire écrit `var/dbxv2/immersion.json` (ignoré par Git,
chemin surchargeable par `DBXV2_IMMERSION_MAP`) :

```json
{ "slots": { "hit-1": { "ref": "SE/chemin.acb", "kind": "wav", "cue": 3 } } }
```

Une page **privée** appelle `loadImmersionPack()` après `requireAdmin()` et obtient des URL signées par
emplacement. Sans porte ouverte, sans session ou sans fichier : pack vide, rendu public inchangé.

## UI (`@aphrody/shenron-ui/dbxv2`, `dbxv2.css`)

Composants génériques recevant des URL (aucune dépendance au paquet privé, UI publique) :
`Dbxv2Image` (échelle entière en pixels physiques, `image-rendering: pixelated`, `devicePixelRatio`,
`forced-colors`, `prefers-reduced-motion`, états `status`/`alert` avec réessai), `Dbxv2Audio`,
`Dbxv2Video`, `Dbxv2ModelViewer` (GLB signé ; moteur wgpu injecté via `useGpuLoop`, sinon résumé lu
dans le chunk JSON du GLB), `Dbxv2UiProvider` (libellés, contexte React sans module `bun`).

## Gardes et tests

- `apps/site/tests/dbxv2-public-absence.test.ts` : aucune mention hors `app/admin/dbxv2` et
  `lib/dbxv2*.ts`, dictionnaires publics propres, pas de dépendance ni d'import statique, gardes
  présentes ; si `.next` existe, `findDbxv2Leaks` et absence de variables/URL privées dans les
  chunks statiques.
- `apps/site/tests/dbxv2.test.ts` : porte, service (module factice), URL sans jeton, carte
  d'immersion, parité i18n.
- `packages/ui/test/dbxv2.test.ts`, `packages/ui/test/dom/dbxv2.test.tsx`.

## Limites

Pas de moteur GLB wgpu dans `shenron-engine` : sans fabrique injectée, le modèle est résumé.
Contrôlé le 2026-10-18 dans Chrome réel contre le serveur privé de la fabrique (tunnel SSH). Le flux
USM natif est du MPEG-2 (`video/mpeg`), non lisible par Chrome : les aperçus vidéo passent désormais par
`/mp4/` (transcodage H.264+AAC à la demande, voir `docs/operations/dbxv2-serve.md`) ; l'alerte avec réessai
reste affichée si le transcodage échoue. Non revalidé dans Chrome depuis ce changement.
