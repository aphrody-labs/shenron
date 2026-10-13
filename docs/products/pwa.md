# Application web DBFR

Le manifeste conserve l’identité `/`, le périmètre du site et les icônes originales
192/512 pixels, dont une icône maskable. La barre supérieure et la navigation proposent
l’installation par une icône Material avec nom accessible. L’invite du navigateur
est partagée entre ces contrôles et ne peut être utilisée qu’une fois. Sans invite,
le contrôle affiche les instructions du navigateur ; sur iOS, le parcours Safari.
La fenêtre Tauri conserve son propre cycle de vie.

Le service worker `/sw.js` est servi avec `no-store`. Il prépare un
document hors connexion autonome, traduit, lisible sans Next ni CDN. Une navigation
réseau échouée affiche ce document avec Réessayer et les destinations principales.
Les pages, API, sessions, médias et requêtes de plage ne sont pas mis en cache.
Les seuls assets mis en cache sont les icônes de l’application et les fichiers
statiques Next de l’origine déclarée : 60 fichiers maximum, 2 Mio par fichier.
Les icônes sont revalidées sur le réseau et disponibles depuis le cache en cas
de coupure ; les chunks immuables conservent leur nom fingerprinté. La langue
et le thème Beerus/Goku de l’écran hors connexion sont conservés pendant une mise à jour.
Le manifeste et la fenêtre installée utilisent la même palette que le site.
Les anciennes caches de ce propriétaire sont supprimées à l’activation.

Une nouvelle version attend l’icône Mettre à jour DBFR dans la navigation.
Elle ne coupe pas une lecture en cours par un rechargement automatique. Les pages,
planches et vidéos exigent une connexion ; l’installation ne promet aucun
téléchargement de contenu.

Qualification : vérifier le manifeste et les dimensions des icônes, le contrôle
du service worker, puis couper le réseau et naviguer vers une route publique.
Le document hors connexion doit rester utilisable à 390 et 1280 pixels. Vérifier
qu’aucune réponse API, session ou média n’apparaît dans Cache Storage.
