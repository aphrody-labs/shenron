<!-- SPDX-License-Identifier: Apache-2.0 -->

# TB3 : cadrage de la liste de souhaits

Statut : cadrage du 2026-10-30, aucune implémentation. « TB3 » est lu comme Dragon Ball Z
Budokai Tenkaichi 3 (BT3) ; le propriétaire doit le confirmer (question 1). Ce document ne
promet rien : il classe des idées et signale les risques.

## 1. État existant dans le dépôt

Recherche faite sur `docs/`, `crates/`, `apps/`, `packages/`, `scripts/`, `deploy/`.

- **Aucun code, doc ni donnée sur Budokai Tenkaichi 3, l'émulation d'un jeu de console, le
  netplay, le rollback, le matchmaking ou le classement de joueurs.** Les occurrences de
  « Tenkaichi » ou « Budokai » désignent le tournoi du manga (`docs/products/wiki-editorial.md`,
  `plugin/skills/dragon-ball-japonais/references/lexique-canonique.md`) ou le Quiz Budokai du bot
  (`docs/products/bot-discord-refonte.md` §6 G1, G4).
- `crates/shenron-re/src/catalog.rs` : catalogue de jeux pour la rétro-ingénierie et les
  sauvegardes (entrées Sparking! ZERO, Dragon Ball The Breakers). Ce n'est pas un lanceur et
  BT3 n'y figure pas (à revérifier avant le lot 1).
- Manettes : seule l'icône `Gamepad2` de `apps/site/src/components/games/GamesHub.tsx` ; aucune
  gestion d'entrées de manette trouvée.
- Temps réel : `apps/activity/deploy/nginx.activity.conf.example` et `bot-discord-refonte.md`
  §7 documentent un WebSocket `/ws` ; WebRTC et WebTransport ne passent pas par le proxy
  Discord. C'est l'unique base réseau de jeu existante, limitée à l'Activité Discord.
- PWA : `docs/products/pwa.md` (manifeste, service worker `/sw.js`, installation, mise à jour
  sans rechargement forcé, aucun téléchargement de contenu promis). Couvre l'installation
  mobile du site, pas celle d'un jeu.
- Application de bureau : Shenron Studio (`crates/shenron-desktop`, Tauri 3, installeur NSIS par
  `scripts/build/desktop.ts`) ; elle peut servir de modèle pour un lanceur en un seul
  téléchargement.
- Jeu propre : Dragon Pixel (`crates/dragon-pixel`, `docs/products/dragon-pixel-world.md`,
  `dbxv2-*.md`), moteur Rust/WASM. C'est un produit distinct de BT3.

## 2. Risque juridique (à lire avant tout)

BT3 est un jeu commercial (Bandai Namco, développeur Spike). Règles proposées :

- Aucune reproduction du jeu ni de ses assets ; aucune distribution de ROM, ISO, BIOS,
  firmware ou clés ; aucun contournement de protection ni de DRM.
- Seuls outils d'accompagnement envisageables : lanceur, profils de configuration,
  sauvegardes de réglages, couche réseau, le tout exigeant une copie légale fournie par
  l'utilisateur (fichier choisi localement, jamais envoyé ni hébergé).
- « Un seul téléchargement, tout dedans » est **incompatible** avec cette règle si « tout »
  inclut le jeu. Seuls le lanceur et la configuration peuvent être inclus.
- Les mods (personnages, textures, corrections audio) sont des œuvres dérivées : redistribuer
  des modifications qui embarquent des assets du jeu expose à un retrait. Privilégier des
  correctifs appliqués localement sur la copie de l'utilisateur, sans hébergement des fichiers
  d'origine, et obtenir un avis juridique avant publication.
- Un classement public, du matchmaking et un chat attirent l'attention des ayants droit et
  engagent la modération (données personnelles, RGPD, mineurs).
- L'accord NHIL du propriétaire ne couvre pas BT3 ; l'accord cité pour DBXV2 est déclaré et
  non vérifié (`dbxv2-immersion.md`). Ne pas l'étendre.

## 3. Thèmes, doublons, contradictions et classement

Légende : **S** = faisable côté Shenron (site, serveur, PWA, lanceur) ; **T** = dépend d'un
moteur ou émulateur tiers (capacité à confirmer) ; **H** = hors périmètre.

### Réseau et matchmaking

| Souhait | Classe | Remarque |
|---|---|---|
| Connexion stable | T | Qualité du netcode du moteur ; Shenron ne l'améliore pas seul. |
| Rollback ou buffer ? | T | Voir §4. |
| Matchmaking auto et rapide | S si le moteur expose un lancement en réseau ; sinon T | File d'attente et salons côté serveur, session de jeu côté tiers. |
| Amical et classé | S | Deux files, un seul code. Doublon avec « ranked par continent ». |
| Classement des joueurs | S | Nécessite des résultats fiables : sans arbitre côté jeu, la triche est triviale. |
| Matchmaking par géolocalisation | S | Mesure de latence côté client, sans stocker d'IP brute. Doublon avec « par continent ». |
| Ranked par continent (EU, Asie…) | S | Même mécanisme ; classements par région. Tension : petits bassins, files longues, en contradiction avec « rapide ». |
| 3v3 compétitif | T | Dépend du mode d'origine ; équilibrage non garanti. |
| Spectateur sans lag | T | Dépend de l'émulateur ; risque de coût réseau. |
| Choix des joueurs d'autoriser les spectateurs | S | Option par joueur dans le salon. |
| Chat inclus | S pour le chat de salon (WebSocket) ; T dans le rendu du jeu | |
| Inverser les joueurs sur une même session | T | Réaffectation des ports de manette. |

### Contrôles et manettes

| Souhait | Classe | Remarque |
|---|---|---|
| Configuration auto selon la manette | S | API Gamepad pour le web ; table de profils par modèle ; couche native selon le lanceur. |
| Remapper les touches | S ou T | Lanceur, si l'émulateur lit un fichier de profil. |
| Sauvegarder les configurations | S | Profils nommés en compte utilisateur. |

### Installation et mises à jour

| Souhait | Classe | Remarque |
|---|---|---|
| Un téléchargement, configuration incluse | S (partiel) | Lanceur seul, voir §2. |
| Menu des versions PAL / NTSC / Mods | S si l'utilisateur fournit chaque copie ; sinon H | Le lanceur détecte et empile des profils. |
| Installation sur téléphone | S (PWA) pour lanceur et salons ; T pour exécuter le jeu | Exécuter un jeu de console sur mobile exigerait un émulateur mobile, non établi ici. |
| Mises à jour en direct plutôt que réinstaller | S pour lanceur et profils ; H pour les assets du jeu | Mise à jour de la configuration et des correctifs, pas du jeu. |

### Rendu, audio, HUD

| Souhait | Classe | Remarque |
|---|---|---|
| « 120 % 30 fps » (formulation ambiguë) | T | Probablement vitesse 120 % à 30 fps ; à clarifier (question 3). |
| Musique non accélérée malgré 120 % | T | Découplage de la vitesse audio ; dépend du moteur. Lié à la ligne précédente. |
| Sons trop forts et saturés sur maps détruites | T ou H | Correction du mixage du jeu ; relève d'un mod. |
| Correctif graphique et textures | T ou H | Mod ou pack de textures ; risque juridique (§2). |
| Menus et HUD en 16:9 | T ou H | Patch de rendu ou de widescreen ; mod. |
| Retirer l'écran de lancement (« sinder », lu comme splash) | S pour l'écran du lanceur ; T pour celui du jeu | À confirmer. |
| Arriver directement à l'écran de personnage | T | Raccourci de menu du jeu ; dépend d'une capacité de scripting. |

### Contenu et équilibrage

| Souhait | Classe | Remarque |
|---|---|---|
| Ajout de personnage (+ nerf si besoin) | H pour les assets ; T | Mod avec assets dérivés (§2). |
| Vague explosive récupérable pour contre-attaquer | T | Règle de combat modifiée ; mod d'équilibrage. |
| Choix de teams préconfigurées | S si le jeu accepte un fichier de préréglage ; sinon T | Presets de roster dans le lanceur. |

### Modes de jeu et social

Voir le réseau (3v3, spectateur, chat). Aucun mode social existant du site n'est réutilisable,
hormis les salons de l'Activité Discord.

### Doublons et contradictions à trancher

- Géolocalisation, ranked par continent et « rapide » : mêmes données, trois objectifs
  concurrents (latence, équité, temps d'attente).
- Rollback ou buffer : décision d'architecture avant tout lot réseau.
- Un seul téléchargement incluant PAL, NTSC et mods : contradiction avec §2.
- 120 % de vitesse et musique non accélérée : demandes liées, une seule solution technique.
- Retirer l'écran de lancement et arriver directement au choix de personnage : même objectif.

## 4. Netcode : rollback ou buffer de délai

Description générale, sans mesure propre à ce projet.

- **Buffer de délai** : l'entrée locale est retardée de N images pour attendre l'entrée
  distante. Simple, déterministe, robuste sur un moteur sans retour arrière. La latence
  ressentie augmente avec le ping et les à-coups apparaissent quand le réseau varie.
- **Rollback** : le jeu avance sans attendre, puis revient en arrière et rejoue quand l'entrée
  distante arrive. Meilleure sensation en jeu de combat à latence moyenne. Prérequis : moteur
  déterministe, état de jeu sauvegardable et restaurable, rejeu rapide (coût CPU). Très
  coûteux, voire impossible, à ajouter à un jeu fermé sans ces prérequis.
- **Conséquence pour TB3** : tant qu'on ne sait pas quel moteur ou émulateur exécute le jeu,
  ni s'il offre sauvegarde d'état et déterminisme, le choix ne peut pas se faire. Un
  prototype mesuré est nécessaire avant engagement (lot 3). Le spectateur et le 3v3
  dépendent aussi de ce choix (diffusion d'entrées ou d'états).

## 5. Priorisation

| # | Fonctionnalité | Valeur | Effort | Dépendances | Risque |
|---|---|---|---|---|---|
| 1 | Décision de périmètre juridique et moteur | Élevée | S | Propriétaire, avis juridique | Élevé si omise |
| 2 | Profils de manette (détection, remap, sauvegarde) | Élevée | M | Lot 1, API Gamepad | Faible |
| 3 | Prototype netcode mesuré (rollback / buffer) | Élevée | L | Moteur tiers confirmé | Élevé (faisabilité) |
| 4 | Lanceur : copie fournie, versions, profils, mises à jour de configuration | Élevée | M | Lot 1, Tauri 3 | Moyen (juridique) |
| 5 | Salons, matchmaking amical, chat de salon | Moyenne | M | Lot 3, WebSocket | Moyen (modération) |
| 6 | Classé, régions, classement | Moyenne | L | Lot 5, résultats fiables | Élevé (triche, RGPD) |
| 7 | PWA des salons et profils sur mobile | Moyenne | S | `pwa.md` | Faible |
| 8 | Spectateur et 3v3 compétitif | Moyenne | L | Lot 3 | Élevé |
| 9 | Correctifs son, HUD 16:9, textures, personnages, équilibrage | Variable | L | Mods, moteur | Très élevé (juridique) |

## 6. Lots proposés

1. **Cadrage** : confirmer jeu, plateforme, moteur ; avis juridique ; décider ce qui se
   publie ou non. Livrable : décision écrite.
2. **Profils de manette** et lanceur minimal (hors réseau, copie fournie par l'utilisateur).
3. **Prototype netcode** sur le moteur retenu : mesures réelles de latence, comparaison
   rollback et buffer, verdict.
4. **Salons et matchmaking amical** avec chat de salon, puis régions par latence mesurée.
5. **Classé et classement** si les résultats sont vérifiables ; sinon rester en amical.
6. **Mods et correctifs** seulement après avis juridique, appliqués localement.

## 7. Décisions (2026-10-30, propriétaire : « trancher tout »)

Les six questions du cadrage sont tranchées comme suit, sans attendre de réponse :

1. **Jeu** : TB3 = Dragon Ball Z Budokai Tenkaichi 3. La plateforme d'origine retenue est celle de la
   copie que fournit l'utilisateur (PS2 ou Wii) ; les versions PAL et NTSC sont des profils du
   lanceur, pas des fichiers livrés.
2. **Moteur** : aucun moteur ni émulateur n'est embarqué ni redistribué. Le lanceur pilote un
   émulateur que l'utilisateur installe, et le choix se fait au prototype netcode (lot 3), sur
   mesures réelles.
3. **« 120 % 30 fps »** : lu comme une vitesse de jeu à 120 % avec un audio qui garde sa hauteur
   (musique non accélérée). C'est un réglage de profil, à valider au prototype.
4. **Mods** : correctifs appliqués localement sur la copie de l'utilisateur, jamais publiés comme
   fichiers du jeu. Personnages, textures et équilibrage restent des correctifs locaux.
5. **Droits** : aucun accord des ayants droit n'est consigné ; le périmètre reste donc celui des outils
   d'accompagnement (lanceur, manettes, salons, réseau). Ni ROM, ni ISO, ni contournement de protection.
6. **Hébergement** : le projet vit dans Shenron (Shenron Studio pour le lanceur de bureau, site et
   Activité Discord pour salons, classement et chat).

Conséquence : le prochain lot exécutable sans accord est le lot 2 (profils de manette et lanceur
minimal, hors réseau) ; les lots 3 à 6 attendent le choix de l'émulateur et l'avis juridique.
