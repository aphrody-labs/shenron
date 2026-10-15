<!-- SPDX-License-Identifier: Apache-2.0 -->

# Audit SOSH et préparation de sources

Le propriétaire du contrôle public SOSH est
[`scripts/ops/audit-sosh-readers.ts`](../../scripts/ops/audit-sosh-readers.ts).
L'ancien point d'entrée
[`prepare-soshuhen-kanzenshuu-ingest.ts`](../../scripts/ops/prepare-soshuhen-kanzenshuu-ingest.ts)
lui délègue désormais l'exécution. Il ne contient plus de catalogue préparatoire,
de dates, de plages de chapitres ni d'estimations de couleur.

```sh
bun scripts/ops/audit-sosh-readers.ts --origin https://dragonballfr.com --out var/reports/sosh-readers/report.json

# Ancienne commande compatible, même audit et même code de sortie.
bun scripts/ops/prepare-soshuhen-kanzenshuu-ingest.ts --dry-run --origin https://dragonballfr.com --out var/reports/sosh-readers/report.json
```

La commande ne nécessite pas `DATABASE_URL`. `--apply` est refusé avant de lancer
l'audit ou d'effectuer un accès réseau. `--help` affiche l'usage sans collecte.
Les autres arguments sont transmis au propriétaire ; `--dry-run` est seulement
retiré pour compatibilité.

L'audit lit le catalogue public, les détails de volumes et chapitres, puis vérifie
les images listées par requêtes HEAD. Il écrit un rapport privé dans `var/reports/`
et renvoie un code non nul si les contrôles de disponibilité sont incomplets.
Le rapport conserve explicitement `complete: false` : les contrôles API/HEAD ne
prouvent ni le décodage des images, ni le rendu du lecteur, ni la pagination
intégrale d'une édition, ni un dépôt OCR ou RAG. Le périmètre et l'univers attendu
restent définis dans le propriétaire de l'audit ; cet alias ne les étend pas.

## Dépôt de médias acquis

Cet audit ne prépare pas de données à écrire. Les dates, ISBN, attributions et
correspondances de pages doivent venir de sources primaires identifiées. Chaque
lot de médias doit conserver son identité d'édition, son ordre, ses empreintes,
sa provenance et la preuve de couverture attendue. Une notice bibliographique,
une image de couverture ou une URL observée ne constitue pas un tome acquis.

Le writer existant
[`import-sosh-readers.ts`](../../scripts/ops/import-sosh-readers.ts) et son
[contrat de manifeste](../../packages/pipeline/src/dragon-ball/sosh-reader-manifest.ts)
possèdent le dépôt des lecteurs SOSH. Leur usage, les sauvegardes et les
préconditions d'application restent sous leurs propriétaires. L'alias d'audit
n'ajoute aucun writer et n'active ni ingestion, ni OCR, ni indexation RAG.

## Sources Kanzenshuu

Le nom historique de l'alias ne signifie pas qu'il collecte ou vérifie Kanzenshuu.
Aucun nombre de dossiers, compte d'entretiens ou attribution d'animateur n'est
déduit de cette commande. Une recherche ultérieure doit fournir les documents
réellement consultés, leurs auteurs et références primaires, puis passer par la
chaîne éditoriale existante avec ses droits et contrôles de provenance. Ce guide
ne déclare aucune ingestion Kanzenshuu exécutée ou complète.
