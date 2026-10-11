# Couleur de pages inconnue

La colonne `bot.media_editions.page_color` utilise l’enum PostgreSQL `bot.page_color`,
initialement limité à `nb`, `color` et `mixed`. Une absence de contrainte `CHECK` ne
permet pas d’insérer une chaîne arbitraire dans cet enum.

L’artefact `deploy/sql/20261012_media_page_color_unknown.sql` ajoute uniquement
`unknown`, sans modifier les éditions, volumes, identifiants ou valeurs existantes.
Le runner Infra enregistre la version `20261012`, le nom `media_page_color_unknown`
et le SHA-256 du fichier LF dans `bot.aphrody_migrations`, sous le verrou du ledger.
Il refuse un checksum différent et ne réexécute pas une migration déjà enregistrée.

La transaction contenant `ALTER TYPE ... ADD VALUE` doit être **commise avant**
toute écriture utilisant `unknown`. Le validateur et l’import éditorial se qualifient
après cette frontière de transaction. Une couleur non vérifiée reste `unknown` ;
elle ne devient pas automatiquement `nb`.

Avant application, conserver dans le backup Infra protégé les labels et l’ordre
de l’enum, les dépendances de type et les empreintes des tables concernées. Vérifier
après commit les quatre labels, le ledger et l’absence de changement des lignes.

Le retour à un ancien consommateur consiste à arrêter les écritures `unknown`.
PostgreSQL ne fournit pas de suppression additive d’une valeur d’enum : aucun
script ne recrée le type ou ne réécrit les données pour simuler un rollback.
La valeur et le ledger restent présents ; une correction ultérieure utilise une
nouvelle migration. Les lignes `unknown` éventuelles doivent être traitées par une
décision éditoriale explicite, sans inventer leur couleur.
