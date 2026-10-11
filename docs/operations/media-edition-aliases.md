<!-- SPDX-License-Identifier: Apache-2.0 -->
# Alias d’éditions média

Le lot du 2026-10-11 conserve les éditions historiques masquées 5–8 et ajoute uniquement les relations 5→1, 6→2, 7→3, 8→4. Le SQL refuse un snapshot différent de huit éditions, une paire dont le payload diffère hors ID/visibilité et tout volume déjà attaché à une copie masquée. Aucun original, volume, FK, URL ou historique n’est supprimé ou renuméroté. Ce lot ne fusionne aucune autre table.

## Contrat consommateur

Le writer canonique résout l’editionId d’un nouveau volume ou d’un changement de rattachement avant la déduplication. Le trigger PostgreSQL effectue la même résolution pour les anciens consommateurs. L’identité retournée/revisée correspond donc au rattachement effectivement enregistré.

Les copies restent consultables dans l’admin avec leur ID demandé, leur payload historique et leur visibilité, accompagnés de canonicalId. Une mutation directe d’une copie retourne le conflit canonique avec l’ID cible. Le trigger refuse aussi leur modification/suppression par un ancien writer. Les réparations de métadonnées d’une édition canonique restent possibles ; elles ne réécrivent pas le payload historique.

La déduplication du writer exclut seulement les quatre aliases déclarés ; elle continue à traiter les autres notices masquées. L’index visible reprend workId, edition, language, le label normalisé, pageColor et l’ISBN normalisé, avec NULLS NOT DISTINCT. Il conserve les formats de couleur/libellé distincts. La vérification globale des ISBN-10/13 équivalents reste celle du writer sérialisé. Le nouvel index complète les contraintes existantes sans les supprimer.

## Application Infra

Artefact : [20261011_media_edition_aliases.sql](../../deploy/sql/20261011_media_edition_aliases.sql). Le fichier ne contient pas BEGIN/COMMIT : le runner possède la transaction. Il configure lock_timeout 3 s / statement_timeout 15 s, verrouille éditions/volumes et vérifie les empreintes originales avant commit.

Appliquer une seule fois par l’owner Infra, avant de déployer le consommateur qui interroge media_edition_aliases. Ne rejouer aucune migration historique et ne lancer ni db:push ni drizzle migrate sur le schéma bot.

Le contrat propriétaire est crates/infra/sql/src/migrate.rs dans Aphrody : checksum SHA256 des octetsLF, table version/name/sha256/applied_at, verrou advisory dérivé du nom qualifié du ledger, transaction par fichier. Pour cette allocation, ledger dédié au schéma bot.aphrody_migrations, version 20261011, nom media_edition_aliases. Un hash enregistré différent doit arrêter l’exécution. Un hash identique implique vérification de la présence des objets ; il ne justifie pas un faux succès si le schéma a été retiré.

L’aide installée aphrody sql a été essayée et reste indisponible via A2A local 8788. La qualification isolée exécute psql via Infra et reproduit les deux transactions bootstrap/application et le verrou du contrat propriétaire ; elle ne prétend pas qualifier le binaire Rust du runner. Le chemin de production doit conserver checksum, sérialisation, ledger et sauvegarde restaurable.

## Qualification et retour arrière

Replay qualifié sur un PostgreSQL 18.6 officiel isolé, sans réseau, ports publiés ni volume partagé, avec un snapshotRO public exact de huit éditions et 84 volumes. Contrôles : empreintes et IDs conservés, quatre relations, refus de mutation des aliases, distinction label/couleur, doublon ISBN NULL refusé, rattachement de volumes canonisé, collision sur volume canonique refusée, replay identique et checksum divergent.

[Rollback explicite](../../deploy/sql/20261011-media-edition-aliases.rollback.sql) : déployer d’abord un consommateur qui n’interroge pas la table aliases, puis retirer uniquement les nouveaux objets dans une transaction bornée. Les nouveaux rattachements canoniques restent valides ; aucun original n’est à restaurer. Conserver le ledger historique d’application et utiliser une nouvelle version pour une réintroduction. Ne pas supprimer une ligne d’audit pour rendre le même fichier réexécutable.

La qualification isolée ne remplace pas le backup/restauration et la relecture live avant application en production. État, checksums et preuves du déploiement vivent dans var/reports/catalog-expansion.
