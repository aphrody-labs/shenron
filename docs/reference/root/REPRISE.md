<!-- SPDX-License-Identifier: Apache-2.0 -->

## 2026-10-15 — Refonte Canon, agents wiki et plugin Aphrody

Le propriétaire ajoute une refonte Canon moins verbeuse, plus illustrée, facile et
interactive, puis une automatisation du remplissage wiki avec de nombreuses sessions
Codex gpt-5.6-luna et l’installation du plugin/MCP Aphrody. Catalogue modèle local
daté : gpt-5.6-luna réellement disponible. Smoke réel sur Finalflash : deux sessions
indépendantes writer/reviewer, modèle exact, sorties JSON validées ; proposition
non publiée. Inventaire : 37 tables, 10754 lignes visibles, 108 contenus vides ou
provisoires. Campagne bornée/reprenable et découverte de sources officielles en cours.

Aphrody installé via marketplace privée aphrody-user, version2.2.1, activé,47skills.
Le premier cache ne contenait que le manifeste : sousmodule source f5802d3a récupéré
avec transport Git HTTPS authentifié puis installation refaite. MCP global aphrody
stdio configuré ; initialize/tools-list réel341outils et appel aphrody_home_status
profiledbfr isError=false. Aucun secret ajouté au dépôt. Reçus privés environment-20261015.

Canon : sauvegarde admin stricte/CAS atomique et historique doctrine ; 0e8bf804,
3d42549e, aa6240b0, fixturePG d4715a16. PostgreSQL18.1 isolé8tests/33assertions verts,
concurrence, rollback et précisionmicroseconde réelle, sans toucher production.
Nouvelle UI en revue finale avant image commune ; les captures preview ne qualifient
pas PostgreSQL du site. Le SELECT readonly réel des compteurs donne4827références,
15776planchesdatabooks,12199transcriptionsmangaréférencées visibles,329tomes,
922chapitres,875épisodes,672personnages. VFSlocal explicitement distinct du RAGlive.

Trois scans acquis :11-28/4-104 relus visuellement, deux bulles corrigées en seconde
lecture indépendante ; JA et FR privés prêts.18-13 seulement452x640, lecturecorps
non qualifiable, aucune réécriture. Dépôt des deux corrections attend image active,
snapshots frais et CAS ; flags de vérification conservés, sfxillisible signalé�.
Aucun OCR ni contenu wiki nouveau déclaré publié à ce stade.


## 2026-10-15 — Canon et agent home DBFR

Demande explicite : lire API canon, pages publique/admin, données et mémoire Aphrody
agent home DBFR puis décider seul. Lecture de AGENTS/SOUL et notes de doctrine sous
/home/ubuntu/.aphrody/workspaces/dbfr ; priorité confirmée manga, scans japonais et
déclarations attribuées de Toriyama, aucune extrapolation. API : 4827 références
visibles (877 manga, 3870 databooks, 80 Aphrody), 47 sujets avant correctif. Doctrine
générale, libellés de rangs et fiches contradictoires ; pas de réécriture globale.
e09b8fd3 respecte les suppressions admin et le power scaling désactivé (37 tests,
154 assertions). b5b9cff4 distingue SSJ4 GT/DAIMA, notice officielle du 22 janvier 2026
01_3980, sans classement de puissance universel (43 tests, 176 assertions). Source
poussée, pas encore appliquée à la doctrine PostgreSQL. Sauvegarde optimiste et
compteurs réellement mesurés en cours. Transcriptions suspectes 11-28, 4-104, 18-13 :
lecture du scan nécessaire avant correction ; pas de substitution automatique.

Compute/E5 restaurés via Infra, index actif intégralement vectorisé. Retrieval
172 cas : Recall@5 78,49 % sous seuil 80 %, Recall@10 83,14 %. Doublage/lieux/musique
attendus mais absents du retrieval sont masqués à la source et dans l’index ; ne pas
les réactiver sans revue. Ancien chat non borné : 9 timeouts et un refus sur 10 cas,
évaluateur arrêté seul. 29e37e3d transmet le budget public de 256 tokens au provider
réel ; nouvelle image nécessaire avant évaluation. Build e09 sur fabrique en cours,
aucune nouvelle activation annoncée. Rapports privés var/reports/readers-20261015/
et rag-audit-20261015/. Prochaine étape : livraison puis relecture, lot canon protégé
et corrections visuelles bornées.

## Contrôle du 15 octobre 2026 — synchronisation lecteurs, thème et RAG en livraison

Sources poussées : 2993ceb5 aligne les ressources manga des agents sur le lecteur et
préserve les couvertures numérotées000 ; a831eaa4 conserve la page databook entre
modes, y compris après mesure des images. Preuves Bun WebView sur pages2/10 à390/1280
et reprise de la molette ; les31tests API/manga et22tests DOM lecteur sont verts.

3266dc5d expose22couleurs et cinq réglages de thème, sauvegarde relue séparément ;
PostgreSQL18 isolé qualifié. Contrat config792751f, intégrant le commit upstream
Jev4dee0c0. a80541b4 remet le neutre, retire les vidéos de fond de l’accueil et les
transitions de téléportation. Une boucle de variables M3/DBZ était réellement visible
dans le navigateur ; le générateur réserve désormais Beerus à un choix explicite.
Prévisualisation Next réelle sur fabrique,390/1280 :22tokens résolus, fond#101010,
surface#191919, texte#ededed, zéro vidéo et zéro requête média parmi141requêtes ;
molette et tactile fonctionnent, pas de débordement. Les panneaux dépendant de
PostgreSQL sont absents de cette preview sans base : leur contenu n’est pas qualifié.
Le parcours admin navigateur et le déploiement restent à terminer.

RAG : f390898f fiabilise l’évaluateur ;52ce784f retire le contexte agent_home du
retrieval public ;617e722f branche la recherche et le chat natifs sur le même index
éditorial quand RAG_BACKEND=aphrody, avec injection au consommateur et profil offline
conservé.368tests API/server verts,8ignorés explicitement. L’évaluation live initiale
a20/20erreurs500 : compute8789 absent, aucune fidélité chat prouvée. Le corpus actif
manga/databooks/wiki et ses vecteurs sont présents ; aucun rebuild aveugle exécuté.
Restauration compute/E5 via Infra en cours, modèle E5 vérifié ; image attend le verrou
de fabrique détenu par un travail Cargo actif, sans arrêt ni contournement.

Audit :42URL crawlées ;2582pages HTTP contrôlées. Audit des68988images encore en
cours ; ne pas convertir ces sondes en preuve de lecture.428notices databook API
contre417dans la rubrique :11interviews/paroles sont exclues par politique, dont
six ont des scans. Six ouvrages inclus restent sans scan ; ne pas confondre ces
ensembles. La campagne officielle native rendue a paniqué chez Aphrody ; collecte
Bun WebView privée et bornée en repli, sans publication ni indexation implicite.

8a4f871e permet les snapshots SHA atomiques wiki ; trois descriptions encyclopédiques
sourcées sont prêtes, non appliquées avant activation. ef1ca2b7 initialise les
sousmodules avant installation distante ;221541b4 charge la configuration canonique
du lint Bun. Le propriétaire impose bun check, bun lint, bun fmt et bun n2b ;
tsc et oxlint sont bannis. Portes globales check/lint et dérives OpenAPI/tokens/IA
vertes à ce stade. Réemploi natif de l’image active88ac qualifié par arbres Git
identiques, SHA des artefacts et ABI5 stricte ; prochain build Next/Bun sur fabrique,
image scellée puis activation Infra DBFR, avant toute annonce de livraison.

Rapports privés : var/reports/readers-20261015/, reader-mode-preview/,
wiki-fill-20261015/ et rag-audit-20261015/.

## Contrôle du 15 octobre 2026 — livraison accueil et GIF

Release active DBFR `docker-88ac0d23`, qui contient `7bd95e65` ; `/api/health` 200.
`/`, `/wiki/episodes`, `/wiki/sagas`, `/wiki/episodes/875` et `/wiki/gifs` en 200 ;
`/wiki/arcs` 308 vers `/wiki/sagas` et un détail d'arc inconnu en 404. `/api/gifs` sert
la révision `53dbaf71…` : cinq GIF ; les cinq aperçus correspondent à leur SHA, et les cinq
téléchargements `/api/gifs/<clé>/download?revision=…` répondent 200 en GIF89a avec taille
et SHA conformes. La page liste ces cinq liens. L'index `catalog/gifs/index.json` du CDN
répond 404 ; le site lit l'index par épisode. La prochaine image commune reste coordonnée
avec le Codex dashboard (revendication `dashboard-factory`) ; aucun build lancé.

Rendu Bun.WebView 1280/390 sur `/`, `/wiki/episodes`, `/wiki/sagas` et `/wiki/episodes/875` :
aucun débordement horizontal ni image cassée. Accueil sans menu d’ancrage, bloc univers,
reprise ni promotion Beerus ; le héros tient au-dessus du serveur en direct. Hauteur du héros
du catalogue : 375 px à 1280 et 220 px pour les sagas ; frame HD 1920×1080 et visuel
3000×1681 rendus sur la fiche 875. Captures privées dans `var/reports/home-check-20261015/`.

## Contrôle du 13 octobre 2026 — accueil, frames et corpus vidéo

Sources `7bd95e65` poussées : retrait demandé du menu d'ancrage, du bloc univers et
de ses sept lectures de comptage, de la reprise sur l'accueil et de la promotion
Beerus. Les contenus éditoriaux restent, avec un lien GIF. Le wildcard des détails
`/wiki/arcs/:path*` qui masquait les fiches et les 404 par une redirection vers le
catalogue est retiré ; le seul index `/wiki/arcs` reste redirigé vers `/wiki/sagas`.
Tests ciblés : 23 réussis, 13 volontairement ignorés ; typecheck du lot vert.
Le publisher de récupération qualifie uniquement une liste explicite et bornée,
sans annoncer la qualification du manifeste historique complet : 10 tests et
104 assertions réussis. Cette nouvelle source n'est pas installée pendant le
transfert GIF en cours.

Production : application `62ff9387`, lecteurs livrés et CDN natif readonly sur9077.
L'image suivante est coordonnée avec le Codex dashboard après ses correctifs
Canvas ; aucun build concurrent ni activation de l'ancienne image14ad. Le dernier
retrait accueil et le correctif des arcs ne sont pas encore servis en production.

Épisode875 : une mutation canonique des seules six frames, revision
`dk8k2a78s52n21uo1mixutdi`, suivie d'une relecture indépendante des26champs ; les
autres champs sont inchangés. Les six PNG1920×1080 sont vérifiés par SHA sur les
deux origines publiques. Aucun titre, date, langue ou droit non établi n'est ajouté.

Corpus privé physiquement déplacé dans `C:\shenron\data\source-acquisition\episodes\beerus-01` ;
son ancien chemin BunVideo est un lien symbolique vérifié. 34 827 fichiers conservés,
dont33 511 PNG originaux ; 46 422 019 042 octets de doublons supprimés après
comparaison complète, archives incluses. Compression LZX de460textes :
88 951 284 octets alloués gagnés, SHA logiques inchangés. Le corpus complet reste
privé ; il ne constitue pas une publication R2. Les cinq GIF et cinq aperçus sont
en qualification publique séparée ; index qualifié et validation page/API restent
à terminer. Preuves privées dans `var/reports/beerus-full-intake-20261013/` et
`var/reports/episode-875-final-data-20261013/`.

## Contrôle S3 et robots — 11 octobre 2026 après 18:50 UTC

`S3Client` est natif dans Bun1.4.4 local/VPS et Bun1.4.3 DBFR ; Shenron utilise déjà
le client natif dans le propriétaire de transfert S3/R2. Aucun SDK/package manquant
constaté dans le crawl, packages/media ou les scripts de transfert. Le profil protégé
shenron-cdn reste géré par le renouvellement Infra. Les403 S3 ne prouvent pas une
dépendance manquante : robots officiel renvoie une réponse Amazon S3 AccessDenied.

Commit ed0763a9 traite selon RFC9309 §2.3.1 les réponses robots 4xx comme ressource
indisponible, 5xx/réseau/429 comme origine inaccessible, et suit les règles parseables
en 2xx. Tests15/73, TS scripts, lint et format verts ; capture VPS terminée :4 pages
officielles200,147assets inventoriés, officiel robots403 explicitement consigné.
Le crawl reste partiel : robots403 source, contenu dynamique potentiellement absent,
aucune preuve de backend interne, et actifs vidéo protégés exclus. Une nouvelle
synchronisation périodique tourne ; son premier reçu reste à vérifier.

## Contrôle du 11 octobre 2026 — reprise après 18:37 UTC

88d8b22a/c4bf8486/ed0dc365 poussés : sitemaps privés bornés et reçus de progression,
identifiants opaques des actualités officielles préservés. Tests du crawl :12tests,
58assertions verts sur Windows et VPS Bun1.4.4. Sync précédente arrêtée proprement ;
`shenron-source-sync-ed0dc365` et PID1993868 confirmés vivants. Premier reçu
18:36:26–18:37:23UTC : success,21enregistrements incomplets,6sitemaps restants,
10URL listées ; completeCoverage=false, aucune publication publique ni indexRAG.
Le compteur réseau sitemaps4233438octets dépasse la limite4194304 d'un chunk reçu :
ne pas présenter ce reçu comme une couverture complète ou un budget réseau strict.

Infra324cd0e0 poussé et intégré au VPS : reconnaissance qualifiée du superviseur
détenant le verrou,19tests/87assertions Linux verts. Ancien build10e terminé1 après
arrêt du seul verrou imbriqué bloqué. Fabrique `shenron-build-ed0dc365` confirmée
vivante, suites UI en cours ; aucune nouvelle image activée. Deux propositions CMS
OP/ED et interview revalidées, non publiées : quatre credentials existants répondent401.

## Contrôle du 11 octobre 2026 à 18:31 UTC — Bun et fabrique

8ac6a49c/a7ab9972 poussés : check:native, lint:native et format:native:check,
runtime absolu SHENRON_BUN_EXECUTABLE et PATH enfant conservant les outils existants.
Windows1.4.4-canary.1+2ae8fc65f qualifié sur19projets ; défaut System32 reste1.4.3.
Les portes TypeScript7/oxlint/oxfmt restent canoniques ; format natif complet non établi.

Fabrique901cb r2 : TypeScript/lint verts, fixture payload filtrée par umask077.
a1928ec7 corrige la fixture sans changer l'extraction ; preuvesLinux0755/0700 vertes.
Fabriquea192 : compteur i18n et bibliothèque shenron-re absente avant tests.
10e90f77 corrige les textes (8tests/14assertions) ; job shenron-build-10e90f77
relancé avec compilation RE avant les tests, actuellement en attente du verrou Infra.

Infra659d4325/d348faae poussés : staging public/CDN, union des chunks et montage readonly,
scellement limité cdn/_next/static ;12tests Linux sous umask077 verts. Helpers pinnés
sur DBFR ;365anciens fichiers statiques copiés et vérifiés SHA dans un staging privé.
Aucune nouvelle image activée. Sync privée : deuxième reçu18:19:41–52UTC success,
17captures incomplètes et completeCoverage=false ; le robots officiel reste refusé.

## Contrôle courant du 11 octobre 2026 à 18:04 UTC

Lots crawl dab40428/a047a780 puis a6141989 poussés : routes updates avec identité query,
srcset/CSS, règles robots spécifiques/Allow et redirections approuvées ; inventaire
passif avec provenance, delta et index SQLite privé. Script Crunchyroll90632247 poussé,
Chrome154 réellement lancé ; aucun formulaire/lecteur accessible en90s, connexion et
lecture non établies, aucun média synthétique ni manifeste protégé utilisé.

Collecte réelle via Infra VPS vps-203bea89 : runtime propriétaire
`/home/ubuntu/build/artifacts/bun-os-20261011-105ac20a30d6/bun`, version1.4.4 dfde053a3,
SHA256890af6a675e1dc58b15a15777c53de3b2e82668690c9be5f6e87ec690246ac0e.
Les APIHTMLRewriter/CryptoHasher/WebView sont réelles ; Bun.Chromium reste absent.
Code scellé du job dans le profil privé dbfr, tools/shenron-beerus-a6141989/scripts/data :
crawlSHA0c8143071efc5b3ba93a70cd95adfe05085df91a377c021e3791fcd8815571a5,
runnerSHA5d2becfc63f4e644f60fcd7e7d99a2a658b4f82e69dee5fed280e296121edb8b.

Tmux `shenron-source-sync-a6141989`, PID1920776 confirmé vivant après première exécution.
Profil privé `/home/ubuntu/.aphrody/profiles/dbfr/corpus/beerus-sync-a6141989` ;96runs
maximum, intervalle900s après fin, verrou exclusif `.sync-lock`. Premier run daté
18:04:22–18:04:41UTC :2pages/86assets/7920005octets,70assets200/16erreurs,
robots officiel403. Reçu success mais completeCoverage=false,17capturesincomplètes.
Index88captures/1document, FTSBeerus1 et quick_checkok ;240références
(104assets,133liens,2formulaires,1sitemap). Delta0ajout/17SHAchangés/0nonobservés/
17indisponibles ; un SHA changé ne prouve pas changement éditorial.

Le corps officiel EN reste hors crawl à cause du robots403 ; aucune couverture globale,
sync temps réel garantie, schéma backend tiers, indexRAG, SQL/Redis public ou bascule CDN
n'est déduit de ce lot. L'accès recherche ponctuel au site officiel confirme épisode01
The God Who Destroys et les liens OP/ED ; cette lecture distincte ne remplace pas un miroir.
Prochaine étape : deuxième reçu périodique, couverture officielle autorisée et qualification
de la fiche épisode/source puis fabrique scellée, sans inventer la lecture fournisseur.

## Contrôle courant du 11 octobre 2026 à 16:08 UTC

Historique du lecteur HLS avant migration vers `@aphrody/bun-video` : livré par3cd7e7f7,
image scellée7483424f333b2e49421c326dc9c417275a65b3d93f60fb12a26f7c0b7fcf22ed,
archive01b268810ac73455d44f4703fec63a2b42d49221ffae5db53978a3468482fa42,
payload50d2ea50902cd9b9 et BUILD_IDifxzM_OA0JR-Ybu2lU__L. Activation et rollback
docker-70taouw0 vérifiés. Linux3890tests+74ignorés préexistants, zéro échec ; scripts129tests.
Quinze vues navigateur1280/640/390 sans débordement, santé/chat/catalogue verts.
Les niveaux HLS, deux pistes audio, sous-titres, PiP/fullscreen et reprise sont vérifiés
sur média synthétique ; aucune lecture d’épisode tiers n’est déduite de ces contrôles.

Fork aphrody-labs/hls.js épinglé8ca90a84,1202tests navigateur sans ignorés ni échec.
@aphrody/hls.js1.7.3-aphrody.1 et @aphrody/bun-runtime-sdk1.4.5 publiés ; archives,
registry et consommateurs frais vérifiés. SHA1 respectifs4c5a715c650713b22c3d2735c65a2a1732b3b4ba
et399ef75be407099b7e598ecfdd1b1c922faaa2fd. Wrapper Bun vidéo privé1.4.4 qualifié.
La CI publique HLS refuse encore le runtime installé1.4.3 ; la fabrique utilise un1.4.4
réel. Aucun gain de performances ni toutes les fonctions DRM n’est revendiqué.

R2 delta3cd7 :110599routes/87716corps,224nouveaux corps et256shards S3GET/SHA vérifiés.
Les224HEAD taille/SHA et224GET corps/SHA via Worker passent. Inventaire
0080e757cc4ecbc0bf5cab0611630e2ccf6298f7a85a154f64f8ca25ebed05b2.
Workerac3ddcb702684b109ae46213f3f35f40, import=false/verify=false, anciens chunks conservés.
La sonde Worker /health est distincte du relais /api/health vers l’origine dédiée non qualifiée.
Retrait DS/TTL, délégation et TLS restent nécessaires ; aucune route CDN du domaine activée.

Extension propriétaire : trois vidéos originales, plugin/MCP et Omar. Transport MCP/skills
a8bad28d poussé,56tests Rust et Clippy strict verts ; backend/rendus pas encore livrés.
Omar-rt joignable, Bun1.4.4 et RTX4060/8188MiB réels ; train/OCR absents du binaire Aphrody.
L’inférence existante et les stores privés sont préservés. Contrat train propriétaire marque
artefact/dataset/qualification/promotion faux ; aucune exécution d’entraînement inventée.
Nouvelle priorité explicite : audit réel page DBS et accueil, présentation Beerus sourcée,
corrections UI/backend puis image scellée et contrôles de production.

## Contrôle courant du 11 octobre 2026 à 14:54 UTC

Sept synthèses Beerus et cinq notices sources sont publiques. Redis DB4 contient 21 articles
avec TTL de 24 heures via son writer réel. PostgreSQL contient 45 927 références et autant
de provenances. Les captures complètes restent privées ; droits RAG, entraînement et images
refusés, aucune promotion canonique. Crawl : cinq pages, 132 assets, 17 erreurs conservées
et robots officiel HTTP 403. Huit fragments dynamiques ont été capturés séparément en privé.

ADN, plan frais V2 : 847 disponibilités actualisées et sept inchangées ; replay sans écriture,
854 valeurs identiques. Relecture indépendante : 874 épisodes et 28 films avec JSONB array,
826 offres épisodes et 19 films positives ; autres colonnes inchangées. Deux NULL films
normalisés en tableaux vides sans offre. L'incident V1 du 11 octobre, 14:41–14:44 UTC, a été
restauré depuis la sauvegarde avant correction par postgres.js tx.json, probe array et contrôle
RETURNING. Ce lot ne prouve pas la lecture ; Beerus ADN 1432 avait zéro vidéo à 14:30 UTC.

Image 19f503de scellée et active depuis 14:48 UTC :
`085a402d4cff27fcd433f7c4e311973cf74719bd8bb9d50bbfc896450e651f86`.
Archive : `ae0de47736b65e6adb4910d2afdc19b5517f1ce1732509f5ad414c30f5f5c830`.
Payload `7825d3a56d2bb4b2`, BUILD_ID `rX5yZukHDdATmHVne1jy9`, rollback 03f `docker-iafam92z`.
Linux : 3 887 tests verts, 74 ignorés préexistants, zéro échec ; scripts : 117 verts.
Santé, chat et pages qualifiés. Recherche Beerus : total 46, limit=2 IDs 445/446,
offset=2 IDs 447/448. Correctif lecteurs c22923ce actif. Navigateur : quinze vues à
1280/640/390 sans débordement ; images épisode 23/23, film 3/3, news 13/13.
Les lecteurs tiers étaient bloqués ; aucune lecture de flux externe n'est revendiquée.
Bun.WebView fonctionne ; Bun.Chromium et Bun.Video sont absents.

R2 : 110 372 routes et 87 492 corps ; 34 nouveaux corps dont 28 images officielles.
256 shards vérifiés par S3 GET/SHA ; 34 HEAD taille/SHA et 34 GET corps/SHA verts.
Range 206/16 octets, conditionnel 304, privé 404, santé 200. Inventaire :
`c26d443aed5d308734f5f182339253279f1e256a12243e01d0b270c05c786f0c`.
Worker `5660aa8ae0634cecbf6ca32bafc1971a`, import=false et verify=false, anciens chunks conservés.
Zone Cloudflare pending à 14:48 UTC, DNSSEC Cloudflare disabled. Retrait DS/TTL, délégation
et TLS restent à qualifier ; aucune route CDN du domaine n'est déclarée active.

Douze paquets npm 1.4.4 et neuf crates 1.4.4 publiés avec archives et consommateurs qualifiés.
Pipeline 1.4.5 publié aussi : SHA1 local/registry/download identique,
`85f26a830aa9e99010431fa7b731333f11063d0c`, consommateur frais 42 paquets, frozen/imports/CLI verts.
Scope npm @aphrody, organisation contrôlée aphrody-labs, équipe aphrody ; OAuth ownership
crates reste limité. Plugin sync.ts --check et relevé registry passent. Automation existante
active toutes les quinze minutes, notifications seulement sur changement utile.

Demande supplémentaire du propriétaire à 14:54 UTC : compléter le lecteur vidéo en comparant
packages npm et crates Rust via Context7. L'agent lecteur prépare clavier focalisé, états/retry,
vitesse, pistes et qualité réelle, fullscreen/PiP conditionnels. Ce nouveau lot n'est pas encore
activé. FFmpeg appartient déjà à Aphrody ; aucune seconde ligne ABI n'est ajoutée sans besoin.
Les onze lots initiaux restent partiels ou manquants ; catalogue et rollback sont préservés.

> Lu au démarrage de chaque session (hook `scripts/dev/session-start.ts`).
> Référence canonique et unique de planification : [PLAN.md](PLAN.md).

## Chantiers Actifs en Cours

1. **Reverse Engineering Dragon Ball (`shenron-re`)** :
   - Consolidation du décodage CPK, CRILAYLA et formats de combat Dimps (BAC/BDM/CUS/PUP/MSG) [x].
   - Pipeline WASM/TypeScript opérationnel (20 tests Rust + 9 tests WASM validés).
   - 2026-10-10 : fusion de rescue/vps-home-shenron sur main (1874f332), extraction CPK/EMB et validations Xenoverse 3 conservées ; tests shenron-re natifs Windows verts (53 unitaires + 5 CLI).
   - Raccordement des données de techniques extraites au VFS et à l'API publique.
2. **Entraînement Continu Shenron Chat (`shenron-chat-v2`)** :
   - Exécution itérative de `scripts/ops/train-shenron-chat-loop.ts` sur les 1 495 rollouts partitionnés.
   - Suivi du Recall@5 sur les 1 091 cas cibles gold sans fuite de données.
3. **Packaging Shenron Studio (Tauri 3 / CEF)** :
   - Signature, détection dynamique des cibles GPU (CUDA/WARP) et qualification de l'installeur NSIS.
4. **Surveillance Production & Qualité** :
   - Maintien des gates vertes (`bun run typecheck`, `bun run lint`, `openapi.ts --check`).
   - Vérification continue de la santé de `https://dragonballfr.com/api/health` et de l'Agent Card A2A 1.0.
   - Prod Docker (2026-10-08) : builds sur le vps seulement, dbfr reçoit l'image scellée ; pile locale `compose.complete.yaml` alignée (pgvector pg18, passerelle compose, bot opt-in `--profile discord`), sondes 200. Le 2026-10-10, correction soft-404 poussée sur main (e456b096) avec sonde de release 404 ; la production restait à redéployer (slug absent encore en 200 lors du contrôle). Débit du LLM à requalifier.
5. **Conteneurisation Complète DBFR** :
   - Conteneur unique tout-en-un (`deploy/docker/all-in-one/`) et pile Compose (`deploy/docker/compose.complete.yaml`).
   - Intégration des secrets Aphrody (`scripts/ops/container-secrets.ts`), initialisation DB/migrations (`scripts/ops/container-db-init.ts`), surveillance OVH (`scripts/ops/ovh-shenron.ts`) et CLI unifié (`just container-*`).
   - Référence : [CONTAINER-COMPLET.md](../../operations/CONTAINER-COMPLET.md).
6. **Tunnel & Automatisation** :
   - Tunnel de dev vers le vps : `bun scripts/dev/env-pull.ts tunnel --host vps` (seul propriétaire) ; réseau wg1 : `aphrody infra wg` (dépôt Aphrody).
   - Aucun déploiement continu : le déploiement appartient à aphrody-infra.
   - À faire : ingestion RAG des captures du crawl officiel ; vrai entraînement (LoRA/SFT) — `train-shenron-chat-loop.ts` ne fait que générer et évaluer des rollouts.
7. **Connecteurs Multi-Agents (Codex, AGY, Claude Code, Omar)** :
   - Serveurs MCP (`aphrody-mcp` port 8793, `shenron-mcp` port 8790 / public `/mcp`) et A2A (`aphrody-a2a` port 8788, public `/api/a2a`).
   - Configurations d'agents (`scripts/ops/setup-agent-connectors.ts`, `just setup-connectors`).
8. **Secrets** :
   - Env de dev : `scripts/dev/env-pull.ts` (seul propriétaire, retire le jeton Discord de prod) ; secrets du conteneur : `scripts/ops/container-secrets.ts`.
9. **Lecteurs Médias & Rendu Canvas** :
   - Lecteurs Manga (`?edition=couleur|color` via `colorisationDemandee`, réinitialisation de page au changement de chapitre), Databooks (pages libérées après échec ou démontage), Épisodes vidéo (probing, langue, nettoyage audio).
   - `ShenronCanvasEngine` (`packages/engine/src/unified_canvas.ts`) : particules Ki en WebGPU avec repli Canvas 2D, planches manga procédurales en Canvas 2D ; composant `ShenronGpuCanvas`, fond `KiCanvas.tsx`, vitrine `/canvas`.

## 2026-10-11 — Fusion Omar et gates Shenron

- Fusion de origin/omar/integration-20261011 (66adf88d) dans main, merge 447eeeaa ; fix lint 31b1a9b3, les deux poussés. Lint, typecheck, format et OpenAPI verts ; aucun test lancé.
- Release DBFR en attente : Bun sur les hôtes VPS/DBFR 1.4.3-aphrody.4 ; image partagée aphrody-build:latest 1.4.3-aphrody.2 ; manifeste Shenron épinglé 1.4.3-aphrody.2. Le checkout Bun documente un candidat Linux 1.4.4-canary.1 (988d73b43), qualifié sur des suites ciblées et présent dans un répertoire isolé DBFR, mais aucune release stable bun-v1.4.4 n'est publiée et la fabrique n'a pas ce candidat. Ne pas qualifier ce candidat comme release stable. Reprendre après disponibilité du candidat sur le VPS et adaptation de l'image de build, ou publication stable.

## 2026-10-11 — Optimisation Cloudflare TLS/latence

- Réglages vérifiés sur la zone `dragonballfr.com`: HTTP/3, TLS 1.3, Brotli et HTTP/2 vers l’origine actifs; minimum TLS 1.2; SSL strict. Early Hints activé via API Cloudflare (200). 0-RTT laissé désactivé vu les routes applicatives non idempotentes.
- La zone est encore `pending`; la délégation publique et le serveur observé restent OVH (`dns109.ovh.net`, `ns109.ovh.net`). `curl.exe` reçoit `Server: nginx`, HTTP/1.1, sans `cf-ray`; aucun réglage Cloudflare ne peut réduire le trajet effectif avant délégation. Échantillons publics: `/` total 0,44–0,65 s (TTFB 0,31–0,49 s), `/api/health` 0,10–0,13 s (TLS 0,067–0,080 s). Ce ne sont pas des mesures de charge.
- Le résolveur public n’a plus retourné de DS; les NS apex OVH ont TTL observé 3600 s. La délégation attend toujours la fenêtre de cache de 24 h après retrait du DS (échéance estimée 2026-10-12 10:25 Europe/Paris), puis contrôle frais du parent, de la parité des enregistrements et de l’accès registrar avant mutation.

## 2026-10-11 — Reprise DNS, CDN et incidents DBFR

- DNSSEC : le DS est absent des réponses parentales actuelles, mais il a été retiré aujourd’hui et son ancien TTL observé était de 86 400 s. Il n’y a pas de raccourci sûr : des validateurs peuvent encore cacher le DS et retourner SERVFAIL après délégation. NS observés : `dns109.ovh.net`, `ns109.ovh.net`; Cloudflare reste `pending`, NS attendus `duke.ns.cloudflare.com`, `veda.ns.cloudflare.com`. Le client OVH Aphrody envoyait le mauvais champ (`nameServers` au lieu de `nameServer`); correctif `12ae5f7f7` poussé dans Aphrody, test Rust 60/60 et Clippy strict verts. La CLI locale reconstruite confirme le plan de délégation, sans mutation; attendre l’échéance DS puis refaire parent + parité.
- Cloudflare R2 : bucket dédié `shenron-cdn` créé vide, région WEUR, classe Standard, accès `r2.dev` désactivé et aucun domaine personnalisé attaché. Domaine custom et exposition restent après activation zone et inventaire explicite des assets.
- DBFR : audit live du 11/10, 6.4 Gio RAM disponibles, 25 Gio disque libre, conteneurs healthy lors du relevé. OOM corrélé à `shenron-bot` (limite 512 Mio, RestartCount 33 cumulatif, dernier OOM/redémarrage corrélés) et `shenron-server`/Next (768 Mio, code 137 puis ECONNRESET localhost). Profiler les pics et traiter via propriétaire Aphrody Infra; pas de redémarrage/purge automatique. Images et volumes protégés.
- Bun : VPS et DBFR restent en 1.4.3-aphrody.4; le candidat 1.4.4-canary.1 isolé sur DBFR est non stable, absent du builder; aucune release stable publiée. Claims release actifs, attendre les artefacts stables et leurs gates.

## 2026-10-11 — Exécution de GOAL.md : inventaire du catalogue

- PostgreSQL DBFR relu en transactions READ ONLY : 826 épisodes (SDBH/ARALE absents), 254 volumes, 480 notices databook, 8 éditions ja/fr, 32 événements de chronologie. Manifeste privé des 11 lots et identifiants : `var/reports/catalog-expansion/coverage-2026-10-11.json`, état initial dans `baseline-2026-10-11.json`.
- Les 18 volumes Sōshūhen 701–718 correspondent par ISBN aux notices databook 465,469–485 masquées ; conserver les identifiants. Quatre paires d'éditions identiques (1/5,2/6,3/7,4/8) et la couverture Full Color 32/42 exigent une réconciliation des supports avant correction.
- Collecte primaire et audit des routes réalisés ; trois corrections ISBN Kanzenban préparées, non exécutées. Le writer media_* et les champs de langue/sous-titres/source des épisodes manquent dans le CRUD inspecté. Aucune écriture catalogue, OCR ou traduction, aucun import ni déploiement.
- Bun stable 1.4.4 reste indisponible : Windows, VPS et DBFR utilisent 1.4.3-aphrody.4 ; aucune installation figée ni gate Bun du goal exécutée. Gel databooks maintenu dans le plan, fichier local absent, aucune levée établie. Aucun accès admin utilisable dans l'environnement de cette session. Prochaine étape : runtime qualifié, writer propriétaire complet et accès éditorial, puis lots dédupliqués et livraison Infra.

## 2026-10-11 — Catalogue : collecte étendue et code préparé

- Collecte privée supplémentaire : 82 notices de mangas dérivés, dont sept ISBN déjà présents, et 48 épisodes SDBH identifiés par ID vidéo officiel ; 47 dates d'annonces confirmées. Les spéciaux, bandes-annonces et placeholder sont séparés. Pas de numérotation globale inventée ni de disponibilité VOST déduite. Listes Toei Dr. Slump refusées en HTTP 403 ; aucune liste individuelle collectée.
- Changements source préparés, non committés : CRUD `media_*` avec identifiants PostgreSQL, déduplication ISBN-10/13 et notices sans ISBN, restauration historique dédiée ; validation des métadonnées d'épisodes et snapshots JSON ; VF/VOSTFR/VOST distincts dans lecteurs, API, offres et badges, libellés fr/en/ja. Les sources sans version connue restent séparées. Les écritures génériques de pages databook sont refusées pendant le gel.
- Diagnostics TypeScript 7.0.2 natifs site et paquet DB réussis après correction ; relecture indépendante et contrôle du diff réalisés. Cela ne remplace pas les tests Bun, lint, format, contrats ni une preuve PostgreSQL réelle. Tests préparés, aucune suite Bun exécutée avec le runtime 1.4.3.
- Bun stable 1.4.4 et accès éditorial manquent toujours ; l'API admin répond 403 depuis Windows et DBFR. Aucun ajout catalogue, OCR, traduction, import, build ou déploiement. Reprendre les gates avec le runtime requis, puis relire les candidats contre PostgreSQL avant les lots éditoriaux et la livraison Infra.

## 2026-10-11 — Qualification effective et extension Cloudflare/SQL

Les notes précédentes sur l'attente Bun et l'accès admin décrivent un état antérieur : Bun 1.4.4 debug Windows et canary Linux sont désormais isolés, installation figée et gates Linux complètes vertes. Source principale f034c7e3, garde native 9fb19e97, commits vérifiés sur origin/main. Qualification Windows toujours en cours : délais de tests adaptés au debug, seuils de performance conservés, DLL RE en construction sur la fabrique. Image de production au SHA 9fb19e97 en construction dans un worktree isolé ; aucune nouvelle activation déclarée.

Trois ISBN Kanzenban corrigés par API admin et vérifiés par PG/révisions/public ; réplica synchronisé via le script propriétaire, zéro divergence sur les neuf colonnes comparées. Séquence bot.db_databooks_id_seq réparée via Infra : prochain ID attendu486, 480 lignes/max485 et empreinte inchangés. Création de l'artbook Dragon Quest non encore réessayée après réparation. Gel OCR/traduction conservé.

L'utilisateur a ajouté explicitement la consolidation SQL/doublons et la migration du CDN Shenron sur Cloudflare, puis le setup complet du CLI Cloudflare sur SSH DBFR (R2, Worker, DNS, tunnel et automatisation). Inventaire RO :127 tables,126PK,43FK,1099536 lignes. Quatre aliases d'éditions proposés ; aucun regroupement de tables exécuté. Source/provenance/RAG/conversations et sauvegardes ne sont pas des doublons par seule similarité.

Wrangler4.149.0 installé via Bun sur DBFR, cloudflared2026.10.0 présent, profil CLI non authentifié. Bucket R2 shenron-cdn vide au début du lot, zone dragonballfr.com pending. Tunnel shenron-dbfr créé et configuré, credential au store protégé DBFR sans valeurs dans les notes. Worker préparé : allowlist manifests, corps dédupliquésSHA256, validation checksum, bootstrap borné, ranges/304 et CORS ; aucun DNS modifié. Inventaire CDN initial88589 fichiers/86995 contenus uniques,32,7Go logiques/31,7Go uniques. Relevé complémentaire en cours pour les formats audio/Markdown, fichiers vides et aliases historiques. Prochaine étape : services Infra, qualification Worker/R2 et transfert vérifié, authentification CLI et bascule DNS contrôlée.

## 2026-10-11 — Livraison effective et stockage Cloudflare en cours

La release 9fb19e97 est activée par Infra : six services sains, vraie réponse chat HTTP200 et API catalogues200. L'image de rollback manquante a été reconstruite depuis son Dockerfile canonique et qualifiée. Les slugs HTML inexistants restent en200 ; ce contrôle n'est pas terminé. Les corrections Windows 640e2b50/a52985ff passent leurs suites ciblées ; deux benchmarks de performance debug restent rouges, seuils conservés. DLL RE Windows réelle : 29 tests verts.

Le propriétaire a explicitement levé les gels Shenron. Configuration frozen:false protégée et activation Infra vérifiées ; la route de transcription non authentifiée répond désormais401. Artbook Dragon Quest créé par API sous ID486, PG/révision/public relus ; le champ ISBN existant manque encore au mapping applicatif et fait l'objet du lot suivant.

Quatre aliases d'éditions ont été appliqués via migration Infra scellée et ledger SHA256 : 8 éditions et84 volumes inchangés, sauvegarde/restauration et replay qualifiés ; source ad7387dc poussée. Le Worker CDN a été publié en qualification, ranges/checksum/HEAD réels et9 tests97 assertions verts ; correctif a66a3dc6 poussé. La production CDN n'a pas encore basculé.

Credential Cloudflare natif existant réutilisé depuis son store, CLI authentifiée ; tunnel sain, audit journalier actif. S3 Shenron fonctionne en local et DBFR avec credentials temporaires limités aux préfixes _objects/ et _migration/, DPAPI Windows et profils DBFR root0400 ; renouvellements automatiques qualifiés. Infra source8paths publiée27433582 ; la validation récente conserve l'erreur de baseline omar-redis unknown topology host local, aucune nouvelle erreur Cloudflare. Copie R2 en cours : inventaire110014routes/87149corps,31,7Go uniques, reprise durable par reçus SHA256,64workers et mémoire bornée256MiB. La session S3 doit être rechargée même si accessKeyId ne change pas lors du renouvellement.

Avant bascule : capturer le delta Next public/static après la livraison finale (payload9fb actuel26a900da33b98a54, inventaire initial864f7d6307167794), préserver les anciens chunks et les routes CDN dynamiques, vérifier tous les objets, désactiver import et vérification mutable du Worker. Zone Cloudflare pending ; parent DNS sans DS au contrôle live, délégation OVH inchangée. OVH domain info accessible, dns info échoue sur missing field isSigned : corriger le contrat propriétaire ou utiliser une route propriétaire qualifiée, sans confondre lecture et droit de mutation. Aucun secret dans ces notes.

## 2026-10-11 — Copie R2 et réplica qualifiés (12:35 UTC)

La copie principale R2 a terminé avec 87149/87149 reçus SHA256, zéro échec et code terminal0. Les 273 nouveaux corps de la release9fb ont été copiés et vérifiés via HEAD Worker ; couverture110280routes/87418corps, zéro corps sans preuve. Six échantillons (police, PNG, JPEG, JavaScript, M4A, MP4) passent GET SHA256, Range206/16octets et If-None-Match304. Le delta de la prochaine image reste nécessaire.

La source publique ISBN/JDCN est corrigée et poussée9e030ec3. Le contrat SQLite/GraphQL nullable est poussé6249c495 et appliqué au réplica actif via procédure Infra scellée :874épisodes/48SDBH à numéroNULL/329mangas,33colonnes sans substitutionNULL, quick_checkok et replay sans écriture. Sauvegarde SQLite cohérente privée préservée.

Worker dynamique livrécaa3b2d9 :13tests126assertions, typage/lint verts ; chemins privés404, santéCDN200, imagefallback302. Ingress origin-cdn ajouté au tunnel avec TLS/SNI/Host CDN vérifiés, sans désactiver TLS ; sa route publique attend la zone active. Les quatre connexions tunnel, audit et renouvellement S3 restent actifs. Documentation officielle R2 et Workers SDK consultée via Context7.

DNS :50enregistrements existants alignés contenu/TTL avec OVH, sans proxy de production ; CNAME origin-cdn ajouté pour l'origine dédiée. Zone Cloudflare encore pending, registrarDNSSECdisabled, hosteddisableInProgress, parentDSabsent. Le CLI Infra refuse --apply sans preuve --ds-cache-expired ; date/TTL de retrait DS non établis, aucun contournement ni nouvelle délégation déclarée. Image6249 construite/scellée/transférée ; activation et contrôles en cours.

## 2026-10-11 — Activation6249 et reprise de bascule (12:41 UTC)

Image6249 activée/scellée et six services sains ; APIcatalogues/santé200, épisode absent404, chatréel200/8tokens et réplica874/48NULL/329manga qualifiés. Rollback9fb scellé dans docker-xikp01ym. Gates combinées3855tests75skips après reprise d'un seul timer préexistant,110scripts et contrats verts. HTMLmanga inexistant reste200 : limite réelle conservée.

Delta final6249 :13nouveaux corps,110296routes/87431corps ; couverture zéro non vérifié, anciens chunks conservés. Worker déploiement3bde91763c5c45c7b72dfd28388844aa épinglé sur _migration/manifests/release-6249c495/ ; IMPORT_ENABLED=false et VERIFY_UPLOADS=false, HEAD/image/checksum et santé200 après activation. Public CDN hostname reste sur OVH, aucune bascule annoncée tant que la garde DS n'est pas satisfaite.

Toolchain Cloudflare officielle installée en privé sur Windows et DBFR :cloudflare7.3.0/wrangler4.149.0/workers-types5.20261006.1/miniflare5.20261006.1-alpha/workerd1.20261006.1/aws4fetch1.0.20. SDK mock et Worker R2 réel DBFR qualifiés ; qualificationWindows en cours. Rustworker0.8.7/cloudflare0.14.0/worker-build0.8.7 : archives vérifiées et sources disponibles local/DBFR ; cargo fetch --locked fabrique, aucun compile DBFR déclaré.

PATCH486 par API réussi :ISBN9784087925081, pagesNULL et sourceShueisha conservés. Import normalisé10œuvres/16éditions/82liens et UI numérosNULL restent en livraison. Reprise automatique horaire configurée dans ce chat : terminer uniquement ces lots et la bascule CDN lorsque les preuves DNSSEC/TLS existent ; silencieuse tant que l'état est inchangé. Ne pas transformer le constat DSabsent en assertion d'expiration d'un ancien TTL inconnu.

## 2026-10-11 — Imports et toolchain terminés (12:43 UTC)

Imports normalisés terminés par API :10œuvres+16éditions+82liens, révisionscreate10/16/82, totauxPG11/24/166. DeuxéditionsJAcolor et uneFRmixed prouvées,13unknown sansfaussevaleurNB. Pages/assets/audio non inventés. ISBN486 corrigé en PG mais le contrat public ne l'expose pas encore : ne pas annoncer l'expositionISBNpublique.

ToolchainWindows/DBFR terminée : installfrozen identique lockSHA4dfe6537d9fc3bc80d70cb16b4f3464cdb69ebdca15f759b5090dab19164ced2 ; Wrangler,SDKetaws4fetch qualifiés, vraiWorkerMiniflareR2PUT/GET/DELETEHTTP200 chacun, dispose complet. CloudflaredWindows2026.10.0 téléchargé officiel/digestGitHub vérifié, rclone1.75.1 qualifié ; wrappers privés, aucunPATHglobal remplacé. Crates Rust téléchargées/checksum exact et cargo fetch--locked sur fabrique ; aucun binaireworker-build compilé/installé annoncé. Sourcesff324b83 pour numérosNULL poussées ; secondeimagefigée en livraison.

## 2026-10-11 — Dernière image et delta CDN (12:46 UTC)

ff324b83 activé/scellé, six services sains, chat/santé/réplica verts. Page827HTML200 affiche réellement « Numéro non établi », sans#000. Rollback6249 docker-a4013dil qualifié. Image1b08b91fe89c2aeb84202ed28f6b0b2f6e780eb09dfa284b7836d481c4e82684 ; payloadda71a68a3af56cee, static .next-standalone/static/EpeqFjnKdKgg_P9m93ws9.

Deltaff324 :8nouveaux corps localSHA vérifié, upload et HEADchecksum/size200,256shardsS3GETSHA vérifiés ;110307routes/87439corps dans le manifest. Worker déploiementb2324f71dda043479c1e6600900f778f épinglé release-ff324b83, import et vérification mutablefalse. AnciennesURL/chunks conservées. Catalogue/source/CLI/Worker/docs poussés, arbre source propre hors cache non suivi préservé.

La qualification frontend finale est horodatée12:45:31 et le delta12:46 ; ne pas annoncer le respect intégral du délai12:44 demandé. GardeDNSSEC/délégation inchangée ; reprise automatique configurée. Réplica média normalisé : dryrun201lignes/3tables12-11-9colonnes exactes, sansignorés/skip/échec ; application non exécutée, nouveau delegate scellé/backup/revue exacts restent nécessaires. Le binaire épisodes ne doit pas être élargi implicitement. Contrat public ISBN486 et soft404HTML restent des limites visibles, pas des faits livrés.

## 2026-10-12 — Actualités et lecteurs : fraîcheur live

Contrôle public : 21 articles news ; le flux Dragon Ball Official a une entrée du 12 octobre et Disney+ France annonce officiellement la disponibilité de Dragon Ball Super : Beerus le 14 octobre. Ce dernier fait n'est pas encore dans /news. Proposition d'article prête, non publiée : `/api/agent/v1/articles` exige `write:articles` et la portée `publish:articles` pour publier ; GET sans authentification répond401, aucun MCP admin ni jeton d'agent dans l'environnement. Ne pas contourner.

Audit live des catalogues : 329 tomes, 922 chapitres, 427 databooks, 874 épisodes, 28 films ; 2 580 pages répondent200, mais seules320/68 979 images ont été contrôlées avant arrêt après échecs systématiques. Les URL de lecteur même origine répondent404, alors que trois objets correspondants testés répondent200 depuis `shenron-cdn.aphrody-labs.workers.dev` et le gateway local ; `cdn.dragonballfr.com` répond525. Correctif préparé dans `deploy/docker/compose-gateway.nginx.conf` : fallback Worker sur `/assets/` et fichiers d'images `/wiki/`, sans intercepter les pages wiki ni transmettre les cookies. Tests ciblés11/11 verts, format vert et syntaxe complète validée avec Nginx dans un conteneur jetable. Aucun DB, cache, DNS ou hôte prod modifié. Suite : commit/push, livraison Infra autorisée et relecture navigateur réelle ; reprise de la couverture images après correction du routeur.


### 2026-10-15 — Pipeline Bun, SDK Yolo et livraison qualifiée

SDK public `@aphrody/bun-runtime-sdk@1.4.10` publié et archive vérifiée ; export natif `/yolo` et déclarations canoniques qualifiés côté consommateurs. Canon dispose dune action explicite de repérage des citations, désactivée par défaut, avec quotas Redis, délai borné et abstention native. Source et contrat API poussés (`70a616b9`, `da7f3898`). Les clés Jev restent dans les fichiers privés des hôtes ; cela ne prouve pas leur chargement par les processus actifs.

Pipeline partagé DB/CDN/RAG ajouté avec plans épinglés, checkpoints et vérification des octets ; voir `docs/operations/BUN-SOURCE-PIPELINE.md`. Gates combinées : 78 tests réussis, 369 assertions, dont PostgreSQL réel ; un cas de persistance VectorIndex attend le nouveau runtime. Livraison SQL réelle : 349 documents et 4 312 médias de référence, sans promotion canon ; premier lot CAS vérifié de sept objets. Le RAG se livre par cycles bornés avec relecture de source, sans annoncer le corpus complet avant preuve.

Le crawl des 24 sources demeure partiel. La reprise doit conserver le collecteur existant, les refus robots et les reçus par source ; un code zéro ne prouve pas la complétude. Le runtime natif et les exécutables compilés doivent passer leurs fixtures avant promotion. La fabrique Aphrody est épinglée avec une qualification bloquante ; le runtime installé ne la satisfait pas encore. Aucun basculement de lecteur vers VectorIndex ni activation Canon ne doit être déduit des seuls commits.


## 2026-10-15 — Accord complet de livraison et gates de préparation

Le propriétaire autorise explicitement le déploiement complet. Les douze bibliothèques
publiques passent à1.4.6 (e3e6cf4d, config867a52b) ; archives initiales auditées sans
anomalie, publication réelle engagée et relecture des empreintes en cours. Aucun
résultat de publication globale ni nouvelle activation du site n’est encore annoncé.
Le build6f88 a passé les suites paquets/site/DOM et check/lint, puis échoué avant Next
sur trois gates scripts : Python/Brotli, chemins Windows/Linux et références plugin.
Correction plugin1b2f243f (20tests/1840assertions), stockage d814645f (18/64) ;
qualification Python3.13 sur fabrique et correction CAS dates JSON/Drizzle en cours.
Automatisation wiki10df5082 ajoute un rattachement explicite œuvre/épisode/édition :
16propositions initiales restent archivées,8quarantaines,7nouvelles retenues et
Finalflash traité par le lot déjà relu sur scans. Aucune de ces propositions publiée
à cette étape. Prochain travail : SHA commun vert, image scellée/activation Infra,
reset neutre, contrôles navigateur puis écritures éditoriales protégées et RAG.


Mise à jour du 2026-10-15 : livraison RAG terminée pour les 349 documents du lot reprojecté. Relecture PostgreSQL indépendante : 349 documents, 349 vecteurs, contenus et identités de provenance vérifiés, avec 349 recherches filtrées réussies. Répartition conservée : 199 communautaires et 150 références ; modèle `Xenova/multilingual-e5-small`, dimension 384. Reçu privé SHA-256 `d21f4ba9609078b3b8e8a7c627f7eba530343c8d7ca5efece12be0d7faed7a42`. Ingestion via Bun.fetch et propriétaire HTTP existant ; embeddings par le service externe existant. Cela ne constitue ni activation du sidecar Bun.VectorIndex, ni publication publique, ni promotion canonique, ni complétude du crawl et des médias.


## 2026-10-15 — Publication npm qualifiée et demandes catalogues/Actions

Douze bibliothèques @aphrody/shenron-*1.4.6 réellement publiées : script propriétaire
terminal0, relecture identité/SHA1,12archives npm téléchargées indépendamment et
SHA256 identiques, audit0anomalie ; installation isolée des12versions terminal0,
scripts d’installation désactivés et identités relues. Les applications restent privées.
Reçus privés var/reports/package-publication-20261015/. Reprise du writer durcie
1d30672c : reçu upload accepté, vérification d’une version existante, propagation
bornée15minutes ;5tests/14assertions verts. Cela ne constitue pas une activation du site.

Demande d’autre fabrique : PCWindows sansDocker/Podman, Omar routesDNSindisponibles,
DBFR manqueRAM/disque pourfullbuild ; GitHubhosted refusé avantdémarrage par
facturation/plafondActions0$ (run38730977420). Aucun achat ni contournement de verrou.
Le VPS a finalement libéré le verrou ; Python3.13.16/fontTools/Brotli par roues
précompilées,2tests/54assertions verts. Build immuable340f317f lancé, checkglobal
Bun vert et livraison Infra en cours ; aucune nouvelle activation encore annoncée.

Le propriétaire ajoute le tri sélectif DragonBall des catalogues archive_movies et
archive_images (8166/493éléments bruts avantfiltre), puis la réparation des Actions
et workflowsGitHub. Lots disjoints délégués : filtre avantcompteurs/pagination/détails,
provenance et vraisfichiers qualifiés ; workflows depuis erreurs réelles, sans prétendre
lever le blocage financier par YAML. Ces lots suivants ne déplacent pas le SHA340f
déjà construit.

## 2026-10-15 — SOSH : disponibilité réelle et workers permanents

Le propriétaire exige les 18 tomes lisibles et des workers récursifs 24 h/24, 7 j/7 pour compléter et publier les pages et tomes manquants de tout le catalogue manga. Session courante confirmée sur DBFR vps-6732365f ; fabrique Infra vps-203bea89. Audit public : 18 notices 701–718, seul chapitre 35001 visible avec 381 images, 17 tomes sans pages ; 399 GET réussis (381 pages et 18 couvertures), SHA-256 tous distincts. Lecture visuelle : couverture ISBN 9784081111657 annonçant 398 pages, page 003 japonaise imprimée 9 ; le compte des fichiers ne prouve pas la pagination papier.

Correctifs d33f9d32/92f578ff : filtre SSR, lecteur fr/en/ja et MediaPager mobile 453→380 px qualifié par injection Bun.WebView. Recherche efc633c1 liée aux publications visibles et au rang exact. Bibliographie 878b8e17/7319d6ad : 18 ISBN sourcés et enrichissement CDN sans cycle. Intégration concurrente préservée ; relecture indépendante, 31 tests/633 assertions, check site 1449 fichiers et 6 tests crawl/19 assertions verts. Aucun nouveau tome annoncé lisible. Dates 702/703 : backup 18 frais et CAS prêts, ancien writer 88ac refuse 400 sans mutation ; attendre image compatible et projection fraîche.

VPN Japon/Tokyo vérifié par Mullvad depuis le namespace existant sans mutation du tunnel. Index privés : 20 documents/76 chunks ; requête ISBN 9784081111664 relue par root, 2 résultats Books.or.jp avec provenance. Campagne japonaise bornée 2000 requêtes/profondeur 4 active sur fabrique, refus robots conservés. Source des originaux 2–18 encore recherchée ; lien Drive japonais du tome 12 indisponible. Workers permanents de découverte/indexation et publication en cours chez leurs propriétaires, activation 24/7 pas encore qualifiée. Nouvelle image préparée isolément avec gates fraîches et verrou heavy ; ancien build 340f terminal 1. Preuves privées var/reports/sosh-{e2e,data,crawl}-20261015/ et sosh-ui/. Suite : activer les workers Infra, qualifier reprise/publication réelle, livrer l’image puis acquérir et intégrer les 17 tomes manquants.

2026-10-15 — Extension110tomes+wiki : auditindépendant APIcatalog329,219readableHere,110false rapprochéPG329/939chapitres sansdivergence.110=93sanslignechapitre+17stubsSOSHmasquésvides ;219lisibles ne prouvepascomplétude. Listeprivée stable missing-manga-110.json (RAG) etnotefrontier. ImporterstubsSOSH d1f0d197 vertunit6/40+PG18isolé1/26, poussémergeea26063a. Plannerdoitencorecouvrircréation93 parwritercanonique/CASabsence ; aucunIDinventé. Campagnewiki108relancéeavecsmokehashcourant puis8sessionsparallèlesgpt-5.6-luna, tmuxshenron-wiki-110-20261015 ; résultatspublics nonencorequalifiés.

2026-10-15 — Campagnewiki108 (tmuxshenron-wiki-110-20261015) terminal0 après8tâchesparallèles :3approved(454déjàpréparé,mediaworks10/16nouveaux),102blockedfauteancrageprimaire,2quarantined,1rejected. Exportprivéproposals-110-reviewed.json ; RAGrelitles2synopsisetpréparewriter9sansapply. SourceAMPShueishaqualifiée seulementLegend2 :70requêtes,1document/3chunksindexés0erreur,17alertredirect ; campaign.completed=falsemêmeCLIexit0. GoogleDriveaucunscanfichiercorrespondantretrouvé. Sourcepool+publisher60302557livrésmaisrevuedeuxP0 :genericPATCHpages/visiblehorswhitelistet93absentchaptersnoncouverts ; notesownersavantactivation. ReaderM3fixsource : preuvepass3privé18états2/10/381×390/1280×paginé/vertical/paginé,rootrelectureJSONet2captures ; badge390plie3lignes→correctifCSSconsommateurencours. M3public3.3.12pasencorequalifiéinstallé. Sourceworkerunitencoreinactive, aucun24/7publicdéclaré. Fabrique12vCPU97%occupés/attenteI/O,25GiBdisponibles ; verrouheavypréservé,guardianlivraisonb90pauseauto-syncjusqu15:40max.


### 2026-10-15 13:58 UTC — wiki et workers manga en parallèle

Vingt et une fiches renseignées par ce root via API canonique avec snapshots complets, sauvegardes privées, CAS, relecture indépendante des sources et révisions vérifiées. Dix-neuf textes sont relus exactement dans le HTML ou l’API publics. Les articles des comédiens9/10 attendent l’image contenant9a33380a. Derniers lots : Chozenshu16/17/18, Daizenshu10/11/15, Carddass13/14 et Forever22. Carddass14 reste limité à sa couverture ; Forever22 ne reprend que les faits de la couverture japonaise, les scans hongkongais sont distingués. Aucune écriture OCR ou traduction de planche. Reçus privés wiki-root-delivery-20261015/delivery.json et dossiers de chaque lot. Inventaire GET frais13:57 :10754 fiches,83 avec champs de prose manquants selon le détecteur, contre108 au départ ; ce compteur ne prouve pas un wiki exhaustif.

Fusion36fb4616 poussée : publication transactionnelle des chapitres absents et aperçu explicitement partiel, tests PostgreSQL18.1 isolé2/55 verts, tests Bun ciblés verts. Nouvelle image36fb en préparation sur fabrique, verrou lourd partagé respecté ; source du pool b12d4774 poussée ensuite. Pool unique réellement actif depuis13:55:40,16 Workers Bun installé1.4.4 dfde053a, namespace Mullvad Japon vérifié ;175 documents490chunks réellement indexés au premier relevé,0 erreur. Recherche Google explicitement indisponible, collecte directe des sources officielles continue et robots respectés. Aucun nouveau tome complet acquis ; SOSH2–18 et déficit110 ne sont pas déclarés résolus. Consumer DBFR et timer handoff actifs ; projection dates suspendue avant activation pour compatibilité de l’imageb90 avec reader_extent. Reprise par propriétaire de projection compatible ou après nouvelle image, sans faux ACK.


## 2026-10-15 — Stockage DBFR et premières mémoires Windows,14:25UTC

Sur demande explicite, dix archives de livraison hors des répertoires de production ont été transférées vers le stockage privé du VPS ; SHA-256 relus indépendamment à destination, puis copies DBFR supprimées après contrôle identité et absence de références ouvertes. Avec les duplicatas du lot b90,4,13Go libérés ; DBFR dispose de5,73Go, contre1,63Go avant opération. Release active b90 et rollback préservés ; aucune purge Docker, base ou média. Reçus privés dbfr-offload-20261015 et wiki-import-pg-20261015/offload-complete.json. Le stockage commun existe sur la fabrique, pas encore sous le même chemin sur DBFR.

Omar et PC propriétaire joignables par Infra sous Windows natif. Premier lot privé de notes Codex/Claude du PC propriétaire :155 documents et952 chunks indexés dans le home DBFR ;153 notes suspectes en quarantaine, sans document indexé. Filtre propriétaire et adaptateur privé4tests/28assertions verts, manifestes et empreintes vérifiés, recherche privée exacte et replay sans nouvelle indexation. Données historiques explicitement non fiables, sans publication ni entraînement ; les sessions volumineuses et mémoires Omar ne sont pas encore ingérées.

## 2026-10-15 — Studio du site et progression wiki vérifiée

Demande propriétaire : « fix shenron studio du site ». Crash reproduit après
hydratation dans Bun/Obscura installé : HTMLLinkElement.href reste relatif,
new URL sans base lève Invalid scheme. Le correctif cad30390, poussé sur main,
lit l’attribut href, résout avec document.baseURI et isole un manifeste invalide.
Régression avant correction : 4 tests passent, 2 échouent ; après : 6/25 assertions.
Thème/PWA : 15/119 assertions ; bun check du site : 1455 fichiers, zéro erreur ;
bun lint et bun fmt ciblés verts. Aucun tsc/oxlint. QA isolée : vrais 390/1280,
page présente, aucune erreur console ni écran critique ; thème neutre/Goku/neutre,
fond, classe dark et manifeste vérifiés. Root a inspecté deux captures.
Un seul bloc du bundle CDN épinglé a été remplacé, sans modifier le DOM.
Ce contrôle ne prouve pas encore le déploiement ; image active b90 au contrôle.
Le crash observé concerne le DOM installé, sans extrapolation Chrome/Safari.
Preuve privée : var/reports/studio-site-fix-20261015/browser/isolated-fix-qa.json,
SHA256 68b79c0791896fa69950cad25e36c4343ec6801c2db295b719a91f49ddd3b67c.

La page publique est actuellement une présentation ; le moteur est local et
désactivé en production. Ni import, OCR, traduction, sauvegarde ni export distants
qualifiés. Clarification facultative posée sur le parcours attendu, sans réponse
à ce stade. Demande de repin de l’image commune envoyée à son propriétaire :
activation exclusive wiki/Infra, pas de second build. Notre ancien job d879
a été annulé uniquement pendant son attente du verrou ; aucun build d879 exécuté.

Wiki : 84 fiches distinctes écrites par ce root, sauvegardes complètes, CAS,
relecture et révisions signées vérifiées ; 78 textes publics exacts. Six articles
de comédiens (9–14) attendent le correctif d’affichage 9a dans l’image commune.
Les 48 synopsis français SDBH reposent sur les synopsis officiels de l’anime,
identité YouTube et deux images par épisode vérifiées ; aucune vidéo annoncée vue.
Dix corrections lexicales Fû ont leur propre révision et ne comptent pas comme
nouvelles fiches. Les champs synopsis originaux restent nuls ; le détecteur de
champs manquants ne mesure donc pas à lui seul l’absence de texte public.
Dernier lot de sept : guides29/41/42 et comédiens11–14. ISBN29 corrigé sur le
colophon réel et la notice ISBN concordante ; les descriptions n’inventent ni
lecture intégrale ni contenu absent. Pas d’écriture OCR pendant ce lot.
Reçus privés : var/reports/wiki-root-delivery-20261015/delivery.json et
wiki-final-reviewed7-20261015/plans/2026-10-15T14-42-47-814Z.

Les 110 tomes complets manquants restent à acquérir ; aucune nouvelle livraison
intégrale déclarée. Pool fabrique 16 slots et consommateur DBFR persistants ;
prévol consommateur attend readerExtent de la prochaine image. Dates SOSH702/703
publiées et relues : 13/27 mai2016, publication/réconciliation terminales zéro,
5905 fichiers vérifiés, sans prétendre avoir acquis les pages2–18.
Stockage commun /home/ubuntu/build/storage annoncé qualifié par le propriétaire :
58 empreintes et huit contrôles ne sont pas revendiqués comme testés par nous.
Chemin absent sur DBFR, présent sur la fabrique. DBFR conserve environ1,26GB
disponible au dernier contrôle, insuffisant pour prétendre la porte d’activation
qualifiée ; aucun store, volume Docker ou fichier partagé purgé.

Prochaine étape : image commune incluant cad30390, portes et espace qualifiés
par son propriétaire, activation Infra puis contrôle réel de Studio et des six
articles de comédiens. Wiki entier et volumes manquants restent inachevés.

### 2026-10-15 — Audit SOSH public et état du pool

Audit API public à 14:56: 18 lignes de tomes, un seul chapitre lisible (tome 1,
381 pages listées), tomes 2–18 sans chapitre ; aucune des 381 URLs d’image listées
n’a échoué en HEAD. Le lecteur réel, la pagination complète et le décodage des
images ne sont pas qualifiés par cet audit. Reçu privé sur la fabrique :
`/home/ubuntu/.aphrody/profiles/dbfr/jobs/sosh-availability-audit-20261015/public-readers.json`,
SHA-256 `2b97fc90bec95c2f5efab3dc6a0ff92f8338f6b0f5d50d6a4cbb67a39dce2138`.

Le service usine `shenron-manga-workers` est actif/activé avec une capacité de
16 workers (1 travailleur actif au snapshot 15:01) ; son timer
de handoff est actif. Pool à 15:01 : 160 fichiers privés (154 images, 6 PDF),
7 589 431 octets, tous vérifiés par SHA/taille ; aucun n’est qualifié comme page
SOSH. Les 144 fichiers Shueisha sont des ressources d’éditeur sans preuve de page
de tome. Boîte de publication vide. « asset done » vérifie les URLs publiques et
conserve des reçus, sans acquérir de nouveaux scans. Les 17 statuts
`robots_refused` SOSH702–718 sont des refus du catalogue bibliographique NDL
(robots HTTP200, SHA `02cc67318f936a34778ebaeb11d6d3776b9aa64a5d53fdbe3e72a4dd6f49b6e7`),
pas des refus de pages ; aucun corps NDL n’a été demandé après ces refus. Les 17
ISBN ont une notice OpenBD reçue. Index privé : 3 580 documents, 24 131 chunks,
0 vecteur, 0 candidat dans l’inbox, 0 chunk orphelin. Les candidats `approved`
sont des observations parent×URL, pas des médias validés ; 264 captures ont été
mises en quarantaine sur divergence de SHA, cause non déterminée. Rapports privés :
`var/reports/sosh-availability-audit-20261015/public-audit-summary.json` et
`var/reports/sosh-worker-output-audit-20261015/summary.md`.

Le but SOSH reste incomplet : obtenir et qualifier des scans/pages autorisés, les
importer avec les writers canoniques puis vérifier le rendu public. Studio : le
build commun du propriétaire a démarré à 15:02 et ses gates ciblées avancent, mais
son installation résout toujours `@aphrody/m3-reader` 3.3.11 contre 3.3.12 au
catalogue ; la page corrigée n’est pas déployée. Ne pas lancer un build ou une
activation concurrente. Prod était b90 au dernier contrôle.

### 2026-10-15 — Plan confirmé : 17 tomes manquants pour compléter 18

Le propriétaire a clarifié «177» : il demande les 17 tomes SOSH manquants pour
compléter les 18, pas 177 éditions. Le plan cd190462 est corrigé et renommé
[SOSH-DELIVERY-PLAN.md](SOSH-DELIVERY-PLAN.md), relié à GOAL/TODO/indexdocs.
Le communiqué Shueisha du 12 mai 2016 (DreamNews 0000131506) confirme 18 volumes.
Les bornes SOSH 18/IDs 701–718 restent valides ; aucune généralisation 177 ni
création 159 notices n’est requise. Le tome 1 conserve son audit intégral final.
Le plan couvre provenance/pagination, acquisition/relecture, backup/CAS, CDN,
invalidation runtime et rendu public. Après une livraison de code unique pour
l’invalidation, les vagues de données passent par worker/CDN/writer sans
`next build` ni rebuild d’image du site par tome.

À 15:13, l’index CDN épinglé ece8c64a… expose 381 fichiers pour le tome 1 et un
seul 001.jpg par dossier des 17 autres. SHA/taille des couvertures 2,3,18 vérifiés,
images vues : couvertures, aucun intérieur. Ces 17 images ne sont pas 17 lecteurs.
Preuves privées : `var/reports/sosh-source-discovery-20261015/`.

### 2026-10-15 — Collecte corrigée et publication runtime préparée

Le worker de collecte a été rechargé via Infra sur la fabrique à15:23,
PID140289, egress Japan/Tokyo confirmé. Le correctif efb921af reconstruit
uniquement les BOM dont taille et SHA correspondent au reçu original :
241 captures reprojetées et réellement indexées au cycle15:25:08 ;
23 captures EUC-JP altérées restent refusées. Aucun scan SOSH nouveau publié.
Preuves privées : var/reports/sosh-source-discovery-20261015.

La revalidation backend f5427c5b est implémentée et qualifiée
(32tests/520assertions), mais attend encore l’image commune et son contrôle
runtime. Le préparateur legacy trompeur est remplacé par l’audit canonique
17bf0f7b. Les cinq erreurs de types du build sont corrigées jusqu’à805f6f59 ;
140fichiers vérifiés et31tests/463assertions verts. Le propriétaire de livraison
a reçu la demande de repin ; aucun build concurrent lancé.

Nouvelle demande : installer Xenoverse2 avec DBX2 et Shenron RE. Cible
configurée APHRODY Windows native joignable ; Steam et jeu absents au contrôle
15:30. Installation officielle/outillage en cours, sans achat ni connexion
inventée. Le CLI Shenron RE expose inventaire et lecture de formats, pas install.

### 2026-10-15 — Xenoverse 2 : Steam installé sur APHRODY

Installation officielle via Infra sur Windows natif APHRODY, sans WSL.
SteamSetup signé Valve Corp., Authenticode Valid, SHA256
7d3654531c32d941b8cae81c4137fc542172bfa9635f169cb392f245a0a12bcb ;
installation silencieuse terminée code 0 à 15:34:21. Steam.exe installé et signé.
Le handler Steam est présent ; URI steam://install/454650 ouverte à 15:34:57.
Aucun manifest 454650 présent à ce contrôle : téléchargement du jeu non prouvé.
Session interactive/connexion au compte encore en vérification. Reçus privés
Windows : C:\Users\aphro\AppData\Local\Aphrody\jobs\dbxv2-install-20261015.
DBX2 et Shenron RE ne doivent pas être présentés comme installateurs du jeu :
le CLI RE qualifié expose inventaire et formats. Aucun achat, modification de
sauvegarde ou anti-cheat réalisé.

Contrôle final : à15:35:23, aucun manifeste Steam454650 ni exécutable du jeu.
Le premier lancement Steam en session0 s’est arrêté. Une tentative ponctuelle
de lancement en session1 n’a pas été qualifiée ; ensuite Infra SSH vers APHRODY
a échoué sur banner exchange. Le propriétaire doit ouvrir Steam sur son bureau,
se connecter au compte possédant Xenoverse2 puis lancer son installation.
Aucun binaire DBX2/Shenron RE Windows installé ou jeu téléchargé n’est déclaré.
