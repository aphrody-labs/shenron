<!-- SPDX-License-Identifier: Apache-2.0 -->

# Dragon Pixel : monde DBXV2 et collections

La route `/games/dragon-pixel` utilise le moteur Rust/WebAssembly de Shenron pour afficher
les ressources originales de Dragon Ball Xenoverse 2 depuis les archives CPK autorisées.
Les maillages du décor proviennent des entrées NSK ; le client charge leurs textures EMB
et leurs matériaux EMM associés. Aucun décor d’îlots procéduraux ne constitue cette scène.

## Chaîne de ressources

`apps/site/src/components/dragon-world/cpk-world-assets.ts` interroge l’index public
`/api/public/dbxv2/cpk/<archive>/find` avec `q=data/stage/*`, en parcourant toutes les pages.
Il regroupe les NSK par dossier de stage et cherche les EMB/EMM de même nom ou la banque EMB
au plus long préfixe réellement observé pour les pièces séparées, sans attribuer
un nom géographique non vérifié au code de dossier. Le sélecteur présente ces codes réels.

Le chargeur conserve toutes les pièces NSK du stage, y compris les variantes de détail et
les objets. Il refuse un stage dépassant 128 pièces ou 192 Mio décompressés plutôt que de
tronquer silencieusement la scène. Quatre requêtes sont exécutées simultanément au maximum ;
les ressources identiques sont partagées. Les données passent par les routes `raw` existantes,
avec annulation des requêtes lors d’un changement de stage ou du démontage du composant.
Les conditions de sélection de ces variantes restent à qualifier visuellement : leur présence
dans une archive ne garantit pas qu’elles doivent toutes être visibles simultanément.

`crates/shenron-re/src/formats/nsk.rs` possède le parseur NSK. Dans le format observé, le
conteneur commence par `#ESK` ; le champ little-endian à `0x14` pointe vers le bloc `#EMD`.
Le parseur borne les sections puis délègue à `EskFile` et `EmdFile`. `assemble_nsk` réutilise
l’assembleur existant et conserve le squelette : ce wrapper n’applique pas à lui seul les
transformations de repos et ne promet aucune simulation physique.

`packages/engine/src/glb-scene.ts` expose `createXv2World`, chargé par le glue commun
`engine-wasm.ts`. Le contrat reçoit des pièces `{ nsk, emb?, emm? }` et expose `bounds()`,
`camera(x, y, z, yaw, pitch)`, `frame`, `resize` et `free`. Le contexte de rendu appartient au
moteur Rust/WebGPU existant. La présence du contrat TypeScript ne prouve pas que le nouveau
binding est déjà inclus dans un artefact WASM compilé ou déployé : ce point exige un contrôle
de l’artefact effectivement servi.

## Exploration et interface

`DragonWorld.tsx` compose le canvas, le sélecteur d’archive/stage, la progression de chargement,
les commandes et le volet de catalogue. La caméra de départ et la vitesse utilisent les bornes
renvoyées par le moteur. Pour BFtok, la vue commence au départ `VS_INIT_POS_A_0` de
`BFtok_EVE.map`, avec un décalage de hauteur de vue choisi par DBFR : cette position de
combattant ne devient pas pour autant une caméra officielle du jeu. Le déplacement est libre : il ne représente ni un personnage jouable
ni les collisions, la gravité ou les règles de déplacement du jeu commercial.

Les touches WASD et ZQSD, ainsi que les flèches, déplacent la caméra horizontalement ; Espace
et Maj règlent l’altitude. Le glissement règle le regard et le recentrage restaure la position
de départ. Les boutons tactiles offrent les directions et l’altitude. La perte de focus ou
le masquage de la page efface les touches actives pour éviter un mouvement bloqué. La manette,
lorsque disponible, n’est lue que pendant le focus du canvas. Le plein écran dépend de l’API
native du navigateur.

Sans WebGPU, l’interface rapporte l’indisponibilité du rendu. Elle conserve l’accès au catalogue
HTML. Le laboratoire CPK existant reste accessible : personnages animés, duel et consultation
des ressources continuent d’appeler leurs propriétaires existants.

## Tous les contenus publics

`WorldCatalog.tsx` présente les catégories reçues dynamiquement de `GET /api/catalog`, sans
leur imposer une géographie fictive. Le relevé public du **26 octobre 2026** comporte 36
catégories ; cette valeur est une observation datée, pas une limite codée. Les nouvelles
catégories publiques apparaissent dans le même volet.

Les fiches se chargent à la demande avec `category`, `page` et `q`, selon la pagination du
contrat serveur. L’exhaustivité signifie que toutes les catégories et leurs pages sont
accessibles ; toutes les fiches et tous les médias ne sont pas chargés simultanément dans
le monde. Les filtres de visibilité et d’accès public restent détenus par le catalogue serveur.

`world-catalog.ts` ne conserve que les helpers d’URL, de validation des liens et de normalisation
des médias. Il réutilise `catalogPublicUrl` puis `readerAssetUrl`, notamment pour les scans manga
et les anciens chemins wiki. Les textes de l’interface sont dans les dictionnaires français,
anglais et japonais `apps/site/messages/dragon-world/`.

## Sources et continuités

Les ressources sont celles de **Xenoverse 2**, consommées par le moteur Shenron. La page n’est
pas le moteur de Xenoverse 3, ne reproduit pas ses systèmes annoncés et ne prétend pas rendre
les données originales de Xenoverse 3 disponibles.

La [page officielle française de Xenoverse 3](https://fr.bandainamcoent.eu/dragon-ball/dragon-ball-xenoverse-3),
fournie par le propriétaire et consultée le **26 octobre 2026**, présente l’Ère 1000, la ville
Ouest, l’escouade GS et une sortie prévue en 2027. Elle documente ce jeu annoncé ; elle ne
qualifie pas les ressources DBXV2 comme étant des ressources de ce futur jeu.

Les [captures SteamDB fournies par le propriétaire](https://steamdb.info/app/1857810/screenshots/)
et les captures correspondantes de la fiche Steam officielle ont également été consultées.
Elles servent de références de cadrage et de présentation ; les images ne remplacent aucun
maillage, texture ou rendu de décor CPK dans la scène.

Les contenus manga, anime, films et jeux du catalogue conservent leurs continuités respectives.
L’exploration du site ne crée pas une nouvelle histoire canonique. Les noms de lieux et les
identités de stages exigent leurs sources ; un code de dossier CPK ne suffit pas à les déduire.

Le champ de séparation ESK/EMD du NSK est également décrit par le
[chargeur ESK de LibXenoverse2](https://github.com/Olganix/LibXenoverse2/blob/master/LibXenoverse/LibXenoverse/ESK.cpp)
sous le nom `offset_nextPart`. Le parseur Shenron réutilise ses propres parseurs ESK/EMD.

## Qualification et limites

Le relevé public CPK du 26 octobre 2026 a confirmé HTTP 200 pour l’index, avec 3 220 entrées
sous `data/stage/*`, dont 1 179 NSK répartis dans 48 dossiers dans l’archive `data`. Sept NSK
réels ont été lus : leur champ `0x14` concorde avec la signature EMD observée. Les fichiers
et leur manifeste SHA-256 restent privés sous `var/reports/dragon-world/nsk-real/`, hors Git.
Ces observations ne constituent pas un test du rendu complet des stages.

Les tests du parseur couvrent les bornes, offsets observés, signatures, endianness et isolation
des sections. Le test optionnel `SHENRON_REAL_NSK` n’est une preuve sur données réelles que
lorsqu’il est exécuté avec une vraie ressource. Les helpers catalogue vérifient la pagination,
l’encodage, les liens dangereux, la normalisation des médias et la parité des dictionnaires.

La compilation Rust/WASM, les tests natifs sur données réelles, la présence du binding dans
l’artefact servi, la fidélité des textures et transformations, les variantes de stage et le
rendu sur ordinateur/mobile doivent être contrôlés avant d’annoncer leur qualification. Les
preuves de navigateur, de manette, de chargement, d’erreur et de libération GPU vont dans les
rapports privés du lot. Aucun résultat de production, collision du jeu, build vert ou déploiement
n’est déduit de la seule présence du code. La livraison suit les portes du dépôt et Aphrody Infra.
