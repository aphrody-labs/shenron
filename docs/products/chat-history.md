# Lecture de l’historique du chat partagé

Le composant `ChatPanel` de `@shenron/ui` utilise le même état de lecture sur le
web et dans Shenron Studio. Pendant le chargement d’une conversation, le
compositeur est désactivé : une réponse tardive ne peut plus remplacer un nouveau
message envoyé pendant cette lecture.

Une lecture qui renvoie `null` ou rejette sa promesse termine le chargement avec
l’erreur localisée existante. La conversation reste sélectionnée ; un nouveau
clic sur celle-ci relance la lecture. Le compositeur reste désactivé jusqu’à une
lecture réussie ou à l’ouverture d’une nouvelle discussion. Un échec ne présente
plus l’historique comme une conversation vide correctement chargée.

Chaque ouverture possède une génération. Une réponse ancienne est ignorée,
même après une navigation A → B → A. Une nouvelle discussion, un remplacement
du transport ou le démontage du composant invalident aussi la lecture précédente.
Le réducteur refuse un résultat de lecture hors de l’état de chargement et un
envoi pendant un chargement ou un échec de lecture.

## Validation du 7 octobre 2026

Les tests DOM utilisent le véritable composant et le préchargement
`@aphrody/bun-test-dom`. Les neuf scénarios passent, dont le blocage pendant la
lecture, les deux formes d’échec (`null` et rejet), la reprise et la navigation
A → B → A avec réponses reçues dans l’ordre inverse. Les trois scénarios de
régression initiaux échouaient avant le correctif.

La suite UI complète passe également : 307 tests, dont 109 tests DOM. Le
typecheck UI, la compilation des entrées de production et le contrôle de
portabilité passent. Aucun import de Next ou d’une application n’est ajouté à
la couche UI partagée.

Le test réel `scripts/testing/integration/test/dev.live.test.ts`, exécuté avec
Aphrody Web/Obscura, reste rouge : la conversation attendue n’apparaît pas dans
le délai de trente secondes et les panneaux restent en vérification. Cette
validation DOM ne qualifie donc ni le frontal de développement inchangé, ni
l’activation en production, ni le rendu manga complet.
