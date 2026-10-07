# Actions secondaires de l'espace de travail

Sur `/desktop`, l'invitation Discord et le signalement sont rendus dans
l'en-tête de `DesktopHome`, après l'état du serveur. Les composants existants
reçoivent `inline` ; leurs instances flottantes du shell ne sont pas affichées
sur cette route. Les actions et leur fermeture restent disponibles.
La modale de signalement est montée sur `document.body` seulement à son
ouverture : elle reste au-dessus du shell et de la navigation mobile, même
lorsque son bouton appartient à l'en-tête.

La feuille partagée `packages/ui/src/barre-nav.css` remet ces contrôles dans le
flux avec une position relative. Le même DOM et la même règle servent le web,
le bureau et les largeurs mobiles. Le chat et ses champs ne passent plus sous
les deux pastilles. Les autres routes conservent leur disposition actuelle.

Le montage se fait directement dans l'en-tête. Un portail vers un conteneur
encore déshydraté avait provoqué une divergence React dans la qualification
native ; ce montage a été remplacé avant livraison.

Le SDK natif ne retrouvait pas cette modale par son sélecteur de rôle alors que
le DOM et `aria-expanded` confirmaient son ouverture. La qualification utilise
son sélecteur DOM pour vérifier la visibilité et la fermeture ; la limite du
sélecteur de rôle reste à traiter chez son propriétaire.

La qualification utilise le vrai serveur de développement Next derrière Bun
et le moteur Obscura natif. Le parcours vérifie les conversations et l'API,
la largeur de page, l'absence d'erreurs navigateur, l'ouverture et la fermeture
du signalement, puis le placement à 390 et 1440 pixels. Les captures et les
mesures restent dans `var/reports/integration/`. Cela ne qualifie ni les
appareils physiques ni l'ensemble des pages du produit.
