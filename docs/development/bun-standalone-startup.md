# Démarrage borné du rendu standalone

`apps/server/src/next-startup.ts` démarre le rendu Next standalone dans un enfant
Bun sur `127.0.0.1`. Le mode est `production`, et le binaire compilé utilise
`BUN_BE_BUN=1` pour exécuter le `server.js` du payload. `serveSite` emploie ce
lanceur avant de déclarer le frontal prêt.

Le budget de démarrage est de 120 secondes. Chaque lecture de `/robots.txt`
dispose d'une seconde au maximum et partage l'annulation du budget global ainsi
que celle de la sortie du processus enfant. Une réponse inférieure à 500 suffit
pour constater l'écoute du serveur ; son flux est libéré après lecture des
en-têtes.

Cette annulation corrige un blocage : le précédent délai était vérifié entre les
requêtes, mais une requête HTTP sans réponse pouvait rester suspendue au-delà
des 120 secondes. L'interface gardait alors son état de démarrage.

En cas d'échec, le lanceur envoie SIGTERM, laisse trois secondes à l'enfant,
envoie SIGKILL si nécessaire et attend sa terminaison avant de rendre l'erreur.
`serveSite` ferme ensuite son frontal et son backend dans sa branche d'échec.
Les arrêts par signal sont détectés par `signalCode` : dans Bun, `exitCode` peut
rester nul après un arrêt par SIGTERM ou SIGKILL.

La suite `apps/server/test/next-startup.test.ts` utilise de vrais processus Bun
et des serveurs HTTP jetables. Elle couvre le lanceur de production, les
en-têtes disponibles avec un corps inachevé, une requête bloquée, une sortie
prématurée et le refus de SIGTERM.

```sh
cd apps/server
bun test test/next-startup.test.ts
```

Les durées réduites des fixtures sont injectées au lanceur interne. Le démarrage
de production conserve son budget de 120 secondes. Aucune base ni aucun profil
d'authentification de production ne participe à cette suite.
