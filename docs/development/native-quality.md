<!-- SPDX-License-Identifier: Apache-2.0 -->

# Qualité JavaScript et TypeScript native

Les portes utilisent Bun canary amont non modifié (1.4.4-canary ou supérieur, le runtime
de Bun OS) : `bun check`, `bun lint` et `bun fmt`. Elles ne lancent ni ESLint, ni `tsc`,
ni une distribution OXC externe. Les règles OXC sont exécutées par le propriétaire natif
Bun. Les ajouts de l'ancien fork Aphrody (dont `--no-n2b`, `bun n2b`) n'existent plus ;
les capacités de Bun OS se chargent par le preload `@aphrody/bun-os-plugins`.

```sh
bun check
bun lint -c .oxlintrc.json apps packages scripts
bun run format:check
```

Le `tsconfig.json` racine est une solution sans fichiers propres. Ses références
couvrent les 15 paquets, les configurations supplémentaires du bot, des tests du
site, du pipeline et des scripts racine. Le test du runner compare cette liste
aux portes déclarées dans les paquets. `bun check` suit ces références et ne
génère ni déclarations ni fichiers JavaScript.

Les scripts `bun run typecheck`, `bun run lint` et `bun run format:check`
restent disponibles et utilisent ces mêmes commandes natives. Le runner conserve
le `PATH` existant, ajoute le dossier du runtime et empêche un script homonyme
de masquer une commande native enfant. `SHENRON_BUN_EXECUTABLE` permet de choisir
un exécutable absolu existant pour ces runners, sans changer l'installation globale.
`bun run format:check` contrôle le format ; `bun run fmt` écrit le format.

Les configurations `.oxlintrc.json` et `.oxfmtrc.json`, leurs règles, leurs
exceptions et le périmètre `apps packages scripts` sont conservés. Les paramètres
`[lint]` et `[fmt]` de `bunfig.toml` expriment ce périmètre. Le runtime qualifié ne
les applique pas encore aux commandes sans arguments : utiliser les chemins
explicites ci-dessus ou les runners. `bun lint` et `bun fmt` sans chemins peuvent
parcourir d'autres dossiers ; leur comportement n'est pas une porte équivalente.
Le moteur natif ne lit pas encore les exclusions de la configuration de format :
le runner transmet exactement ses `ignorePatterns` en arguments
`bun fmt --ignore-pattern`. Les fichiers générés restent donc exclus comme auparavant.

La dépendance TypeScript reste pour Next et les outils de l'éditeur ; elle ne
détermine plus les portes de types. Une éventuelle génération de déclarations
est une opération distincte, car `bun check` n'émet aucun fichier. Aucun changement
n'est effectué dans le sous-module `packages/config` ; sa porte de types native
reste incluse dans la solution racine.

Les tests exécutent réellement un projet avec une erreur de types dans sa seconde
référence, une violation de lint et un fichier mal formaté. Ils vérifient l'échec,
la réussite après correction et l'absence d'émission JavaScript ; les scripts
homonymes factices ne peuvent pas rendre les résultats verts.

La CI utilise le runner existant `shenron-factory` pour les pushes, déclenchements
autorisés et pull requests internes. Une pull request provenant d'un fork ne
s'exécute pas sur la fabrique. L'action résout le Bun installé depuis le `PATH`
ou `BUN_INSTALL`, contrôle son SHA256, sa révision `1.4.4+dfde053a3`, la version
exacte de `packageManager` et la provenance du fork. Aucun runtime n'est installé
ou mis à jour sur l'hôte. Au contrôle du 13 octobre 2026, la release GitHub
`bun-v1.4.4` était encore un brouillon sans assets ; cette route utilise donc
l'artefact existant qualifié de la fabrique. Un bootstrap hébergé vers une autre
version échoue explicitement.
