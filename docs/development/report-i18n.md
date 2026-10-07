# Langues du formulaire de signalement

Le formulaire partagé utilise le namespace `reportDialog` des dictionnaires
français, anglais et japonais. Ses libellés accessibles, catégories, messages
d'erreur, états d'envoi, confirmation et invitation à se connecter suivent la
langue de l'interface. Les valeurs de catégories envoyées à l'API sont
conservées.

Les erreurs du composant sont des clés, et non des textes traduits à l'instant
de la requête : changer de langue retraduit aussi une erreur déjà affichée.
L'invitation Discord et le bouton global de signalement sont désormais sous le
même `LocaleProvider` que le shell. Le rendu français initial des pages
cacheables est conservé ; le changement de langue se fait côté client.

La qualification native utilise le serveur de développement Next derrière Bun
et Obscura, avec données synthétiques. Elle ouvre et ferme la modale en
français, en anglais et en japonais. Les captures restent dans
`var/reports/integration/`. La limite connue des sélecteurs de rôle du SDK
nécessite un sélecteur DOM pour fermer la modale ; cela ne qualifie pas un
lecteur d'écran ou un appareil physique.

La capture japonaise du binaire Obscura utilisé montre des glyphes manquants
(carrés). Le DOM contient les traductions et les interactions réussissent,
mais le rendu typographique japonais n'est pas qualifié. La couverture des
polices natives reste à corriger chez son propriétaire.
