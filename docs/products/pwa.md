# Application web DBFR

Le manifeste conserve l’identité `/`, le périmètre du site et les icônes originales
192/512 pixels, dont une icône maskable. Le menu du compte propose l’installation
lorsque le navigateur fournit son invite ; sur iOS, il indique le parcours Safari.
La fenêtre Tauri conserve son propre cycle de vie.

Le service worker `/sw.js` est servi avec `no-store`. Il prépare un
document hors connexion autonome, traduit, lisible sans Next ni CDN. Une navigation
réseau échouée affiche ce document avec Réessayer et les destinations principales.
Les pages, API, sessions, médias et requêtes de plage ne sont pas mis en cache.
Les seuls assets mis en cache sont les icônes de l’application et les fichiers
statiques Next de l’origine déclarée : 60 fichiers maximum, 2 Mio par fichier.
Les anciennes caches de ce propriétaire sont supprimées à l’activation.

Une nouvelle version attend le bouton Mettre à jour DBFR dans le menu du compte.
Elle ne coupe pas une lecture en cours par un rechargement automatique. Les pages,
planches et vidéos exigent une connexion ; l’installation ne promet aucun
téléchargement de contenu.

Qualification : vérifier le manifeste et les dimensions des icônes, le contrôle
du service worker, puis couper le réseau et naviguer vers une route publique.
Le document hors connexion doit rester utilisable à 390 et 1280 pixels. Vérifier
qu’aucune réponse API, session ou média n’apparaît dans Cache Storage.
