# Faisabilité d’un port complet de Xenoverse 2 vers WASM

Date : 2026-10-20. Cible demandée : jeu complet, navigateur, Shenron/dragonballfr.com.

## Conclusion

Le dossier `data/DB Xenoverse 2` ne contient pas le jeu à porter. Il contient 39 fichiers
(environ 79,7 Mo) : lanceurs, `DBXV2.exe`, bibliothèques Steam/EOS et EasyAntiCheat. Aucun
contenu de jeu, archive de données, code source moteur, projet de build WASM ou interface
portable n’y apparaît. `bin/steam_appid.txt` identifie l’application Steam `454650`.

Le dépôt possède un analyseur WASM de quelques formats DBXV2 et un moteur de rendu/combat
générique. Ces éléments ne constituent ni le moteur du jeu commercial ni un port du gameplay.
Le plan « Xenoverse 2 complet en WASM » est donc **non démontré et irréalisable à partir de
ce dossier**. La reconnaissance clean-room ne décompile pas l’exécutable et ne reprend ni
code ni ressources appartenant au jeu. Une réimplémentation originale inspirée de boucles
de jeu publiques serait un autre produit, avec contenus originaux et périmètre réduit.

## Sources

| Source | URL | Ce qu’elle établit |
| --- | --- | --- |
| Site officiel Bandai Namco | https://en.bandainamcoent.eu/dragon-ball/dragon-ball-xenoverse-2 | Le produit évolue avec des campagnes, personnages, quêtes parallèles, missions, compétences, costumes, scènes et fonctions de galerie ; la page annonce le chapitre final Future Saga en juillet 2026. |
| Fiche Steam officielle | https://store.steampowered.com/app/454650/DRAGON_BALL_XENOVERSE_2/ | Identité commerciale de l’application et catalogue de DLC. |
| Présentation officielle Xenoverse 2 Lite | https://en.bandainamcoent.eu/dragon-ball/news/dragon-ball-xenoverse-2-lite-coming-ps4-and-xbox-one-free | Confirme les familles de parcours : missions d’histoire, quêtes parallèles, mode Hero Colosseum, combats/quêtes en ligne, versus hors ligne et mode photo. Source historique, elle ne décrit pas l’intégralité de l’édition actuelle. |
| Recon Shenron/Play existante | `replica/dbxv2/recon.md` | Carte de l’explorateur DBFR et du lancement Steam en streaming ; ce n’est pas une reconnaissance du gameplay complet. |
| Documentation du paquet privé DBXV2 | `docs/products/dbxv2-plugin.md` | Outils privés de lecture/conversion de médias et de formats ; indique explicitement que le WASM public `shenron_re` ne contient qu’un catalogue et des parseurs. |
| Couverture de la base DBXV2 privée | `docs/operations/dbxv2-couverture.md` | Un relevé du 18 octobre 2026 décrit 26 archives, 39,25 Go stockés et 56,93 Go extraits dans le store privé ; cela ne les rend ni présentes dans le dossier fourni ni exploitables comme moteur du jeu. |

## Inventaire observé du dossier fourni

| Élément | Observation | Portée |
| --- | --- | --- |
| `bin/DBXV2.exe` | Exécutable Windows, 23 877 704 octets | Présence du programme natif ; aucune inspection de son code n’a été faite. |
| `START.exe` | Lanceur, 3 975 920 octets | Bootstrapper, pas une source de build WASM. |
| `steam_api64.dll`, `EOSSDK-Win64-Shipping.dll` | Bibliothèques natives | Dépendances de services desktop ; leur présence ne donne pas leurs implémentations portables. |
| `EasyAntiCheat/` | Configuration, installateur, certificats et traductions | Dépendance au déploiement Windows ; aucun contenu de jeu. |
| Archives/ressources du jeu | Aucune dans les 39 fichiers recensés | Le dossier est incomplet pour analyser les données ou reconstruire une expérience de jeu. |

Le relevé est une observation de noms, tailles et fichiers texte de configuration. Il ne prouve
pas l’absence de données ailleurs sur la machine, ni le comportement d’un jeu lancé.

## Capacités locales pertinentes

- `/games/xenoverse-2` demande à l’utilisateur de sélectionner des fichiers locaux puis analyse
  seulement `BAC`, `BDM`, `CUS`, `MSG` et `PUP` avec le module `shenron_re` compilé en WASM.
- Le moteur `@aphrody/shenron-engine` possède un build `wasm32-unknown-unknown` et des surfaces
  WebGPU/canvas génériques. Aucun raccord source ne montre qu’il exécute le moteur commercial.
- Le paquet DBXV2 privé peut servir certains modèles, textures, sons ou vidéos à des fonctions
  internes. Les règles existantes interdisent d’inclure ces données privées dans les bundles et
  de les rendre publiques.
- Le parcours déjà documenté pour jouer au titre est le streaming du jeu natif depuis Play ;
  la négociation et la jouabilité réelle restent à requalifier dans la reconnaissance existante.

## Portée fonctionnelle documentée publiquement

Les sources officielles identifient plusieurs domaines, sans fournir les détails nécessaires à
un clone complet : création/personnalisation et progression du héros, histoire, missions et
quêtes parallèles, combats, hub, activités en ligne, contenu additionnel et modes annexes. Les
écrans, états, règles exactes, données de progression, contrôles, simulation de combat, réseau,
audio et comportement des DLC restent à observer dans le jeu ou à documenter officiellement.
Les déduire des seuls textes marketing serait spéculatif.

## Décision de périmètre

| Fonction | Priorité | État clone | Décision |
| --- | --- | --- | --- |
| Exécuter le jeu commercial complet dans un navigateur WASM | must | skip | Aucun source/build portable fourni ; le binaire Windows n’est pas décompilé dans ce flux de reconnaissance, et le contenu de jeu n’est pas dans le dossier. |
| Analyser certains fichiers DBXV2 sélectionnés localement | must | yes | Fonction existante, bornée à cinq formats et à 16 Mio par fichier. Ce n’est pas de l’exécution de jeu. |
| Jouer au jeu Windows via le streaming Play existant | should | prepared | Chemin déjà documenté ; qualifier séparément lancement, image, son, commandes et session réelle. |
| Créer un jeu de combat original compilé en WASM | could | no | Option de produit distincte ; gameplay, personnages, histoire, modèles, sons et interfaces doivent être originaux. |

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
