# Produit streaming : état, matrice de parité et branchement

Date : 2026-11-02. Demande : « replica build » du produit streaming de dragonballfr.com à partir des
reconnaissances existantes. Aucun contenu, code, texte ni visuel d'un service tiers n'est repris ;
aucune chaîne visible ni fonction publique ne cite un fournisseur.

## 1. Sources de reconnaissance réellement disponibles

Il n'existe pas de reconnaissance autonome d'un service de streaming nommé dans `replica/`. Matière lue :

- `replica/recon.md` et `replica/features.csv` (sites officiels Dragon Ball et lecteur ; une ligne de
  scène vidéo pleine largeur issue d'une capture propriétaire du 2026-10-18) ;
- `replica/voir-anime.to/{recon.md,features.csv,endpoints.csv,stack.md}` : catalogue de streaming
  d'animés (parcours catalogue, fiche, choix d'épisode, filtres VF/VOSTFR ; reprise et favoris
  « inconnus » côté tiers) ; les lignes « skip » (catalogue, médias, marque du tiers) sont exclues ;
- `replica/monetization/**` (hors périmètre de cette tranche) ;
- `docs/reference/root/{PLAN,REPRISE}.md`, `docs/operations/crunchyroll-{backend,import}.md` et les
  revendications `.coord/claims/{crunchyroll-*,streaming-*}.json` (livraisons historiques : import
  du catalogue, offres officielles, progression locale `streaming-playback-progress-20261025`).

Constat de départ : la progression de lecture et les favoris existent sur l'appareil ; mais
`/api/watchlist` servait une liste fixe codée en dur (progression 35 % identique pour tout visiteur,
fournisseur nommé) et `WatchlistClient` affichait une liste par défaut fictive. C'est du faux
contenu : la route est remplacée par des données de compte réelles (§3).

## 2. Matrice de parité

Poids : must = 3, should = 2, could = 1. Livré = 1, partiel = 0,5, absent = 0.
« Avant » = état du dépôt au début de la tranche ; « après » = code livré par cette tranche
(non déployé ; branchement d'affichage en attente pour les lignes partielles).

| # | Fonction | P | Avant | Après | Preuve / manque |
|---|---|---|---|---|---|
| 1 | Catalogue épisodes (séries, sagas) | must | livré | livré | `app/wiki/episodes/(index)`, `components/streaming/*` |
| 2 | Catalogue films | must | livré | livré | `app/wiki/movies` |
| 3 | Fiche épisode / film | must | livré | livré | `wiki/episodes/[id]`, `wiki/movies/[slug]` |
| 4 | Lecteur : sources, versions | must | livré | livré | `components/episodes/VideoPlayer`, `VideoLecteurs`, `lib/video-languages` |
| 5 | Précédent / suivant | must | livré | livré | `NavCard` dans `wiki/episodes/[id]/page.tsx` |
| 6 | Reprise de lecture sur l'appareil | must | livré | livré | `lib/playback-progress.ts` |
| 7 | Reprise multi-appareils (compte) | must | absent | partiel | `site_watch_progress`, `/api/v1/account/watch-progress`, `lib/watch-sync.ts` ; tirage côté lecteur à brancher (§5) |
| 8 | « Continuer à regarder » | must | livré (local) | livré | `components/history/ContinueRail` ; version compte : `components/continue-watching/ContinueWatchingRail` |
| 9 | Ajout / retrait watchlist depuis les fiches | must | livré | livré | `StreamingSaveButton`, `lib/favorites.ts` (synchro compte) |
| 10 | Page watchlist sur données réelles | must | absent (liste fixe fictive) | partiel | `GET /api/watchlist` réel ; l'affichage `app/watchlist/**` appartient à l'agent UI |
| 11 | Statuts à voir / en cours / terminé | must | absent | partiel | dérivés dans l'API (`lib/watchlist-view.ts`, `?status=`) ; onglets d'affichage à brancher |
| 12 | Notifications de nouveaux épisodes | should | absent | absent | aucune file d'envoi ni abonnement ; voir §6 |
| 13 | Recherche par titre | must | livré | livré | `StreamingBrowser`, `/api/search` |
| 14 | Filtres (série ; version VF/VOSTFR) | should | partiel | partiel | filtre série et pastilles de version ; pas de filtre de version |
| 15 | Tri des résultats | should | absent | absent | aucun contrôle de tri constaté dans `StreamingBrowser` |
| 16 | Préférence de langue / sous-titres mémorisée | must | absent | partiel | `lib/video-language-preference.ts` (appareil) ; branchement dans le lecteur à faire (§5) |
| 17 | Pistes de sous-titres | should | livré | livré | `use-video-text-tracks.ts` |
| 18 | Profils et réglages | should | livré | livré | `app/profile/*`, `app/settings` |
| 19 | Mode sombre | could | livré | livré | thème sombre natif, `EpisodeThemeSwitcher` |
| 20 | PWA (manifeste, worker) | should | livré | livré | `app/manifest.webmanifest`, `app/sw.js`, `PwaProvider` |
| 21 | États hors ligne | should | partiel | partiel | document hors ligne seulement ; pages et médias restent réseau |
| 22 | Offres officielles et sources légales | must | livré | livré | `components/episodes/OffreLegale` |
| 23 | Progression visible sur les cartes | should | partiel | partiel | barre dans les rails ; l'API watchlist fournit `percent` pour les cartes |

Total pondéré : 59 points (14 must = 42, 8 should = 16, 1 could = 1).

| Mesure | Avant | Après (code livré) | Cible après branchements du §5 |
|---|---|---|---|
| Parité pondérée | 40 / 59 = 67,8 % | 46 / 59 = 78,0 % | 52 / 59 = 88,1 % |
| Must seuls | 30 / 42 = 71,4 % | 36 / 42 = 85,7 % | 42 / 42 = 100 % |

Les lignes 7, 10, 11 et 16 ne comptent qu'à moitié « après » : le code et l'API existent, mais
rien d'affiché ne les consomme encore tant que le §5 n'est pas fait.

## 3. Tranche livrée

Progression de lecture de compte, de bout en bout, sans fournisseur nommé :

- Contrat : `packages/api/src/contract/watch.ts` (schémas, `sanitizeWatchEntries`,
  `mergeWatchEntries`, `watchStatus`, `resumable`), endpoints `watchProgress` (GET),
  `watchProgressSave` (POST), `watchProgressRemove` (POST) sous `/api/v1/account/watch-progress`.
  OpenAPI régénérée (`packages/api/openapi/public.json`).
- Hôte : `WatchPort` (`packages/api/src/server/index.ts`), `packages/api/src/host/watch.ts`, câblé
  dans `host/index.ts` ; identité du lecteur par la session Better Auth, jamais par le corps.
  Dernier écrivain gagnant par élément (`updatedAtMs`), horloge client bornée à +60 s, 200 éléments
  par compte.
- Base : table `site_watch_progress` (`packages/db/src/schema.ts`), dépôt
  `packages/db/src/repos/watch-progress.ts`, migration `0047_site_watch_progress.sql`.
- Site : `lib/host-forward.ts`, `app/api/progress` (+ `/remove`), `app/api/watchlist` (favoris
  épisode/film joints à la progression, statut dérivé, `?status=planned|watching|completed`, liste
  vide explicite hors connexion), `lib/watch-sync.ts` (fusion appareil/compte),
  `lib/watchlist-view.ts`, `lib/video-language-preference.ts`,
  `components/continue-watching/ContinueWatchingRail.tsx`. `TrackHistory` pousse la progression au
  compte à l'arrivée sur une fiche et à son départ.
- Dictionnaires : bloc `stream.*` (fr, en, ja) : `stream.continue.{title,forget}`,
  `stream.status.{planned,watching,completed}`, `stream.watchlist.{empty,resumeAt}`.

Le statut de watchlist n'est pas stocké : « à voir » = sauvegardé sans progression, « en cours » =
progression non terminée, « terminé » = lu à 95 % ou plus. Les éléments sauvegardés restent les
favoris (aucune duplication).

## 4. Migration à appliquer (par le runbook Infra, pas par cette tranche)

`0047_site_watch_progress` : crée `public.site_watch_progress` (clé primaire `userId, kind, itemId`,
contrôles `kind in (episode, movie)` et `0 <= seconds <= duration`, index
`(userId, updatedAtMs desc)`). Idempotente (`IF NOT EXISTS`), sans effet sur les tables existantes.
Tant qu'elle n'est pas appliquée, la lecture de la progression de compte échoue côté hôte pour un
lecteur connecté ; le site retombe sur l'état local (`syncWatchProgress` n'interrompt jamais la
lecture) et `/api/watchlist` liste les éléments sauvegardés comme « à voir »
(`progressAvailable: false`).

## 5. Branchement pour l'agent UI / le parent

- `ContinueWatchingRail` : remplace `ContinueRail` (épisodes et films) sur l'accueil du catalogue et
  sur `/watchlist` ; il tire le compte et fusionne (ligne 7). Clés `stream.continue.*`.
- `/watchlist` : consommer `GET /api/watchlist` (`items[].status|percent|seconds|duration|language`),
  supprimer `DEFAULT_WATCHLIST` et le champ `provider`, afficher `stream.watchlist.empty` quand
  `total = 0`, onglets par `stream.status.*` (ligne 11). Le retrait passe par les favoris existants.
- Lecteur : à l'ouverture, présélectionner
  `pickPreferredLanguage(offertes, readVideoLanguagePreference())` et appeler
  `writeVideoLanguagePreference(langue)` au changement de version (ligne 16).
- Cartes du catalogue : utiliser `percent` pour la barre de progression (ligne 23).

## 6. Reste à faire et pourquoi

- Notifications de nouveaux épisodes (ligne 12) : demande une file d'envoi (Web Push ou courriel) et
  des abonnements par série ; il n'existe pas de signal de publication dédié. Prochaine tranche :
  table d'abonnements et dérivation « nouveau depuis la dernière visite » à partir de la date de
  diffusion, sans envoi tant que le canal n'est pas choisi.
- Tri et filtre de version du catalogue (lignes 14-15) : dans `components/streaming`, chemin de
  l'agent UI.
- Synchronisation de la préférence de langue au compte (aujourd'hui appareil seulement).
- Parcours navigateur (`replica-test`) : non exécuté, aucun site local en marche ; plan ci-dessous.

### Plan de test (replica-test)

1. Hors connexion : lire 30 s d'un épisode réel, quitter ; le rail local propose la reprise à 0:30.
2. Connecté sur deux navigateurs : lire sur A ; sur B ouvrir une fiche, le rail propose la même
   position (après application de la migration).
3. Retirer un élément du rail : il disparaît des deux navigateurs après rechargement.
4. Watchlist : sauvegarder un épisode jamais lu (« à voir »), le lire à 40 % (« en cours »), le finir
   (« terminé »).
5. Réseau coupé : la lecture et le rail local fonctionnent, sans message d'erreur.
6. 390 px et 1280 px : pas de débordement du rail, cibles de retrait de 44 px.

Tests automatisés ajoutés : `packages/api/test/watch-progress.test.ts`,
`apps/site/tests/watch-sync.test.ts` (fusion, statut dérivé, route watchlist, préférence de langue).

## 7. Spécifications design

Mesures et rôles des écrans découvrir, fiche série, lecture et liste de suivi : `replica/crunchyroll/design/components.md` (jetons : `tokens.json`, contraste : `contrast.ts`).
Composants manquants du kit, à construire par l agent « replica build » : rail à accrochage, carte série et carte épisode avec progression, bandeau de reprise, bascule liste de suivi partagée, panneau « épisode suivant ».
Échec de contraste existant : `.btn-danger` (blanc sur rouge, 4,32:1), à corriger côté `packages/ui`.
