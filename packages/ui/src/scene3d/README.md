<!-- SPDX-License-Identifier: Apache-2.0 -->

# Adaptateur de scène 3D

Contrat source pour les décors glTF vérifiés du portail. Aucun modèle de personnage
n’est créé ou attribué par cet adaptateur. Les modèles Kenney CC0 inspectés par le
pipeline média constituent une entrée possible, après établissement d’un descripteur
avec URL, SHA-256, taille, provenance, mètres et axe Y vertical.

`loadSceneGlb` accepte uniquement un GLB autonome, sur une origine explicitement
autorisée. La taille et le SHA sont vérifiés avant le parseur. Les ressources
secondaires et les téléchargements implicites de décodeurs sont interdits.
Cette première frontière qualifie les extensions unlit, texture-transform et
mesh-quantization. Les lumières embarquées et autres extensions restent hors du
contrat des décors qualifiés ; elles sont refusées. Les budgets de géométrie et de
textures sont contrôlés après décodage : ils ne garantissent pas une limite mémoire
du décodeur d’images. Un résultat arrivé après annulation est libéré.
Les entrées publiques `three` et `three/webgpu` partagent `three.core.js` dans
la distribution installée. Un import Bun sans GPU a confirmé l’identité des
constructeurs `AmbientLight`, `Mesh`, `Material` et `Camera`, ainsi que la présence
des exports de rendu et du chargeur GLTF. Aucun import `three/src` n’est utilisé.

`createStrictWebGpuRenderer` construit directement `Renderer`, `WebGPUBackend` et
`StandardNodeLibrary` depuis `three/webgpu`, avec un périphérique possédé et
`getFallback: null`. Il n’instancie pas `WebGPURenderer`, qui active le repli
automatique. Il accepte un canvas DOM ou OffscreenCanvas, mais exige un contexte
disposant de requestAnimationFrame. Le constructeur ne démarre aucune boucle
applicative. L’hôte appelle `render`, `setHidden`, `setPaused` et `resize` ; il reste
propriétaire de la navigation DOM, des préférences de mouvement et de sa caméra.
Pour un mouvement réduit, arrêter les mises à jour animées et rendre seulement les
changements d’état utiles. L’adaptateur ne change pas la pose de l’utilisateur.

Three r187 démarre un RAF d’entretien dans `render` et ne l’arrête pas avec
`setAnimationLoop(null)`. Une frontière interne isolée et bornée à REVISION187
appelle `_animation.stop()` après chaque image et lors d’une pause. Toute mise à
jour de Three doit relire ce contrat avant de changer cette révision.

L’hôte détruit séparément le renderer (`await destroy()`) et chaque GLB (`dispose()`),
sans détruire une scène, une caméra ou des contrôles appartenant à un autre appelant.
Après perte de périphérique, l’hôte conserve son interface HTML/SVG accessible.
Une annulation pendant l’initialisation ferme d’abord l’entrée des nouveaux rendus,
puis attend cette initialisation avant de libérer les managers et le périphérique.
`destroy` renvoie la même promesse à chaque appel et rejette une erreur de nettoyage ;
`onCleanupError` la signale aussi pour les fermetures déclenchées par un événement.
Le propriétaire natif Rust demeure `crates/shenron-gpu` : aucun second backend wgpu
n’est introduit.

## Décor du portail

`PORTAL_DIORAMA_ASSETS` décrit trois fichiers Kenney Nature Kit 2.1 CC0 servis sous
`/wiki-diorama/kenney-nature/` : arbre, rocher et bloc de falaise, 19 756 octets et
206 triangles au total. SHA, taille, provenance et bornes après transformation des
nœuds sont épinglés. Les fichiers livrés restent identiques aux sources ; la licence
et un reçu public précisent qu’il s’agit d’un décor sans attribution canonique.

`preparePortalDiorama` décode les trois modèles sans GPU, vérifie leurs bornes et
normalise leur décalage de sol de −0,05 m dans la composition uniquement. Il remplace
explicitement leurs matériaux par des matériaux unlit pilotés par les quatre rôles
de palette fournis par l’hôte : `foliage`, `trunk`, `grass`, `earth`. Fournir des couleurs
CSS résolues, pas des références `var(...)`. La caméra orthographique conserve le
décor entier pour chaque rapport largeur/hauteur ; aucune lumière supplémentaire
n’est nécessaire.

`projectDioramaRect(camera2d, worldRect)` reprend directement le `scale`, `x` et `y`
de la caméra du portail. L’hôte fournit le rectangle d’ancrage en coordonnées monde,
puis applique `left`, `top`, `width`, `height` au support CSS du décor. Aucun second
jeu de dimensions monde, point de navigation ou classement éditorial n’est créé.

`createPortalDiorama` combine cette préparation et l’adaptateur strict existant si
l’hôte choisit de l’activer. Aucun GPU, canvas ou moteur n’est monté automatiquement.
Le support reste derrière les callouts DOM et le repli SVG reste possédé par le
portail. La fermeture, la perte du périphérique et l’annulation libèrent aussi les
modèles ; l’hôte conserve ses événements de visibilité et ses préférences de mouvement.

Preuve actuelle : sources Three et types 0.187.0 inspectées ; trois vrais GLB décodés
avec le chargeur livré, bornes et matériaux contrôlés, six projections comparées à la
caméra réelle du portail aux largeurs 1280/390, nettoyage idempotent et quatre refus
contrôlés. Le transport de cette qualification lit les vrais fichiers publics par un
`fetch` privé au processus ; aucun serveur, build, rendu ou test GPU n’a été exécuté.

La régression durable vit dans `packages/ui/test/scene3d/diorama.test.ts` et lit ces
mêmes GLB publics. Depuis `packages/ui`, `bun test --isolate test/scene3d` couvre le
décodage, les refus SHA/budgets, la réponse trop volumineuse, l’annulation tardive
et partielle, les événements de libération, les couleurs et les projections 1280/390.
Les caméras de référence sont des mesures fixes du portail ; le paquet UI n’importe
aucun code d’application. Ce contrôle CPU ne qualifie pas un rendu GPU.
