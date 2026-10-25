<!-- SPDX-License-Identifier: Apache-2.0 -->
# Relecture et dépôt des versions de personnages

Les scripts séparent la découverte des sources, leur relecture et le dépôt éditorial.
Ils ne transforment pas une occurrence OCR de nom en récit validé. Les rapports,
scans, snapshots et reçus restent dans `var/reports/`, hors Git.

## Préparer les sources

Depuis la racine du dépôt, inventorier au maximum quatre scans par lot :

```sh
bun scripts/editorial/audit-variant-databook-sources.ts --book-id 4 --pages 77,78,79,80 --fetch-scans --out var/reports/variant-sources
```

Le manifeste conserve l'index du fichier, son URL et son SHA-256. Le numéro imprimé
se renseigne après inspection avec `--reviewed-pages <folios.json>` ; ce fichier
contient des objets `{index, printedPage, sha256, reviewerNote}`. Un folio coupé
ne devient pas un numéro visuellement confirmé par simple décalage arithmétique.

Chaque fait garde sa période, sa forme et sa condition. Une lecture de détecteur,
une évaluation de guide et un multiplicateur ne sont pas interchangeables. Les
champs `ki` et `maxKi` ne se déduisent pas automatiquement des BP.

## Préparer un manifeste de corrections

`apps/site/scripts/apply-reviewed-variant-edits.ts` accepte un objet de version `1`
avec au plus douze `entries`. Chaque entrée contient :

- `id`, `rationale`, la ligne administrative complète `expected` et son
  `expectedSha256`, calculé par `wikiUpdateSnapshotHash` ;
- `patch`, limité au récit, aux techniques, transformations, statistiques,
  visibilité et références éditoriales ; aucune identité ni image ;
- `sources`, avec `kind`, `file`, `sha256`, `url` et `locator`.

Les chemins sources commençant par `var/reports/` sont résolus depuis la racine
du dépôt, quel que soit le dossier de lancement. Un chemin absolu est aussi admis.

Les trois valeurs de `kind` sont `scan`, `primary-document` et `review-record`.
Un compte rendu de relecture conserve sa nature ; son empreinte ne prouve pas
qu'il s'agit des octets d'une planche ou d'une page primaire. Les références du
patch sous `evidence.editorialReferences` nomment précisément les champs relus,
avec `fields`, `url`, `title` et `locator`. Toutes les mesures préexistantes de
`evidence` restent identiques.

Les identifiants de techniques et de transformations sont ceux du catalogue,
déjà rattachés au bon personnage. Une attaque de jeu homonyme ne sert pas de
substitut à la technique du manga. Pour examiner un lien manquant :

```sh
cd apps/site
bun scripts/propose-character-technique-links.ts --manifest ../../var/reports/links-reviewed.json --live --out ../../var/reports/links-proposal.json
```

Ce proposeur effectue uniquement des GET et produit le POST proposé ; il n'a pas
d'option d'application. Les changements de relations restent une opération
distincte, suivie d'une relecture administrative et de l'historique.

## Vérifier puis appliquer

Depuis la racine, le mode par défaut contrôle les schémas et les fichiers sources
sans accès administratif ni écriture distante :

```sh
bun apps/site/scripts/apply-reviewed-variant-edits.ts --manifest var/reports/variants-reviewed.json --receipt var/reports/variants-proposal.json
```

Après relecture du lot, depuis `apps/site`, avec le jeton administratif déjà
configuré dans l'environnement autorisé :

```sh
bun scripts/apply-reviewed-variant-edits.ts --manifest ../../var/reports/variants-reviewed.json --receipt ../../var/reports/variants-apply.json --apply
```

Employer un nouveau chemin de reçu à chaque exécution. Le script contrôle toutes
les préconditions avant la première mutation, puis chaque ligne sous CAS complet.
Le lot n'est pas une transaction unique : une erreur peut laisser des entrées
précédentes appliquées. Le reçu est sauvegardé avant chaque PATCH et après les
relectures ; après un délai réseau, inspecter l'état avant de réessayer. Un nouvel
essai reconnaît uniquement le résultat exact déjà appliqué, sans recalculer une
approbation sur un snapshot divergent.

Les contrôles finaux comparent la ligne administrative complète, les champs du
journal et la visibilité dans `/api/wiki/variants`. Ils ne remplacent pas le
contrôle visuel du sélecteur et du contenu rendu. Un dépôt contenant des références
nécessite la version de l'API qui accepte et conserve cette provenance.

Les illustrations utilisent les writers séparés `assign-character-variant-images.ts`
et `publish-generated-variant-artwork.ts`. Une illustration générée conserve sa
légende, sa référence primaire et les empreintes des deux images ; elle ne devient
jamais une preuve documentaire.
