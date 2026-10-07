<!-- SPDX-License-Identifier: Apache-2.0 -->

# Navigation du shell partagé

Le shell créé par la refonte `6354282` partage une seule barre latérale et une
seule feuille mobile entre le web et la fenêtre de bureau. Son historique
montre que la feuille « Plus » était masquée par CSS à partir de `lg`, sans
fermer l'état modal. Elle ne se fermait sur navigation que lorsque `pathname`
changeait : sélectionner la page courante la laissait donc ouverte.

La qualification navigateur avant correction confirme les deux cas : le
dialogue reste présent, le contenu reste masqué aux technologies d'assistance
et le défilement du document reste bloqué. À 1440 px après une ouverture en
390 px, aucun dialogue n'est visible, mais son état modal demeure.

Le composant `AppShell` suit désormais la même limite de largeur que `lg`
(`64rem`) et ferme la feuille quand la barre latérale devient disponible.
Les liens de la feuille la ferment aussi lors d'un clic de navigation normal,
y compris vers la destination courante ou le retour d'une navigation de
contexte. Les clics modifiés qui ouvrent une autre fenêtre ou un autre onglet
conservent la feuille. L'écouteur de largeur est retiré au démontage.

La qualification du 7 octobre 2026 utilise le vrai composant, les styles
partagés compilés avec Tailwind et une fixture de navigation sans données
produit. Chromium local compare le code commité avant correction et le code
corrigé : clic sur la page courante, passage 390 → 1440 px, clic dans le contenu
après redimensionnement, retour au mobile et fermeture par Échap. Après
correction, le dialogue disparaît, le contenu retrouve ses accès et le document
son défilement. Tab atteint un lien visible au bureau ; Échap rend le focus au
bouton « Plus » sur mobile. Les captures et résultats locaux sont dans
`var/reports/shell-navigation/`, ignorés par Git. Le navigateur MCP a refusé
l'adresse locale de la fixture ; Chromium a couvert cette limite.

Ces vérifications ne qualifient pas l'ensemble des pages produit ni un
appareil mobile ou une fenêtre Tauri physiques. L'audit de toutes les pertes
des grandes refontes et la fidélité graphique de l'ensemble de l'UI restent
ouverts. Le logo, Kinto'un, les vidéos et les destinations existantes restent
régis par [les invariants d'accueil et de shell](accueil-et-shell.md).

La suite UI complète passe ses 277 tests. Le typecheck, la conformité du paquet,
le format et les liens ciblés passent. Le lint ne rapporte aucune erreur et
conserve six avertissements déjà présents dans le code commité avant ce lot.
