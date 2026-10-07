# Tests croisés Shenron avec Aphrody Web

La commande `bun run test:integration` exécute les scripts de test des paquets
et applications, chacun dans son propre processus Bun, puis les tests croisés
et le serveur de développement. Les suites conservent leur préchargement DOM,
leurs mocks et leurs exclusions live. Un échec reste un échec dans le code
de sortie global ; les étapes indépendantes suivantes continuent.

```sh
bun run test:integration                 # suites, contrats croisés, navigateur
bun run test:integration --cross-only    # contrats et navigateur
bun run test:integration --no-browser    # suites et contrats
bun test scripts/testing/integration/test/contracts.test.ts
```

Les tests importent les composants partagés de `@shenron/ui`, le client et
l'hôte de `@shenron/api`, le VFS et le store de `@shenron/db`, les helpers de
`@shenron/config` et le serveur frontal réel de `apps/server`. Ils vérifient
notamment une recherche wiki, les compteurs rendus par l'UI, les réponses
invalides et l'absence de repli HTML pour une API désactivée. Ce code de
qualification vit dans `scripts/testing/integration`, hors du graphe de
dépendances produit ; aucune dépendance UI vers le serveur n'est ajoutée.

La qualification navigateur utilise `@aphrody/agent-browser/engine`,
`@aphrody/web-test` et son export `/next`. Elle démarre Obscura avec accès
loopback explicite et un Next/Turbopack réel, sur des ports temporaires.
Le serveur Bun sert l'API avant de relayer l'UI Next. Le test doit retrouver
une conversation synthétique de SQLite dans l'UI, l'ouvrir et afficher son
message ; le seul HTML initial ne suffit pas. Il contrôle aussi l'accès
API depuis la page et la libération du verrou `instant()` de l'adaptateur Next.

Les bases et l'agent home de test sont temporaires. Le processus Next reçoit
un environnement isolé, une URL PostgreSQL inutilisable et des identifiants
synthétiques : les replis de configuration du site sont donc attendus.
Ce test ne qualifie pas PostgreSQL, OAuth, les modèles réels ni les services
de production. Les processus et stores temporaires sont fermés à la fin.

Les journaux, diagnostics réseau/JavaScript et captures restent dans
`var/reports/integration/`, ignoré par Git. Le build Next de qualification est
isolé dans `apps/site/.next-qualification/`. `APHRODY_WEB_BIN` peut sélectionner
un artefact Obscura installé ; le nom multicall `aphrody-web` est conservé
pour éviter une résolution vers une autre commande du binaire Aphrody.

## État observé le 7 octobre 2026

Les trois tests de contrats HTTP croisés réussissent. Next sert réellement
`/desktop` et Obscura en affiche le rendu initial. La qualification renforcée
échoue encore sur l'apparition de la conversation : l'UI reste dans son état
initial de connexion dans le moteur installé. Le test reste actif et rouge
dans `test:integration`, avec les diagnostics conservés ; il n'est pas déclaré
qualifié. Les suites ordinaires ne démarrent pas ce test live : le runner dédié
active `SHENRON_WEB_LIVE=1` dans son processus enfant.
