<!-- SPDX-License-Identifier: Apache-2.0 -->

# Vérification des types avec Bun

Les scripts `typecheck` des treize paquets migrés appellent
`bun check --noEmit --project tsconfig.json`. Cette commande
vérifie les types sans produire de JavaScript ni de déclarations. Les fichiers
`tsconfig.json`, leurs inclusions, exclusions et options restent la source de
configuration. TypeScript 7.0.2 demeure épinglé dans le catalogue ; cette
migration ne remplace aucun outil d'émission de déclarations ni SDK compilateur.

Le bot et le pipeline exécutent aussi leur `tsconfig.scripts.json`, après leur
configuration principale. Ne supprimer aucun de ces deux contrôles : leurs
scripts ne sont pas tous inclus dans le projet principal.

La commande racine `bun run typecheck` conserve l'orchestration des paquets,
puis le contrôle de `scripts/`. Le site conserve ses deux configurations
principale et tests ; ses scripts et celui d'authentification restent sous leur
revendication de travail existante. Le contrôle racine des scripts conserve
aussi sa commande actuelle. Ces chemins ne sont pas migrés par ce lot.
Le périmètre couvre quinze des dix-neuf configurations : treize projets
principaux et les deux projets secondaires.

La qualification exige un Bun du fork dont le dispatch natif est vérifié dans
un paquet qui possède déjà un script nommé `check`. Une réussite depuis un autre
dossier ne suffit pas à prouver que `bun run typecheck` atteint le contrôleur
natif. Exécuter ensuite les configurations principales et secondaires, ainsi
que les contrôles de lint, format, OpenAPI et les tests concernés. Aucune
qualification de production ni activation distante ne découle de cette
modification de scripts.
