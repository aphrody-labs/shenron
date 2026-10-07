<!-- SPDX-License-Identifier: Apache-2.0 -->

# Médias de l’accueil partagé

Le fond des scènes appartient à `@shenron/ui/public/SceneBackdrop`. Le site résout
les URL d’assets et fournit son rendu Next Image ; la lecture, les préférences et
les couches visuelles appartiennent à la même UI React utilisable hors Next.
Les couches proviennent du composant d’accueil présent dans `7ff639b` ; les
images, vidéos par section, gradients, grain et bandes restent ceux de
[l’accueil et du shell](accueil-et-shell.md).

Le serveur rend une image fixe. Le navigateur autorise la vidéo au-delà de
640 px lorsque la réduction des mouvements et l’économie de données sont
désactivées. Les changements de ces préférences sont suivis pendant la session.
Un onglet masqué, une scène inactive ou hors écran met la vidéo en pause ; une
promesse de lecture tardive ne peut pas la relancer. La rotation du héros s’arrête
également lorsque l’onglet est masqué ou que les préférences limitent le mouvement.
Une erreur de média ou un refus de lecture automatique affiche l’image de secours.
Changer de clip déclenche la lecture du nouveau média, même si la scène reste active.

## Qualification du 7 octobre 2026

Cinq tests DOM couvrent les préférences en direct, les abonnements libérés,
la visibilité, le changement de source, le rejet de lecture, le rendu serveur et
la résolution tardive de `play()`. Les tests du site vérifient l’adaptation de
l’accueil ; les types du site et du paquet UI ainsi que leur frontière de runtime
sont contrôlés séparément.

Dans Chromium réel, le composant précédent continuait à lire après activation de
la réduction des mouvements. Le composant partagé affiche désormais l’image.
La lecture se met en pause dans un véritable onglet d’arrière-plan, reprend au
retour, revient à l’image sur une vidéo introuvable et démarre une autre source.
Les vues de 390 et 1440 px ont été inspectées. La fixture utilise un clip généré
et un rendu d’image natif ; elle ne qualifie ni les assets éditoriaux de production,
ni Next Image dans un serveur Next, ni une installation Tauri physique.
Les preuves locales restent dans `var/reports/home-media/`, ignoré par Git.

Le site public affichait une page de maintenance lors de la vérification. Le
service du site sur dbfr répondait HTTP 200 en local sur 5011, alors que les
services du site sur le VPS étaient inactifs. La livraison et le routage doivent
être réconciliés par le catalogue et le runbook Infra avant qualification publique.
Cette observation ne constitue pas une preuve de la cause du défaut de routage.
