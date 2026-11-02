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
(non déployé). La colonne « Après » intègre les branchements d'affichage de la seconde tranche (§5).

| # | Fonction | P | Avant | Après | Preuve / manque |
|---|---|---|---|---|---|
| 1 | Catalogue épisodes (séries, sagas) | must | livré | livré | `app/wiki/episodes/(index)`, `components/streaming/*` |
| 2 | Catalogue films | must | livré | livré | `app/wiki/movies` |
| 3 | Fiche épisode / film | must | livré | livré | `wiki/episodes/[id]`, `wiki/movies/[slug]` |
| 4 | Lecteur : sources, versions | must | livré | livré | `components/episodes/VideoPlayer`, `VideoLecteurs`, `lib/video-languages` |
| 5 | Précédent / suivant | must | livré | livré | `NavCard` dans `wiki/episodes/[id]/page.tsx` |
| 6 | Reprise de lecture sur l'appareil | must | livré | livré | `lib/playback-progress.ts` |
| 7 | Reprise multi-appareils (compte) | must | absent | livré | `site_watch_progress`, `/api/v1/account/watch-progress`, `lib/watch-sync.ts` ; le rail monté sur `/watchlist` et `/wiki/episodes` tire et fusionne le compte (recette navigateur à faire) |
| 8 | « Continuer à regarder » | must | livré (local) | livré | `ContinueWatchingRail` (compte + appareil) monté sur `/watchlist` et `/wiki/episodes` ; `ContinueRail` reste sur films, manga, databooks, profil |
| 9 | Ajout / retrait watchlist depuis les fiches | must | livré | livré | `StreamingSaveButton`, `lib/favorites.ts` (synchro compte) |
| 10 | Page watchlist sur données réelles | must | absent (liste fixe fictive) | livré | `app/watchlist/WatchlistClient` : `GET /api/watchlist` pour un compte connecté, repli appareil sinon ; `lib/watchlist-rows.ts` |
| 11 | Statuts à voir / en cours / terminé | must | absent | livré | onglets `?status=planned`, `watching`, `completed`, badge de statut sur chaque carte (`stream.status.*`) |
| 12 | Notifications de nouveaux épisodes | should | absent | absent | aucune file d'envoi ni abonnement ; voir §6 |
| 13 | Recherche par titre | must | livré | livré | `StreamingBrowser`, `/api/search` |
| 14 | Filtres (série ; version VF/VOSTFR) | should | partiel | livré | `StreamingBrowser` : filtre de série et de version (`mediaLang` côté API), `?lang=` dans l'URL |
| 15 | Tri des résultats | should | absent | livré | `StreamingBrowser` : ordre du catalogue, plus récents, titre ; `sort` côté API (`/api/episodes?sort=recent` ou `title`) |
| 16 | Préférence de langue / sous-titres mémorisée | must | absent | livré | `VideoLecteurs` présélectionne la dernière version choisie si l'offre existe (appareil ; synchro compte et sous-titres hors tranche) |
| 17 | Pistes de sous-titres | should | livré | livré | `use-video-text-tracks.ts` |
| 18 | Profils et réglages | should | livré | livré | `app/profile/*`, `app/settings` |
| 19 | Mode sombre | could | livré | livré | thème sombre natif, `EpisodeThemeSwitcher` |
| 20 | PWA (manifeste, worker) | should | livré | livré | `app/manifest.webmanifest`, `app/sw.js`, `PwaProvider` |
| 21 | États hors ligne | should | partiel | partiel | document hors ligne seulement ; pages et médias restent réseau |
| 22 | Offres officielles et sources légales | must | livré | livré | `components/episodes/OffreLegale` |
| 23 | Progression visible sur les cartes | should | partiel | partiel | barre et pourcentage sur les cartes de la watchlist (compte) ; pas encore sur les cartes du catalogue |

Total pondéré : 59 points (14 must = 42, 8 should = 16, 1 could = 1).

| Mesure | Avant | Après tranche backend | Après branchements (code, non déployé) |
|---|---|---|---|
| Parité pondérée | 40 / 59 = 67,8 % | 46 / 59 = 78,0 % | 55 / 59 = 93,2 % (cible 88,1 % dépassée) |
| Must seuls | 30 / 42 = 71,4 % | 36 / 42 = 85,7 % | 42 / 42 = 100 % |

Écart restant (4 points) : notifications (ligne 12, 2 points), états hors ligne (21, 1 point), progression
sur les cartes du catalogue (23, 1 point). Les lignes 7, 10, 11, 14, 15 et 16 sont comptées « livré » sur
le code et des tests unitaires / rendu serveur ; la recette navigateur après déploiement reste à faire (plan §6).

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

## 5. Branchements réalisés (seconde tranche)

- `/watchlist` : `WatchlistClient` lit `GET /api/watchlist` quand le lecteur est connecté (squelette tant que
  la réponse n'est pas là), sinon favoris et progression de l'appareil ; si le compte est injoignable,
  repli sur l'appareil avec un message explicite (`watchlistPage.statusUnavailable`). Onglets Tous / À reprendre
  / À voir / Vus branchés sur `?status=planned|watching|completed` (URL mise à jour sans rechargement), tri
  ajout récent / titre, état vide et état « aucun résultat pour ce filtre » conservés. Plus aucune liste codée
  en dur. Le retrait passe par les favoris (resynchronisés avant, jamais d'ajout par erreur) et masque la carte
  immédiatement.
- `ContinueWatchingRail` : monté en tête de `/watchlist` et au-dessus du navigateur de `/wiki/episodes`
  (`kinds={["episode"]}`, remplace `ContinueRail` à cet endroit). Rien n'est affiché sans progression réelle.
  Accueil : volontairement non monté. `HomeScreenDeck` traite chaque enfant comme un écran navigable ; un rail
  qui se vide côté client laisserait un écran et une pastille vides, et les fichiers `HomeHero*` sont hors
  périmètre. À reprendre avec un emplacement prévu par le propriétaire de l'accueil.
- Préférence de langue : `VideoLecteurs` (fiches épisode et film) applique `preferredSelection` après hydratation
  (le HTML serveur garde le défaut, donc aucun écart de cache) et mémorise le choix via
  `writeVideoLanguagePreference`.
- Catalogue : `StreamingBrowser` gagne un filtre de version et un tri (champs `<select>` natifs étiquetés,
  focalisables au clavier, URL `?lang=&sort=`), requêtes annulables, états chargement / erreur / vide existants.
  `dbUniverse.episodes` accepte `sort` (`catalogue` par défaut, `recent`, `title`), exposé par `/api/episodes?sort=`.
- Dictionnaires : `watchlistPage.statusUnavailable` et, dans `messages/streaming/*`, `languageLabel`,
  `allLanguages`, `sortLabel`, `sortCatalogue`, `sortRecent`, `sortTitle` (fr, en, ja).

## 6. Reste à faire et pourquoi

- Notifications de nouveaux épisodes (ligne 12) : non livrées. Ni file d'envoi ni abonnement tant que le canal
  (Web Push, courriel, Discord) n'est pas décidé. L'indicateur « nouveau » sur les cartes n'a pas non plus été
  posé : un favori ne porte pas la date de diffusion et la dernière visite n'est pas stockée. Suite propre :
  joindre `bot_episodes.air_date` dans `buildWatchlist` (côté `/api/watchlist`), mémoriser `lastVisitAt` dans
  `localStorage`, afficher un repère `stream.watchlist.new` quand la diffusion est postérieure à la dernière
  visite ; puis table d'abonnements une fois le canal choisi.
- Progression sur les cartes du catalogue (ligne 23) : `percent` est disponible pour les cartes de la watchlist ;
  le catalogue demanderait de lire la progression locale dans `CatalogueCard`.
- Synchronisation de la préférence de langue au compte (aujourd'hui appareil seulement) et mémorisation des
  sous-titres.
- Parcours navigateur (`replica-test`) : non exécuté, aucun site local en marche ; plan ci-dessous.

### Plan de test (replica-test)

1. Hors connexion : lire 30 s d'un épisode réel, quitter ; le rail local propose la reprise à 0:30.
2. Connecté sur deux navigateurs : lire sur A ; sur B ouvrir une fiche, le rail propose la même
   position (après application de la migration).
3. Retirer un élément du rail : il disparaît des deux navigateurs après rechargement.
4. Watchlist : sauvegarder un épisode jamais lu (« à voir »), le lire à 40 % (« en cours »), le finir
   (« terminé »).
5. Réseau coupé : la lecture et le rail local fonctionnent, sans message d'erreur.
6. 390 px et 1280 px : pas de débordement du rail, des onglets ni de la grille, cibles de 44 px.
7. Watchlist connectée : `/watchlist?status=watching` n'affiche que les titres en cours, l'onglet actif est
   annoncé (`aria-pressed`), retirer un titre le masque tout de suite et il reste absent après rechargement.
8. Watchlist si `/api/watchlist` répond 5xx : message `statusUnavailable` et liste de l'appareil.
9. Fiche épisode : choisir VOSTFR, ouvrir un autre épisode offrant VF et VOSTFR : VOSTFR présélectionné ;
   épisode sans VOSTFR : première version disponible.
10. `/wiki/episodes` : trier « Plus récents » puis « Titre » (ordre vérifié), filtrer VF puis combiner avec une
    série ; un filtre sans résultat affiche l'état vide avec « Effacer les filtres » ; tout au clavier, focus
    visible, reduced-motion sans animation.
11. Visiteur sans progression : aucun rail, aucun bloc vide sur `/watchlist` ni `/wiki/episodes`.

Tests automatisés ajoutés : `packages/api/test/watch-progress.test.ts`,
`apps/site/tests/watch-sync.test.ts` (fusion, statut dérivé, route watchlist, préférence de langue),
`apps/site/tests/watchlist-page.test.tsx` (lignes locale/compte, `?status=`, tri, préférence, rendu serveur de la
watchlist, du rail et des contrôles du catalogue), `apps/site/tests/watchlist-account.dom.test.tsx` (watchlist
connectée : données du compte, filtre d'URL, onglet actif).

## 7. Spécifications design

Mesures et rôles des écrans découvrir, fiche série, lecture et liste de suivi : `replica/crunchyroll/design/components.md` (jetons : `tokens.json`, contraste : `contrast.ts`).
Composants manquants du kit, à construire par l agent « replica build » : rail à accrochage, carte série et carte épisode avec progression, bandeau de reprise, bascule liste de suivi partagée, panneau « épisode suivant ».
Échec de contraste existant : `.btn-danger` (blanc sur rouge, 4,32:1), à corriger côté `packages/ui`.
