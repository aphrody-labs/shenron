# Reconnaissance : Xenoverse 2, Shenron et Bun OS Play

Date : 2026-10-18. Périmètre : parcours web du jeu installé sur l’hôte du propriétaire,
depuis les deux pages Shenron jusqu’à la session Play. Cette carte complète la reconnaissance
existante sans remplacer ses travaux sur les sites officiels.

## Sources observées

| Source | URL | Observation |
| --- | --- | --- |
| Page jeu DBFR | https://dragonballfr.com/games/xenoverse-2 | Analyse locale de fichiers ; sélection de dossier, confidentialité, moteur WASM |
| Fiche wiki DBFR | https://dragonballfr.com/wiki/games/xenoverse-2 | Description, plateformes, galerie, personnages et discussion |
| Bun OS Play | https://play.aphrody.app/stream?appId=454650 | Shell public ; rendu du navigateur Aphrody incomplet, parcours interactif non qualifié à ce stade |
| Fork REA demandé | https://github.com/aphrody-labs/rea | Outils de reconnaissance ; source de référence distincte du jeu |
| Toolkit DBXV2 demandé | https://github.com/aphrody-labs/dbxv2 | Outils et catalogue de formats ; aucune preuve d’un jeu complet en WASM |

## Boucle principale

Choisir Xenoverse 2 dans Shenron, ouvrir sa cible Steam dans Play, s’authentifier,
demander explicitement son lancement puis recevoir l’image et transmettre les commandes.
La disponibilité de chaque étape doit rester distincte.

## Écrans

| ID | Écran | Route | Composants | États observés ou à vérifier |
| --- | --- | --- | --- | --- |
| S01 | Jeu et explorateur | `/games/xenoverse-2` | Choix de dossier, analyse, résultats | État initial observé ; raccord Play préparé |
| S02 | Fiche jeu | `/wiki/games/xenoverse-2` | Couverture, galerie, fiche, discussion | Fiche publiée observée ; raccord Play préparé |
| S03 | Accès Play | `/stream?appId=454650` | Authentification, identité du jeu | Shell observé ; interface interactive à qualifier |
| S04 | Lancement ciblé | même route après connexion | Titre, bouton, statut | Implémentation préparée ; lancement réel à vérifier |
| S05 | Session distante | lecteur WebRTC de Play | Image, commandes, plein écran | Émetteur démarré ; réception et jouabilité à vérifier |

## Parcours

- F01 : S01 ou S02 → S03 → S04 → S05. Deux actions explicites hors authentification :
  ouvrir Play puis demander le lancement. Cas limites : jeu absent, client arrêté,
  session expirée, émetteur indisponible, négociation ICE ou décodage en échec.
- F02 : S01 → sélection locale → résultats WASM. Aucun envoi de fichiers de jeu.
- F03 : S03 sans session → authentification → reprise de la cible Steam initiale.

## Composants et données

Carte d’accès au jeu, bouton de lancement, statut accessible, lecteur distant,
sélecteur de dossier et liste de résultats sont les composants du parcours.

Entités déduites : `Game(appId, name, installationState)`,
`Session(authenticated, host)`, `LaunchRequest(appId, requested)` et
`Stream(sender, viewer, connectionState)`. Confiance haute pour les identités et
la séparation des étapes ; gameplay, latence, son et fidélité restent non mesurés.

## Limites et taille

Voir `features.csv`. Cinq écrans, trois parcours, quatre entités. Les difficultés
sont la session native Steam, le transport WebRTC réel et la conservation des entrées.
Taille XL si l’objectif inclut un port complet du moteur Windows vers WASM : les
parseurs de données et la recompilation de consoles ne constituent pas ce port.
Les ressources du jeu et les sessions restent dans leurs stores autorisés ; cette
reconnaissance ne les copie pas et ne remplace pas les propriétaires techniques.
