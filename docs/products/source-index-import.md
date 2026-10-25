<!-- SPDX-License-Identifier: Apache-2.0 -->

# Import des références Voir Anime

Le catalogue de sources peut recevoir les métadonnées publiques capturées sur
Voir Anime, sans les transformer en données canoniques ni en sources de lecture
qualifiées. Le propriétaire d'écriture est le site :
`POST /api/admin/catalog/sources/import`.

## Contrat

La route réutilise la garde administrative et l'identité d'acteur du CRUD wiki.
Le corps JSON est borné à 1 Mio et 100 références. `apply` vaut `false` par défaut ;
une simulation lit les URL déjà connues et annonce les créations possibles.
L'origine de la requête doit correspondre à celle du site.

Chaque référence contient `url`, `title`, `excerpt`, `contentHash` et `provenance`.
La provenance exige `sourceUrl`, `sitemap`, `observedAt`, `method`, `httpStatus`,
`kind`, `family` et `edition`. Les URL doivent appartenir à `https://voir-anime.to`,
sans identifiant, paramètre ni fragment. Les captures importables sont uniquement
des GET HTTP 200 avec une empreinte SHA-256 ; la route ne collecte pas de contenu
distant. Le type distingue une fiche série d'une sous-page candidate, sans décider
qu'une sous-page est nécessairement un épisode plutôt qu'un film ou un spécial.

L'application insère seulement les URL absentes de `external_source_records` et
de `external_source_provenance`. Elle préserve les références et provenances
existantes, y compris une provenance orpheline. Les deux nouvelles lignes sont
écrites dans la même transaction ; un conflit concurrent de provenance annule
la transaction. Aucune table n'est créée ou migrée par cette route.

La provenance ajoutée conserve l'acteur administratif réel, le parent de la
sous-page et le lien à Toriyama au niveau de la franchise. Un crédit de design
de franchise n'est pas un crédit individuel sur chaque adaptation. L'étiquette
d'édition du site ne prouve pas la langue réellement lue. Ces limites restent
explicites ; `canonical_eligible` vaut toujours `false` pour une nouvelle référence.

## Client et vérification

Le client `scripts/data/import-voiranime-sources.ts` valide un lot et produit son
plan hors ligne par défaut. Il n'effectue alors aucune requête, même si le fichier
d'entrée contient `apply: true`.

```powershell
bun scripts/data/import-voiranime-sources.ts <lot.json>
bun scripts/data/import-voiranime-sources.ts <lot.json> --apply
```

L'application utilise exactement un credential administratif déjà autorisé,
fourni dans `SHENRON_ADMIN_TOKEN` ou `SHENRON_IMPORT_SESSION_COOKIE`. Aucun secret
ne doit être placé dans les arguments, le fichier d'entrée, les reçus ou Git.
Le client demande d'abord une simulation au serveur, puis applique le lot.

Pour chaque URL effectivement créée, il relit le détail via le catalogue public,
sans credential, et compare l'identifiant, la destination du lecteur de source et
le titre. Un HTTP 200 seul ne suffit pas. Le reçu compte les réponses vérifiées
et agrège leurs empreintes SHA-256. Les URL ignorées conservent leur ancien titre ;
elles ne sont pas déclarées nouvellement vérifiées.

Une erreur de relecture après une insertion signifie que l'import reste à
réconcilier ; elle n'autorise ni écrasement ni suppression. Le mode insertion
seule rend une reprise idempotente.

## Recherche par version d'épisode

`/api/episodes?mediaLang=vf|vostfr|vost` et
`/api/catalog?category=episodes&mediaLang=vf|vostfr|vost` appliquent le même prédicat
de visibilité, série, texte et version aux lignes et au total avant pagination.
La recherche couvre titre, titre japonais, titre romanisé et synopsis.
Les valeurs de version explicitement invalides répondent 400 ; l'absence de
filtre conserve la recherche générale. Les tags de lecteurs ne prouvent pas
la disponibilité ou le décodage du média.

## Livraison

Le client ne doit être appliqué qu'après qualification de la route authentifiée
sur l'image activée. Les captures et rapports d'exécution restent dans
`var/reports/`, les secrets dans leur store protégé. Le build et l'activation
suivent le chemin Aphrody Infra du dépôt ; aucun changement de fichier sur un
hôte de production ne remplace cette livraison.
