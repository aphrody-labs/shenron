<!-- SPDX-License-Identifier: Apache-2.0 -->
# Livraison des lecteurs manga et databooks

## Diagnostic du 13 octobre 2026

Les catalogues publics répondent avec 329 tomes manga et 428 notices dans l'API
databooks, interviews comprises. L'audit de l'historique ne démontre aucune perte
globale de données : éditions, couleur/N&B, reprise, zoom, double page et textes
progressifs restent dans leurs propriétaires. Aucun import éditorial n'est déclenché.

Les ressources absentes du cache Cloudflare répondent HTTP429 avec `error code:1027`.
Les bannières et couvertures échouent ; le JavaScript du catalogue databooks échoue
aussi, entraînant une erreur critique après réception du HTML. Un HTTP200 sur une
page ne qualifie donc pas son hydratation ni son lecteur.

## Corrections et propriétaires

- La recherche de dialogues utilise `/api/manga/search` et ses liens `href` vers
  les planches réelles. Les requêtes sont annulées à la fermeture du composant.
  Les contrôles s'empilent sur mobile ; leurs chaînes existent en fr/en/ja.
  Les marqueurs de surlignage sont rendus sans injecter de HTML ; un tome complet
  conserve son titre bibliographique dans le lecteur, les liens et les métadonnées.
- Le catalogue charge douze couvertures par collection, puis les suivantes sur
  demande. La recherche conserve tous les résultats et les compteurs restent ceux
  des données. Les cartes ne transmettent que leurs trois premières images ; les
  lecteurs continuent à charger les chapitres complets.
- Le lecteur databook réserve les touches de pagination au lecteur focalisé ou
  ouvert en plein écran. Il préserve les champs et sélecteurs. Changer d'ouvrage
  réinitialise pagination, zoom et cache de transcription.
- Le skeleton du catalogue databooks vit dans son groupe `(index)`. Une fiche
  absente termine la résolution des métadonnées par `notFound()` avant le streaming,
  afin de renvoyer un vrai statut404.
- L'Infra fournit une origine privée des seules images publiques sur le VPS,
  déclarée par `tools/config/host/nginx/private/shenron-cdn-origin.{conf,json}`
  dans Aphrody. Elle n'expose aucun store protégé, refuse les symlinks, les méthodes
  d'écriture et les clients extérieurs au maillage autorisé.
- La passerelle replie les erreurs du Worker sur cette origine, sans cookies ni
  autorisation du navigateur. Les chunks CDN utilisent le site actif ; une nouvelle
  release contient aussi ses fichiers publics et ses chunks scellés.

## Vérification et activation

Construire sur le VPS depuis un commit figé dans un worktree isolé. Contrôler
install figé, types, lint, format, tests, OpenAPI, tokens et contrats pipeline.
Pour un test DOM ciblé :

```sh
cd packages/ui
bun test --preload @aphrody/bun-test-dom test/dom/reader.test.tsx
```

Sur DBFR, assembler une release fraîche ; monter son propre `nginx/`, `public/`
et ses chunks. Une passerelle qui monte une ancienne release alors que le site
tourne sur une nouvelle image laisse les erreurs CDN actives. Vérifier les SHA,
le manifeste et `nginx -t` avant l'activation par l'adaptateur Infra propriétaire.

Contrôler ensuite les bannières, couvertures, scans et fichiers JavaScript par
HTTP, puis les pages dans Chrome à 1280 et 390 pixels : chargement des images,
largeur positive, navigation vers une planche, modes databook, absence de
débordement et absence d'erreur d'hydratation. Une API de catalogue répondant200
ne remplace pas ces contrôles.
