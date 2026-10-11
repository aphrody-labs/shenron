<!-- SPDX-License-Identifier: Apache-2.0 -->
# Publication des bibliothèques Shenron

Les douze bibliothèques npm utilisent `@aphrody/shenron-{api,auth,config,db,engine,images,koharu,lexicon,media,native,pipeline,ui}`. La racine et les applications restent privées. Les noms des crates Rust sont globaux sur crates.io ; le scope npm ne les renomme pas. Un propriétaire GitHub d'organisation exige une équipe existante et les droits correspondants.

Les manifestes npm déclarent une visibilité publique explicite, leur licence et une liste de fichiers autorisés. Les archives contiennent les sources et les exports nécessaires ; elles excluent les scripts opérationnels, bases, corpus, modèles et identifiants. Les dépendances `workspace:` et `catalog:` sont résolues par `bun pm pack`. Les notices et licences des sources conservées restent applicables.

Depuis un checkout qualifié avec le runtime Aphrody et un lock installé sans dérive :

```powershell
bun scripts/release/publication.ts --out=var/reports/package-publication
bun scripts/release/publication.ts --out=var/reports/package-publication-live --publish
```

`--packages=engine,config` limite le lot sans publier implicitement ses dépendances. L'audit contrôle les chemins protégés, les motifs de credentials, les protocoles non résolus et les exports absents. Il ne restitue jamais les valeurs repérées. Avant toute publication, chaque dépendance d'exécution doit posséder une version compatible sur le registre ; les bibliothèques sont traitées dans l'ordre de leurs dépendances.

La publication utilise l'authentification protégée déjà configurée pour Bun. Aucun token n'est passé en argument. Une version existante est conservée. Un upload accepté produit un reçu privé avant la relecture du registre ; la propagation peut nécessiter jusqu'à douze attentes de dix secondes. La publication est confirmée seulement après lecture de l'identité exacte et comparaison du SHA-1 de l'archive. Une relecture échouée exige un diagnostic en lecture avant toute nouvelle tentative d'upload.

Les rapports et archives sont privés sous `var/reports/`. Les gates de source, l'audit des archives et la disponibilité du registre sont des preuves distinctes. Une archive auditable n'établit pas l'installabilité si un paquet requis n'est pas publié.

Pour Rust, exécuter les tests, Clippy strict, l'inventaire du package et `cargo publish --dry-run` avec vérification sur la fabrique, via le wrapper Cargo sérialisé et le verrou global. Les dépendances Git doivent avoir des versions publiées compatibles pour la vérification d'une archive autonome. `publish = false` et les sources incorporées hors du dossier de la crate nécessitent une préparation de leur propriétaire ; ils ne se corrigent pas en retirant seulement le marqueur. Aucun build Cargo lourd n'est exécuté sur DBFR.
