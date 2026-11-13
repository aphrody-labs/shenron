# Reconnaissance : Xenoverse 2, Shenron et port WASM

Date : 2026-10-20. Périmètre : inventaire de Xenoverse 2 et cible de port complet vers WASM
pour Shenron/dragonballfr.com. Le propriétaire déclare que l’accord confidentiel inclut Toei,
Shueisha et Bandai Namco et demande la publication des CPK et données DBXV2. Le streaming Play
est explicitement hors périmètre.

## Sources observées

| Source                | URL                                             | Observation                                                                                                 |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Page jeu DBFR         | https://dragonballfr.com/games/xenoverse-2      | Analyse locale de fichiers ; sélection de dossier, confidentialité, moteur WASM                             |
| Fiche wiki DBFR       | https://dragonballfr.com/wiki/games/xenoverse-2 | Description, plateformes, galerie, personnages et discussion                                                |
| Dossier local du jeu  | `data/DB Xenoverse 2`                           | 39 fichiers de lanceur, exécutable et dépendances ; ne contient pas les CPK                                 |
| Serveur CPK           | `docs/operations/dbxv2-serve.md`                | Service présent sur le VPS, actuellement limité au mesh ; publication publique demandée, à livrer via Infra |
| Fork REA demandé      | https://github.com/aphrody-labs/rea             | Outils de reconnaissance ; source de référence distincte du jeu                                             |
| Toolkit DBXV2 demandé | https://github.com/aphrody-labs/dbxv2           | Outils et catalogue de formats ; aucune preuve d’un jeu complet en WASM                                     |

## Cible

Analyser l’exécutable et les formats, exploiter le store CPK existant, puis porter le moteur
complet vers un jeu jouable dans le navigateur en WASM. L’analyseur WASM actuel couvre seulement
quelques formats et ne constitue pas le jeu. La faisabilité et les étapes de port restent à établir.

## Écrans

| ID  | Écran               | Route                     | Composants                             | États observés ou à vérifier                  |
| --- | ------------------- | ------------------------- | -------------------------------------- | --------------------------------------------- |
| S01 | Jeu et explorateur  | `/games/xenoverse-2`      | Choix de dossier, analyse, résultats   | État initial observé ; raccord Play préparé   |
| S02 | Fiche jeu           | `/wiki/games/xenoverse-2` | Couverture, galerie, fiche, discussion | Fiche publiée observée ; raccord Play préparé |
| S03 | Analyse locale      | `/games/xenoverse-2`      | Sélection et parseurs WASM             | Analyse limitée à cinq formats                |
| S04 | Jeu navigateur WASM | à concevoir               | Moteur, données, contrôles et rendu    | Non implémenté                                |

## Parcours

- F01 : S01 ou S02 → S03 → S04 → S05. Deux actions explicites hors authentification :
  ouvrir Play puis demander le lancement. Cas limites : jeu absent, client arrêté,
  session expirée, émetteur indisponible, négociation ICE ou décodage en échec.
- F02 : S01 → sélection locale → résultats WASM. Aucun envoi de fichiers de jeu.
- F03 : S03 sans session → authentification → reprise de la cible Steam initiale.

## Composants et données

Sélecteur de dossier et liste de résultats existent pour l’analyse locale ; le jeu WASM complet
et ses contrôles restent à concevoir.

Entités déduites : `Game(appId, name, installationState)`,
`Game(appId, name, installationState)`. Le modèle de session Play est obsolète pour ce chantier.

## Limites et taille

Voir `features.csv` et `wasm-port-feasibility.md`. Taille XL : le moteur complet et la
compatibilité WASM ne sont pas encore établis. Le serveur CPK est un service de données, pas
un moteur de jeu ; son exposition publique attend la livraison Infra.
