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

Les tests importent les composants partagés de `@aphrody/shenron-ui`, le client et
l'hôte de `@aphrody/shenron-api`, le VFS et le store de `@aphrody/shenron-db`, les helpers de
`@aphrody/shenron-config` et le serveur frontal réel de `apps/server`. Ils vérifient
notamment une recherche wiki, les compteurs rendus par l'UI, les réponses
invalides et l'absence de repli HTML pour une API désactivée. Ce code de
qualification vit dans `scripts/testing/integration`, hors du graphe de
dépendances produit ; aucune dépendance UI vers le serveur n'est ajoutée.

Une étape indépendante ouvre un WebSocket réel depuis Obscura vers un serveur
Bun temporaire et vérifie l'écho Unicode. Elle refuse donc un transport simulé
qui déclenche `open` sans transmettre de messages.

Une étape DOM dédiée monte la palette réelle du shell avec le préchargement
`@aphrody/bun-test-dom`. Elle vérifie les résultats databooks et romans,
la navigation vers une fiche databook et le changement anglais/japonais.
Les dictionnaires de la palette vivent dans `@aphrody/shenron-ui/public` et couvrent
toutes ses catégories. Cette étape s’exécute aussi avec `--no-browser` et
`--cross-only` ; elle ne remplace pas une qualification visuelle dans Obscura.

Le rendu canonique est `@aphrody/shenron-ui/public/CommandPalette`, sans import Next,
DB ou serveur. L’application fournit la navigation, la résolution des images
et la télémétrie ; `searchUrl` permet de viser une API Bun distincte. Le cycle
de requête borné est aussi dans le paquet UI. Un test DOM du paquet monte cette
vue sans adaptateur Next face à un serveur Bun temporaire : panne `503`,
réessai, 24 familles documentaires et navigation vers un databook. Les réponses
de ce serveur sont synthétiques ; ce test ne qualifie pas la recherche SQL.

La palette annonce le chargement et le nombre de résultats dans un `output`
vivant, hors de la liste marquée `aria-busy`. Le message vide reste visible
même avec les liens vers la recherche complète et l’assistant. Les tests DOM
couvrent `Home`/`Entrée`, `Échap` et le retour du focus au bouton d’ouverture.
Le dialogue utilise Base UI, déjà présent dans le paquet, avec le même cadre
visuel. Références : [ARIA busy](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy)
et [Dialog Base UI](https://base-ui.com/react/components/dialog).
Ces tests ne remplacent pas une vérification avec un lecteur d’écran réel.

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

Une étape distincte [qualifie le thème sur PostgreSQL et Bun.SQL](../operations/bun-site-theme.md)
dans un cluster loopback temporaire. Elle vérifie l'upsert réel, l'auteur et le
type JSONB avant de supprimer le cluster. Le fournisseur PostgreSQL doit être
installé ; une absence est signalée comme échec dans le pipeline dédié.
Le même cluster qualifie les [favoris hébergés par Bun](../operations/bun-favorites.md),
leur séparation par profil et la conservation des autres préférences pendant
des écritures concurrentes. Les sessions de ces fixtures restent synthétiques.

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

Les diagnostics réservent des quotas séparés au réseau (400 événements) et
au runtime JavaScript (100 événements), pour conserver les erreurs tardives
même après le chargement de nombreux chunks. Les erreurs et rejets non gérés
de la page sont aussi enregistrés, avec une limite de 100 entrées.
Les sondes isolées du moteur installé exécutent les scripts classiques et
modules ainsi que le montage et l’hydratation d’un composant React avec effet et
interaction. Ces résultats
ne qualifient pas encore l’hydratation Next ni le produit complet.

Le blocage a été localisé dans le canal de développement : Next 16.3.8 attend
des métadonnées RSC transmises par WebSocket. Le moteur contenait un WebSocket
simulé dont `send()` supprimait les messages. Aphrody `796f309` remplace ce
transport par des connexions réelles, avec la politique réseau et les cookies
du contexte. Les 556 tests natifs et Clippy strict passent sur le VPS.
Le CLI compilé depuis ce correctif a été récupéré avec vérification SHA-256.
Il passe le plafond GLIBC 2.39 et l'écho WebSocket réel via le SDK sur Linux.
Il est sélectionné explicitement par `APHRODY_WEB_BIN`, sans remplacer le CLI
installé. Avec cet artefact, les contrats croisés passent toujours mais le test
Next échoue encore après 30 secondes sur la conversation attendue. Le frontal
Bun doit notamment relayer le WebSocket de Next (`/_next/hmr`), que son relais
HTTP ne transporte pas actuellement. Ce résultat ne qualifie pas Windows,
OAuth ni les services de production.

Une sonde temporaire, hors Git, a redirigé uniquement le WebSocket `/_next/hmr`
vers le port de Next, en conservant la page et les API derrière le frontal Bun.
Avec le CLI corrigé, toutes les assertions du scénario ont passé : ouverture
de la conversation SQLite et de son message, nouvelle discussion, API depuis
la page et verrou `instant()`. Cette sonde identifie le relais HMR manquant ;
elle ne remplace pas la qualification du frontal et n'en modifie pas les
assertions. React signale encore des différences d'attributs SVG `xmlns`
dans le moteur, à corriger séparément.
