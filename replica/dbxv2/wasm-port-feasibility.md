# Faisabilité d’un port complet de Xenoverse 2 vers WASM

Date : 2026-10-20. Cible demandée : jeu complet, navigateur, Shenron/dragonballfr.com.

## Conclusion

Le dossier `data/DB Xenoverse 2` ne contient pas le jeu à porter. Il contient 39 fichiers
(environ 79,7 Mo) : lanceurs, `DBXV2.exe`, bibliothèques Steam/EOS et EasyAntiCheat. Aucun
contenu de jeu, archive de données, code source moteur, projet de build WASM ou interface
portable n’y apparaît. `bin/steam_appid.txt` identifie l’application Steam `454650`.

Le propriétaire a corrigé le périmètre des droits le 2026-10-20 : il déclare que l’accord
confidentiel inclut Toei, Shueisha et Bandai Namco, et demande la publication des CPK et données DBXV2. Cette portée est
consignée dans `AGENTS.md` comme déclaration du propriétaire ; l’accord reste confidentiel.
Cela retire l’exclusion de droits reprise dans la première évaluation. La demande inclut
maintenant l’analyse statique de l’exécutable, qui n’était pas lancée par cette reconnaissance.

Le dépôt possède un analyseur WASM de quelques formats DBXV2 et un moteur de rendu/combat
générique. Ces éléments ne constituent ni le moteur du jeu commercial ni un port du gameplay.
Le dossier local reste incomplet pour produire un binaire WASM complet ; le service CPK du
VPS constitue une source de données, pas du code source du moteur ni un projet de build
portable. La faisabilité du port intégral demeure **non démontrée et XL**, mais n’est plus
écartée sur la base d’une absence de droits déclarés. L’analyse Ghidra du PE x86-64 avait démarré
puis expiré (`var/reports/dbxv2-binary-20261021/rea-analysis.json`, `provider_timeout` à 330 s).
Un scan de signatures statique (Detect It Easy, 2026-10-22,
`var/reports/dbxv2-drm-20261022/`) explique pourquoi : `DBXV2.exe` est enveloppé par
**SteamStub x64**, le DRM/CEG natif de Steamworks — section `.text` (15,3 Mio) à une entropie de
7.9999/8 bits/octet, indiscernable d'un flux chiffré, plus une section `.bind` propre à
SteamStub. Le code réel ne se déchiffre qu'en mémoire sous une session Steam valide ; aucun
outil de retrait de ce DRM n'a été utilisé ni produit, conformément à l'autorisation du
propriétaire (analyse oui, retrait du DRM Steam non). Le même scan sur `xgcore.dll` et
`iggy_w64.dll` ne montre aucune protection : ce sont elles, avec les données CPK, la voie
d'analyse statique praticable retenue pour le port.

## Sources

| Source                                   | URL                                                                                                     | Ce qu’elle établit                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site officiel Bandai Namco               | https://en.bandainamcoent.eu/dragon-ball/dragon-ball-xenoverse-2                                        | Le produit évolue avec des campagnes, personnages, quêtes parallèles, missions, compétences, costumes, scènes et fonctions de galerie ; la page annonce le chapitre final Future Saga en juillet 2026.                                |
| Fiche Steam officielle                   | https://store.steampowered.com/app/454650/DRAGON_BALL_XENOVERSE_2/                                      | Identité commerciale de l’application et catalogue de DLC.                                                                                                                                                                            |
| Présentation officielle Xenoverse 2 Lite | https://en.bandainamcoent.eu/dragon-ball/news/dragon-ball-xenoverse-2-lite-coming-ps4-and-xbox-one-free | Confirme les familles de parcours : missions d’histoire, quêtes parallèles, mode Hero Colosseum, combats/quêtes en ligne, versus hors ligne et mode photo. Source historique, elle ne décrit pas l’intégralité de l’édition actuelle. |
| Recon Shenron/Play existante             | `replica/dbxv2/recon.md`                                                                                | Carte de l’explorateur DBFR et du lancement Steam en streaming ; ce n’est pas une reconnaissance du gameplay complet.                                                                                                                 |
| Documentation du paquet privé DBXV2      | `docs/products/dbxv2-plugin.md`                                                                         | Outils privés de lecture/conversion de médias et de formats ; indique explicitement que le WASM public `shenron_re` ne contient qu’un catalogue et des parseurs.                                                                      |
| Couverture de la base DBXV2              | `docs/operations/dbxv2-couverture.md`                                                                   | Un relevé du 18 octobre 2026 décrit 26 archives, 39,25 Go stockés et 56,93 Go extraits sur le store VPS ; ces données ne constituent pas le moteur du jeu.                                                                            |

## Inventaire observé du dossier fourni

| Élément                                        | Observation                                                                                             | Portée                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bin/DBXV2.exe`                                | Exécutable Windows, 23 877 704 octets, verrouillé par SteamStub x64 (`var/reports/dbxv2-drm-20261022/`) | Présence du programme natif ; la section de code est chiffrée au repos (DRM Steamworks), le code réel n'existe qu'en mémoire sous session Steam. Aucune analyse Ghidra exploitable, aucun outil de retrait produit. |
| `START.exe`                                    | Lanceur, 3 975 920 octets                                                                               | Bootstrapper, pas une source de build WASM.                                                                                                                                                                         |
| `steam_api64.dll`, `EOSSDK-Win64-Shipping.dll` | Bibliothèques natives                                                                                   | Dépendances de services desktop ; leur présence ne donne pas leurs implémentations portables.                                                                                                                       |
| `EasyAntiCheat/`                               | Configuration, installateur, certificats et traductions                                                 | Dépendance au déploiement Windows ; aucun contenu de jeu.                                                                                                                                                           |
| Archives/ressources du jeu                     | Aucune dans les 39 fichiers recensés                                                                    | Le dossier est incomplet pour analyser les données ou reconstruire une expérience de jeu.                                                                                                                           |

Le relevé est une observation de noms, tailles et fichiers texte de configuration. Il ne prouve
pas l’absence de données ailleurs sur la machine, ni le comportement d’un jeu lancé.

## Carte statique du moteur (`xgcore.dll`, `iggy_w64.dll`)

Détail complet : `var/reports/dbxv2-engine-map-20261022/README.md`. `iggy_w64.dll` est le
lecteur Flash/SWF+AS3 tiers « Iggy » de RAD Game Tools (UI/menus) : aucun format propre à
DBXV2, sans valeur pour le port modèle/animation. `xgcore.dll` (`Eva::XG`) confirme par ses
vérifications de magique `#EMM`/`#EMB` et ses constructeurs `ModelCore`/`SkeletonCore`/
`AnimationSequencer` que `.emd`/`.esk`/`.ean`/`.emm`/`.emb` sont bien les formats déjà portés
dans `crates/shenron-re/src/formats`, et révèle **deux formats réels non encore portés** :
`.emo` (`#EMO`, `EmObjectShared`, 1 959 fichiers dans le CPK) et `.ema` (`#EMA`, `EmMotion`,
5 116 fichiers). Les chemins en clair extraits de la section `.rdata` (non chiffrée) de
`DBXV2.exe` lui-même confirment leur usage réel : surtout des objets d'effets visuels, ex.
`data/vfx/lby_cmn/AuraLoop_B.emo` (objet) avec `AuraLoop_B.obj.ema` (motion d'objet) et des
variantes `*.mat.ema` (motion de matériau — tramage UV, fondu) et **`*.light.ema`** (motion de
lumière, troisième genre confirmé) ; `.cam.ean` reste le format d'animation caméra des
personnages (pas `.ema`). `.emo` agrège par ailleurs plusieurs `.emd` et leur hiérarchie de
nœuds au niveau moteur (`EmObjectShared`).

Vérité terrain (2026-10-22, octets réels extraits du CPK Steam local légitime du propriétaire
via l'outil déjà présent `@shenron/dbxv2`, aucune archive extraite en totalité) : `data.cpk`
seul contient 1 832 `.emo` et 4 743 `.ema`. En-tête confirmée sur quatre fichiers réels et
indépendants : `#EMO`/`#EMA` + `u16 0xFFFE` + `u16 header_size=32` (fixe) + `u32` constant
`0x92c0` (version de format du build, pas un champ par fichier) ; pour `#EMO`, l'octet `0xc`
pointe une sous-table juste après l'en-tête de 32 octets. Correction (relevé par l'agent
`dbxv2-wasm-engine-20261022`, corpus complet) : pour `#EMA`, l'octet `0x10` (`u16`) est le
nombre d'animations et l'octet `0x12` (`u16`) est le **genre** (3 objet, 4 lumière, 8
matériau), pas un compteur de canaux comme écrit plus haut. `EmMotion::GetTailTranslation`
dans `xgcore.dll` confirme l'encodage des canaux : valeurs en f16 si `(u16_anim + 10) & 1`,
sinon f32 ; indicateur `0x20` = temps en `u16`, `0x40` = indices en `u32` ; les bits hauts d'un
indice donnent le décalage vers la tangente ; la composante vient de `flags & 3`. Détail et
scripts : `var/reports/dbxv2-engine-map-20261022/README.md` (local). Les parseurs `.emo`/`.ema`
sont écrits côté `bun-os` (`crates/re/src/game/formats/{emo,ema}.rs`, branchés dans
`api::summarize`/`support`, documentés dans `bun-os/docs/re/DBXV2-EMO-EMA.md`) à la demande du
propriétaire — pas dans `crates/shenron-re/src/formats` de ce dépôt.

## Capacités locales pertinentes

- `/games/xenoverse-2` demande à l’utilisateur de sélectionner des fichiers locaux puis analyse
  seulement `BAC`, `BDM`, `CUS`, `MSG` et `PUP` avec le module `shenron_re` compilé en WASM.
- Le moteur `@aphrody/shenron-engine` possède un build `wasm32-unknown-unknown` et des surfaces
  WebGPU/canvas génériques. Aucun raccord source ne montre qu’il exécute le moteur commercial.
- Le serveur CPK peut servir les données DBXV2. Le propriétaire demande leur publication ; la
  route publique et sa livraison restent à réaliser via Infra.
- Le parcours de streaming Play est abandonné pour cette demande. La cible est un port navigateur
  WASM, dont le moteur de jeu complet n'est pas encore identifié ni porté.

## Portée fonctionnelle documentée publiquement

Les sources officielles identifient plusieurs domaines, sans fournir les détails nécessaires à
un clone complet : création/personnalisation et progression du héros, histoire, missions et
quêtes parallèles, combats, hub, activités en ligne, contenu additionnel et modes annexes. Les
écrans, états, règles exactes, données de progression, contrôles, simulation de combat, réseau,
audio et comportement des DLC restent à observer dans le jeu ou à documenter officiellement.
Les déduire des seuls textes marketing serait spéculatif.

## Décision de périmètre

| Fonction                                                 | Priorité | État clone | Décision                                                                                                                                            |
| -------------------------------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exécuter le jeu complet dans un navigateur WASM          | must     | no         | Cible demandée ; aucun source/build portable fourni. Il faut poursuivre l'analyse statique et l'inventaire CPK pour établir le périmètre technique. |
| Analyser certains fichiers DBXV2 sélectionnés localement | must     | yes        | Fonction existante, bornée à cinq formats et à 16 Mio par fichier. Ce n’est pas de l’exécution de jeu.                                              |
| Jouer au jeu Windows via le streaming Play existant      | won't    | skip       | Hors périmètre selon la demande du propriétaire du 2026-10-20.                                                                                      |
| Créer un jeu de combat original compilé en WASM          | could    | no         | Option de produit distincte ; gameplay, personnages, histoire, modèles, sons et interfaces doivent être originaux.                                  |

## Taille et inconnues

Le port complet est **XL / non estimable** avec les entrées disponibles. Le dépôt n’identifie
pas de moteur source, de compilateur de la chaîne originale, d’ABI portable, de version WASM,
de plan de ressources ni de contrat réseau transférable. Les obstacles sont le moteur natif,
le rendu et l’animation 3D, la simulation de combat, l’audio, le streaming des ressources, la
sauvegarde et la progression, les services multijoueur, l’anti-triche, ainsi que l’ensemble des
extensions de contenu. La taille réelle, les dépendances du moteur et la portabilité restent
inconnues ; elles ne doivent pas être extrapolées depuis les 80 Mo du dossier incomplet.

La prochaine étape praticable pour le besoin « jouer dans le navigateur » est de terminer la
qualification du streaming Play existant. Pour un produit WASM autonome, le périmètre praticable
est un prototype de combat original, sans importer les ressources ou le code du jeu.
