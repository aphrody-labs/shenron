# Réserve inférieure mobile dans Obscura

La navigation basse et les contrôles flottants partagent
`packages/ui/src/barre-nav.css`. Sa réserve additionne 80 pixels et
`env(safe-area-inset-bottom)`. Sur un viewport Obscura rectangulaire sans encoche,
cette variable doit valoir zéro, sans invalider le calcul complet.

Le test `scripts/testing/integration/test/mobile-safe-area.live.test.ts` charge
cette feuille réelle dans une page synthétique, à 390 × 844 pixels. Il vérifie :

- un padding inférieur de 80 pixels ;
- une navigation de 80 pixels, à la position verticale 764 ;
- une invitation Discord de 44 pixels, à la position verticale 652 ;
- aucune superposition de l'invitation avec l'en-tête ou la navigation.

Le pilote utilise `@aphrody/agent-browser/engine` et `@aphrody/web-test`, avec
Obscura uniquement. Le pipeline d'intégration exécute cette étape avant le
transport WebSocket et le serveur de développement Next derrière Bun.

```sh
SHENRON_WEB_LIVE=1 APHRODY_WEB_BIN=/chemin/vers/aphrody-web \
  bun test scripts/testing/integration/test/mobile-safe-area.live.test.ts --timeout 60000
```

Sans `SHENRON_WEB_LIVE=1`, le test est explicitement ignoré. Le moteur choisi doit
résoudre les variables CSS de réserve d'écran ; le binaire précédemment qualifié
depuis Aphrody `ce81d2829` échoue sur le padding, mesuré à zéro.

Le correctif natif est intégré dans Aphrody `a00f2dac5`. Le 7 octobre 2026,
la fixture et les sept étapes croisées ont passé avec un binaire Linux construit
depuis le snapshot isolé `d04c28fb041e`, sur la base `008d7768`. Son fichier
`obscura-render/src/style.rs` est identique au correctif intégré. Le parcours
mobile Next hydraté derrière Bun a aussi passé treize assertions : la pastille
est mesurée à `y=652`, le padding à 80 pixels, sans exception JavaScript ni
débordement horizontal. Ce binaire de qualification n'a pas remplacé le runtime
installé ; il ne qualifie pas tous les changements ultérieurs de `main`.

Cette fixture vérifie la feuille partagée et son calcul natif. Elle ne remplace
pas le parcours du produit hydraté, une capture de toute la page, ni la validation
sur un appareil physique avec encoche. Les profils et cookies de production ne
sont pas utilisés.
