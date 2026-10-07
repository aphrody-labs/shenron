<!-- SPDX-License-Identifier: Apache-2.0 -->

# Alignement sur Aphrody livré le 7 octobre 2026

Objectif : aligner les dépendances, le runtime, le bureau, les outils et la livraison
de Shenron sur Aphrody `fdd0a036b135497fb36ce278ca0e50707a8e2adc`, puis qualifier
les produits de bout en bout. Ce chantier reste ouvert.

## Écarts du premier audit

Au premier audit, le manifeste Rust de Shenron épinglait `df3ff0dd30d42c83e62ef3016b784b60e2f447ed`.
Ses alias de chat local utilisaient séparément `30b0e8a4147d0d07415ea7b47a458d3772317b4d`.
Le générateur synchronise désormais ces alias lorsqu'on relève la révision ; il
préserve leurs noms, versions, features et noms de packages.

La commande suivante refusait alors le relèvement avant toute écriture :

```sh
bun scripts/build/rust/workspace-deps.ts --aphrody /home/aphro/aphrody --rev fdd0a036b135497fb36ce278ca0e50707a8e2adc --check
```

Les entrées absentes du workspace Aphrody cible sont `aphrody-stdio-capture`,
`koharu-config`, `koharu-diffusion`, `koharu-llama`, `koharu-runtime`, `koharu-torch`,
`rfd` et `tauri-runtime-wry`. Leur migration exige de vérifier les packages
réels et les consommateurs ; les déclarer artificiellement comme dépendances
propres à Shenron ne résout pas leur retrait.

Le nouveau workspace expose notamment `aphrody-ml-config`, `aphrody-diffusion`,
`aphrody-ml-runtime`, `aphrody-torch` et `tauri-runtime-cef`. Shenron Studio
instanciait alors `tauri_runtime_wry::Wry` dans son entrée native.

Le catalogue Bun épingle `@aphrody/m3-reader` à `3.3.4`, contre `3.3.6` dans le
manifeste Aphrody. Vérifier la disponibilité du paquet publié et son contrat
avant de modifier le lockfile. Les autres versions communes inspectées concordent.
Les packages Tauri JS se trouvent hors des répertoires `packages/` et
`m3/packages/` : cette inspection ne conclut pas à leur disparition.

Le CLI installé `/home/aphro/.local/bin/aphrody` expose encore des commandes
retirées du code de la livraison. Ses capacités ne constituent pas une preuve
d'activation de cette révision. Le MCP canonique reste `aphrody-mcp` ; aucune
configuration des anciens alias n'est nécessaire.

## Travail restant

- [x] Synchroniser les révisions des dépendances Rust écrites à la main avec le bloc généré.
- [ ] Migrer et qualifier les contrats ML, capture stdio, Specta et chat local.
- [ ] Migrer Studio vers CEF, son packaging et ses bibliothèques système.
- [x] Relever la révision Rust et régénérer le lockfile en préservant les modifications concurrentes.
- [ ] Vérifier les publications npm, aligner les consommateurs et le lockfile Bun.
- [ ] Vérifier le fork Bun installé, les contrats SDK/FFI et WASM utilisés par Shenron.
- [ ] Aligner les scripts, CI, Docker, installateurs et documentation concernés.
- [ ] Exécuter les portes Bun et Rust sur les cibles concernées, puis les parcours réels serveur, bot, MCP et Studio.
- [ ] Livrer les lots qualifiés ; traiter les changements d'hôtes par le propriétaire Infra.

## Preuves du premier lot

Le 7 octobre 2026 : six tests du générateur et de l'alignement des manifestes
réussis ; TypeScript des scripts, oxlint et format des trois fichiers concernés réussis.
Le lint explicite utilise la configuration du dépôt sans ses exclusions de
`**/build/**`, qui écartent normalement ces scripts.
Le contrôle de dépendances contre la nouvelle révision échoue explicitement sur
les huit contrats cités ci-dessus, sans modifier le manifeste.

Le `Cargo.lock` modifié et `crates/shenron-gpu/` non suivi préexistaient au chantier.
Ils restent hors de ce lot. Le `TODO.md` est revendiqué par un autre agent ; cette
liste porte uniquement le suivi de l'alignement Aphrody.

## Migration Rust en qualification

Les consommateurs ML utilisent les identités `aphrody-ml-config`,
`aphrody-ml-runtime`, `aphrody-llama`, `aphrody-diffusion` et `aphrody-torch`.
La capture stdio utilise `aphrody_backend::stdio_capture`. Les alias temporaires
de chat local sont retirés au profit des dépendances canoniques.
Studio sélectionne `tauri-runtime-cef` et porte `cef_entry_point` pour ses
processus Chromium. La CI installe GTK 4, X11 et xkbcommon.

Le manifeste épingle désormais la révision cible ; le contrôle du bloc généré
réussit. La résolution Cargo du snapshot `aa0395efe4e9` a réussi sur le VPS et
la vérification `check -p shenron-ffi -p shenron-desktop --all-targets`
a réussi en 2 min 12 s (job `2026-10-07T10-07-03-076Z-aa0395efe4e9`).
Les alias de chat ont ensuite été retirés ; le Clippy strict du nouvel état
est lancé. Les tests et la livraison de ce lot restent à qualifier.

Le registre npm public répond HTTP 404 pour `@aphrody/m3-reader/3.3.6` ;
l’épingle publiée `3.3.4` est conservée jusqu’à disponibilité du remplacement.

Le Clippy strict des huit crates modifiées, toutes cibles, a réussi sur le
snapshot `435690da6d17` en 49,85 s. Les tests nextest de ces huit crates sont
lancés dans le job `2026-10-07T10-10-31-763Z-64aaf6beb2df`.
La préparation du lockfile de livraison se fait dans un worktree isolé pour
ne pas commiter la crate GPU concurrente. Le lockfile du worktree principal
contient toujours cette entrée, identique à celle présente avant la migration.

Le lockfile de livraison est maintenant résolu par Cargo : 1 211 packages,
aucune entrée des anciennes crates ML, Wry ou capture stdio. Par rapport au
lockfile qualifié sur le VPS, seule la crate GPU concurrente est retirée ;
aucune autre identité, version ou source de package ne change.
`bun install --frozen-lockfile` a vérifié 990 installations sans modification.

Nextest a terminé avec succès sur `64aaf6beb2df` : 292 tests réussis,
21 sautés selon le profil du dépôt, 32 binaires recensés. La compilation des
tests a duré 3 min 41 s, leur exécution 2,376 s. Le contrôle Windows MSVC
`xwin check -p shenron-ffi -p shenron-desktop --all-targets --locked
--target x86_64-pc-windows-msvc` est en cours sur `832a9ca63455`, job
`2026-10-07T10-15-40-980Z-832a9ca63455`. Le contrôle WASM reste à faire.

L’essai Windows initial échoue dans l’environnement : le volume `/srv` est
plein lors du téléchargement CEF, et cargo-xwin remplace les CFLAGS de cible
sans SSE4.1. Le nouvel essai `afa22061c8c9` utilise, par overrides Cargo du
job, le cache `/home/ubuntu/shenron-build/cache/cef` sur le volume libre et
`env.CFLAGS.value="-msse4.1"` avec `force=true`. Aucun cache partagé n’est supprimé.

La bibliothèque FFI debug du VPS se charge sous Bun local : ABI 4. Les
35 tests réels de `packages/native/test` réussissent (aucun échec), y compris
capture stdout, mémoire par agent, concurrence, annulation et arrêt des workers.
SHA-256 local : `a2d1c7d9a67e078ed5fb12095d83da5874e72e3a1d11983c74e3789dbb6eed5b`.
Il s’agit d’une qualification debug, pas d’un artefact de release installé.

Le runner de bureau passe désormais SSE4.1 à cargo-xwin via les CFLAGS
génériques, en conservant ceux fournis par l’appelant. Le test de sérialisation
TOML, TypeScript des scripts, oxlint et format réussissent ; sept tests du
runner et des générateurs sont verts. Cette adaptation ne concerne que les
builds MSVC croisés, pas les builds Linux ou Windows natifs.

Le contrôle Windows MSVC de la FFI et de Studio, toutes cibles Rust, a réussi
sur `afa22061c8c9` en 3 min 17 s. Le cache CEF dédié occupe environ 595 Mo ;
le volume système garde environ 110 Go libres. Cette compilation croisée
ne prouve pas une exécution sur Windows physique.

Le premier job WASM `37f4aa64abab` est terminé avec code 64 avant compilation :
le routage automatique a choisi dbfr, mais le wrapper ne reconnaît pas
`APHRODY_BUILD_HOST=dbfr` comme hôte de compilation. La porte est relancée
avec `--host vps`, sans désactiver le wrapper ni ses verrous. Cet écart de
routage automatique appartient à Workspace/Infra.

## Session Windows native

Directive propriétaire du 7 octobre 2026 : poursuivre cette session exclusivement
sur Windows natif, sans VPS. Le second essai WASM sur VPS a également terminé
avant compilation (code 64) ; aucun job distant de ce chantier ne reste lancé.

Accès natif vérifié : Windows 11, Rust/Cargo 1.98.1 MSVC, Bun 1.4.2, Git
2.55.0.windows.5, Visual Studio Build Tools 18 et cible wasm32-unknown-unknown.
Le snapshot NTFS contient le code suivi et les modifications de ce lot, sans
base, secret ni store protégé. Les builds sont sérialisés et gardent sccache.
Son port Windows est isolé du serveur Linux relayé par WSL ; l’authentification
Git Windows existante sert les dépendances privées, sans copie de clé.

La configuration Studio retire le bootstrapper WebView2. Le bundler Aphrody
épinglé détecte CEF et copie sa distribution et ses locales ; le packaging et
l’exécution de l’installeur natif restent à qualifier.

Sur Windows natif : `bun install --frozen-lockfile` réussit (953 packages),
sept tests des scripts réussissent, TypeScript scripts et oxlint explicite
rendent zéro erreur. Le format des scripts et de la configuration Studio est
validé ; le document de suivi est formaté avec oxfmt natif.

La porte `check -p koharu-canvas --lib --locked --target wasm32-unknown-unknown`
a réussi en 11,79 s depuis Windows. Exception limitée à cette cible : sccache
0.18 échoue à lancer rustc pour web-sys avec sa longue liste de features ; le
wrapper est désactivé uniquement pour la porte WASM, sans effacer de cache.
Le contrôle MSVC garde sccache, sur le port Windows 4227 forcé par la
configuration Cargo du processus pour éviter le relais Linux 4226 de WSL.

Le contrôle MSVC natif de la FFI et de Studio a réussi en 2 min 27 s ;
Clippy strict, toutes cibles, a réussi sur les huit crates du lot en 1 min 17 s.
LLVM 23.1.3 fournit désormais libclang sur Windows pour les bindings natifs.
Les suites Windows du bot (484 succès, neuf skips) et du site (1 551 succès,
39 skips) ont également réussi avant la mise à jour npm ci-dessous.

La publication Aphrody `4e6f0542a` permet de mettre à jour 14 dépendances
consommées : api, bun-test-dom, discord-kit, http, inference, m3-ai,
m3-primitives, m3-reader, m3-tokens, messaging, paths, plugin-opener,
runtime-sdk et sql. Leurs versions et intégrités ont été vérifiées dans le
registre npm ; `bun install --frozen-lockfile` réussit sur Windows.
`m3-theme@3.3.7` reste absent du registre et non qualifié : Shenron conserve
`3.3.6`. Le pin Rust qualifié reste `fdd0a036b` ; les sources Rust des domaines
ML, IA, Tauri et Infra et leurs manifests n'ont pas changé entre ce pin et
`4e6f0542a`.

La nouvelle crate `shenron-gpu` passe Clippy strict sur Windows, mais sa suite
native garde quatre échecs pour 28 succès : deux attentes sur le rapport de
l'adaptateur NOOP et deux lectures de pixels sur l'adaptateur logiciel.
Ces échecs restent ouverts ; aucune qualification GPU complète ni exécution
de l'installeur Studio n'est déclarée.

Après les 14 mises à jour npm, TypeScript de tous les paquets et des scripts
réussit sur Windows. Le lint global rend zéro erreur (569 avertissements).
Les suites des paquets hors éditeur réussissent ; les chemins URL du lanceur
et de deux suites de l'éditeur sont convertis avec `fileURLToPath`, et les
séparateurs des chemins de locales sont normalisés pour Windows.
La suite UI complète réussit après ces corrections, dont les 13 fichiers
isolés de l'éditeur et les 95 tests DOM.
Les trois contrats d'intégration HTTP passent sans navigateur.
La suite globale des scripts reste à 61 succès et sept échecs dans ce snapshot :
chemins de fichiers privés, fixture SSH de transfert OCR et cinq contrôles
des références ou du packaging du plugin. Ces portes ne sont pas déclarées
vertes ; les essais utilisent des fixtures synthétiques, sans transfert VPS.

Le suivi Windows suivant clôt les sept échecs des scripts : la suite complète
rend 68 succès, zéro échec (1 907 assertions, 18 fichiers). La fixture SSH est
compilée en exécutable natif, ses sorties JSON utilisent de vrais retours de
ligne, et les chemins du contrôle des fichiers privés sont normalisés dans
le test. Le catalogue du plugin comprend ses quatre pages de distribution
OpenAI ; le générateur natif actualise deux empreintes de `faits.ts`, sans
modifier les connaissances générées. Le snapshot matérialise les liens de
fichiers suivis et consulte les métadonnées Git du dépôt pour les tests de
packaging, sans copier de données protégées.

La DLL release MSVC `shenron_ffi.dll` charge réellement sous Bun Windows.
La suite FFI complète rend 35 succès, zéro échec et 115 assertions. Son premier
essai révélait un verrou SQLite au nettoyage : le cache de providers conservait
des références fortes pendant toute la vie du processus. Il partage désormais
les providers actifs avec des références faibles et libère les connexions
inactives. Trois tests Rust mémoire passent en release, dont la libération du
dernier propriétaire, le déplacement de la base sur Windows et sa réouverture
sans perte de données. Le test RSS garde son seuil de 8 Mo et laisse 250 ms
aux heaps des workers pour leur collecte asynchrone avant chaque mesure.
Clippy strict MSVC, toutes cibles, passe pour `shenron-ffi` et `shenron-gpu`.

Les noms de features GPU utilisent maintenant l'itérateur typé de wgpu 30,
au lieu d'analyser son format `Debug` imbriqué. NOOP est correctement décrit
comme CPU, conformément à wgpu-hal 30.0.1. Les tests GPU natifs rendent
30 succès et trois échecs, également reproduits sans parallélisme : WARP
perd le périphérique DX12 pendant les scènes Vello. L'effacement et la lecture
de lignes avec padding sans Vello passent, sans perte de périphérique ni erreur
de validation. La qualification Vello sur WARP reste donc ouverte.

La qualification Next réelle atteint désormais HTTP 200 ; ses sondes ont un
délai de 15 s, inclus dans la limite globale de démarrage de 120 s. La suite
s'arrête ensuite sur la bibliothèque runtime native absente du SDK Windows,
avant les assertions navigateur. Le producteur est construit séparément depuis
le snapshot immuable Aphrody `6135cc4ffa25c971aba29929107a02b19dc85b0f` :
`aphrody-ffi`, profil `runtime`, cible MSVC. Cette DLL canonique exporte l'ABI
Yolo ; ni activation ni qualification navigateur complète ne sont encore
déclarées. Aucun moteur n'est copié dans Shenron.

Les artefacts release Windows `koharu-sdk.exe` et `shenron-mcp.exe` ont aussi
été exercés directement, depuis le dossier de build MSVC, sans installation.
Le SDK répond à `project.list` par une liste vide dans un dossier temporaire ;
le processus termine avec le code zéro. Le MCP démarre sur loopback en mode
public : `/health`, `initialize` (protocole 2025-06-18) et `tools/list` répondent
en HTTP 200, avec un catalogue public non vide. Aucun outil métier ni service
de production n'est appelé. Ce contrôle ne qualifie pas le lancement graphique
de Studio ni son installeur. Les rapports restent hors Git.

La compilation de `aphrody-ffi` termine avec le code zéro. Sa DLL MSVC de
247 048 704 octets charge sous Bun Windows via `YOLO_RUNTIME_LIB` explicite :
ABI 1.5, récupération des paniques active, capacités `system.stats`,
`bench.compute`, `process.supervise` et `http.probe`. Le SDK 0.1.1 lance Bun
en processus supervisé, recueille exactement la sortie attendue et constate
le code zéro. L'empreinte SHA-256 est
`9171579c94dcf7f783999be0eb044fb4125ad2bce3011ae0590976550088ad5e`.
La provenance repose sur le snapshot producteur ci-dessus : son archive Git
ne contient pas `.git`, donc le champ embarqué `git_rev` vaut `unknown`.
Il ne s'agit pas encore d'une activation globale.

Avec cette DLL, le navigateur Windows installé `5bf7eed5a` démarre réellement,
mais échoue au test d'écho WebSocket : zéro upgrade reçu, au lieu d'un.
Le CLI canonique corrigé est en compilation native dans le même snapshot
producteur, sous le verrou Cargo partagé. La qualification navigateur complète
reste ouverte ; les preuves Linux de transport ne qualifient pas Windows.

Le CLI canonique Windows termine ensuite sa compilation en 7 min 30 s.
Sa copie isolée `aphrody-web.exe` est vérifiée par SHA-256 :
`4ff67f94344711212cf31b88fed98b0053a923bcddb5a04438263bef8dab2aad`.
Avec la DLL ci-dessus, l'écho WebSocket Unicode réel passe sous Bun Windows
(un test, deux assertions). La suite Next réelle démarre mais échoue toujours
après 30 s sur la conversation attendue absente du DOM ; ses assertions restent
inchangées. Aucun binaire installé n'est remplacé pendant cette qualification.

Un diagnostic Vello natif sur la RTX 4070, via Vulkan, rend des cibles 32 × 32,
17 × 3 et 65 × 33 : tous les pixels RGBA sont vérifiés exactement, sans perte
de périphérique ni erreur de validation. Cela qualifie ce rendu matériel, mais
ne ferme pas les trois échecs DX12 WARP. Le SDK natif passe également la création
d'un projet Unicode, sa fermeture, sa réouverture dans un second processus et
sa suppression, dans un dossier temporaire isolé.

Le même diagnostic matériel passe ensuite en DX12 sur la RTX 4070. WARP,
lui, reproduit aussi un timeout de lecture GPU de 30 s sur une scène pleine,
puis bloque à la destruction du périphérique ; seul le processus de diagnostic
est arrêté. Aucun repli CPU ni retrait de test n'est appliqué.

Dans le snapshot Windows isolé, un relais borné du WebSocket HMR de Next
débloque la qualification de l'interface réelle. Il distingue les sockets Next
de ceux du chat, conserve les callbacks du propriétaire du chat, relaie texte,
binaire, cookies et sous-protocoles, limite les files à 1 Mo et 128 messages,
et borne l'ouverture amont à 5 s. Trois tests de transport et la suite Next
passent ; 69 tests serveur passent aussi, avec six skips existants. Le contrôle
TypeScript serveur et scripts, le format et le lint scoped passent. La frontière
native WebSocket explicite évite le conflit des déclarations DOM de bun-types.

Le staging ZIP préparé dans ce même snapshot utilise `Expand-Archive` sous
PowerShell Windows plutôt que l'exécutable `unzip` absent du PATH. Les tests
vérifient les chemins Unicode et caractères de shell littéraux, et le refus
d'une archive corrompue. Le runtime llama.cpp épinglé `b11312`, vérifié par
SHA-256, est réellement extrait avec ses DLL ; `llama-server.exe --version`
termine avec le code zéro (build 11312, commit `0c1e57098`). La dernière suite
croisée HMR/Next/ZIP rend six succès, zéro échec et 16 assertions.

Ces deux correctifs source restent uniquement dans le snapshot : les chemins
du frontal et du staging sont encore revendiqués par `desktop-fast-launch`
et `desktop-installer`. Leur coordination a été demandée avant intégration.
Cette preuve ne déclare ni l'installeur complet qualifié ni le relais livré
dans `main`.

Le diagnostic WARP supplémentaire distingue les compilateurs : avec FXC et
un seul thread d'initialisation, les trois images exactes passent. Avec DXC
1.8.2502.11 et ce même réglage, le renderer est créé et la soumission atteint
la lecture GPU, qui expire après 30 s, sans erreur de validation ni perte de
périphérique signalée. Ce réglage ne constitue donc pas un correctif qualifié
et son essai source est retiré. Aucun compilateur ni rendu CPU n'est imposé
pour contourner l'échec.

La suite native complète de 33 tests avec ce réglage rend 30 succès, tandis
que les trois tests WARP ne terminent pas ; son processus identifié est arrêté
après le diagnostic borné. Elle n'est pas déclarée verte. Cette exécution
chargeait le DXC 1.9.2607.0 présent à côté des binaires CEF. Les preuves RTX
4070 restent distinctes de cette qualification logicielle encore ouverte.

Le contrôle croisé suivant impose DXC sur la RTX 4070 : les cibles 32 × 32,
17 × 3 et 65 × 33 passent avec tous leurs pixels exacts, d'abord avec DXC
1.8.2502.11 du SDK Windows, puis avec DXC 1.9.2607.0 livré à côté de CEF.
La seconde configuration passe également avec l'initialisation par défaut
(`num_init_threads = None`), sans coarse stages CPU. Chaque processus supervisé
termine avec le code zéro. Cela qualifie ce chemin matériel DX12/DXC et confirme
que le réglage retiré n'est pas nécessaire pour ces scènes sur la RTX 4070 ;
cela ne qualifie ni WARP ni l'application CEF complète.

Le lancement natif de `shenron-desktop.exe` présent sur Windows est ensuite
testé contre un serveur HTTP loopback synthétique. Après 10 s, puis lors d'un
second essai de 30 s avec capture des traces, la fenêtre `Shenron Studio`
possède un handle non nul et répond. Le serveur reçoit `/robots.txt`, mais
aucune requête de page `/` : la navigation n'est donc pas qualifiée. CEF
signale `Timeout of new browser info response for frame`. Les processus
supervisés sont terminés après chaque essai.

Les variables de processus `APPDATA` et `LOCALAPPDATA` ne constituent pas
une isolation du profil CEF sur ce poste : la résolution native conserve le
cache de l'application sous le dossier utilisateur Windows. Aucun profil,
cookie ou store existant n'est supprimé. Les prochains essais doivent utiliser
un chemin de cache explicite du runtime. Aucun `shenron-server.exe` n'étant
présent à côté du binaire inspecté, cette preuve ne qualifie pas non plus le
paquet autonome complet ni son installation.

Un binaire CEF de diagnostic distinct compile ensuite nativement avec
`custom-protocol`, sans Koharu, un identifiant Tauri distinct et
`Cef::root_cache_path` explicite. La distribution réutilisée correspond à CEF
152.0.6 / Chromium 152.0.7977.83. La trace confirme le cache temporaire ;
le refus DevTools observé dans l'essai précédent ne se reproduit pas.
Cependant, la fenêtre réactive ne navigue toujours pas après 30 s et les
timeouts de frames persistent. Le lancement direct via Bun reproduit le même
résultat que la supervision SDK : les deux processus sont arrêtés avec leurs
enfants. Ces contrôles ne prouvent donc ni une cause DevTools unique ni une
cause liée à la supervision, et ne qualifient pas le démarrage complet.
Le diagnostic reste dans le snapshot Windows, sans remplacement du binaire
Studio installé ni modification de sa politique DevTools.

L'instrumentation suivante écrit uniquement dans le cache temporaire des
marqueurs d'entrée des helpers : GPU, renderer et utility entrent effectivement
dans le binaire Rust. Une variante de diagnostic utilise ensuite directement
`cef_execute_process` sans handler IPC Tauri, avec les signatures et le layout
Windows vérifiés dans les headers de la distribution CEF. Elle reproduit
également le timeout de frames et l'absence de navigation. L'absence d'entrée
du helper et le handler IPC ne sont donc pas des explications suffisantes.

Le suivi WMI des sorties est indisponible sur ce poste. La capture de handles
des seuls processus de diagnostic confirme leur terminaison après l'essai ;
les codes lus après nettoyage ne permettent pas d'attribuer un crash naturel
au renderer. Les marqueurs utility observent des retours CEF zéro. Cette
variante sans IPC reste un diagnostic temporaire, pas un remplacement du
contrat IPC de Studio.

Le diagnostic Alloy avec le helper Tauri habituel ne rétablit pas la navigation :
le processus quitte avec le code zéro avant la fin de l'observation de 30 s,
et seule la requête `/robots.txt` est reçue. Ce style n'est pas livré comme
correctif.

L'inspection native, en lecture seule avec 7-Zip 26.03, trouve toutefois un
installeur NSIS de 545 326 277 octets dans les sorties de build. Son SHA-256 est
`a4ebb5bd4ae94fcfa6781749f3480a91b8f74c756ed1462b8bcb5507e88980df`.
Il contient bien Studio, CEF, `shenron-server.exe`, `shenron-mcp.exe`,
`koharu-sdk.exe`, le runtime llama et les ressources modèle. L'absence du
serveur près du binaire brut inspecté précédemment ne concerne donc pas ce
paquet. Cette inspection ne vaut pas installation ni activation.

Les trois sidecars sont extraits dans un dossier de qualification distinct ;
le serveur emballé (180 719 616 octets, SHA-256
`37334d71f9be00b927bc0bda308057d898e46d859915333758af1d8eef49cbf2`)
répond à `--help`, puis démarre réellement avec un `SHENRON_HOME` temporaire,
un profil desktop, sans PostgreSQL et avec un endpoint chat synthétique pour
éviter toute acquisition de modèle. Le payload embarqué s'extrait en 2 063 ms
et le site devient prêt en 2 858 ms. `/api/local/health`, `/robots.txt` et
`/desktop` répondent 200 ; le HTML desktop contient Shenron (118 344 caractères).
Les lectures thème et wiki sans base rapportent leur repli sur les défauts.
Le processus supervisé et ses enfants sont arrêtés après la vérification.
Cette preuve qualifie ce lancement HTTP/Next du serveur emballé, pas les
fonctions de chacun des groupes annoncés, l'inférence, CEF ou l'installeur
de bout en bout.

Les sidecars extraits de ce même NSIS sont également exécutés réellement.
`shenron-mcp.exe` sert un health loopback, répond en HTTP 200 à `initialize`
(protocole `2025-06-18`) et à `tools/list` avec son catalogue public non vide.
Aucun outil métier n'est appelé. `koharu-sdk.exe` passe `project.list` à vide,
puis la création, fermeture, réouverture dans un second processus, suppression
et liste finale vide d'un projet Unicode. Les projets vivent dans un dossier
temporaire ; ce contrôle utilise explicitement le mode CPU du SDK et ne
qualifie pas son rendu GPU. Les processus terminent et les fixtures temporaires
sont retirées après la vérification. Ces preuves portent sur les binaires
emballés, pas seulement sur les sorties Cargo brutes.

## Correction de la navigation CEF au démarrage

Le diagnostic Windows du 7 octobre identifie une course entre `navigate` et
l'acquittement des scripts document-start : l'URL initiale du splash pouvait
remplacer la navigation explicite vers le serveur local. Aphrody corrige ce
comportement dans `7daf113b06c0c86dded6ec8ca5a7fe1971b1febf`, commité et poussé
sur son `main`. Le runtime conserve la dernière URL demandée jusqu'à la
consommation du chargement initial par la tâche UI CEF, puis reprend les
navigations directes. Les règles de permissions et de sandbox sont conservées.

Les 88 tests du runtime, dont trois régressions dédiées à cette course, passent
nativement sous Windows ; Clippy strict passe également. Un binaire de diagnostic
Shenron est ensuite reconstruit depuis cette révision Git, sans patch local du
runtime. Avec un identifiant distinct, un cache temporaire explicite et sans
Koharu, il charge la page loopback, lit son DOM en JavaScript et appelle
`/cef-ready` ; la fenêtre est réactive. Les timeouts CEF de certains frames
restent dans les traces, mais n'empêchent pas cette navigation. Cette preuve
qualifie la navigation isolée ; elle ne qualifie pas encore le lancement complet
du Studio ni l'installation ou l'activation de l'installeur Windows.

La préparation des pins consommateurs dans le snapshot NTFS révèle aussi que
le générateur Cargo doit normaliser les séparateurs Windows avant de retirer
`Cargo.toml` du chemin des crates locales. Ce défaut est corrigé dans
`scripts/build/rust/workspace-deps.ts` ; génération puis `--check`, TypeScript,
oxlint, oxfmt et les deux tests des pins passent sous Windows.

Les pins consommateurs sont ensuite intégrés sur Aphrody `7daf113b0` après
`check`, puis Clippy strict avec `--all-targets`, de Studio, FFI, MCP et
`koharu-library`, avec les fonctionnalités par défaut, sous Windows MSVC.
Les 24 tests Rust FFI passent, dont la persistance mémoire, la libération du
SQLite et le passage par l'ABI C. `koharu-canvas` passe aussi `check` pour
`wasm32-unknown-unknown` depuis Windows, avec le contournement sccache WASM
déjà documenté. Linux n'est pas relancé dans cette session dédiée à Windows.

Le lockfile produit par Cargo conserve les versions des 1 212 paquets. Il
remplace les 46 sources Git Aphrody et résout la dépendance Windows de
`gio-sys 0.22.9` vers `windows-sys 0.61.2`, déjà présent, au lieu de `0.52.0`.
Les autres entrées sont conservées ; aucun patch local du runtime CEF n'est
livré dans Shenron. Les binaires NSIS qualifiés précédemment restent ceux
de leur preuve datée : ces nouveaux pins ne constituent pas une installation
ou une activation du Studio reconstruit.
