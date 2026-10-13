<!-- SPDX-License-Identifier: Apache-2.0 -->

# Répartition du stockage Shenron

État vérifié le 13 octobre 2026. La demande porte sur le débordement de Shenron
entre DBFR, Neon, Supabase et Cloudflare, sans doublons et sans abonnement payant.
Les projets Neon et Supabase dédiés sont provisionnés ; la répartition en production reste inactive.

## Propriétaires et mesures

| Service    | Rôle                                               | État vérifié                                                                                        |
| ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| DBFR       | PostgreSQL éditorial, données privées, origine CDN | SSH Infra fonctionnel, PostgreSQL sain                                                              |
| Neon       | SQL public explicitement détachable                | Projet dédié `patient-cloud-06530995`, `shenron-overflow`, organisation Aphrody gratuite, Francfort |
| Supabase   | Débordement dédié Shenron                          | Projet `shenron` / `odtrkpeykybmfqhoxvlx`, organisation `aphrody` gratuite, Francfort, sain          |
| Cloudflare | Cache et stockage public R2 existants              | Compte `ca22c1a51a145f919b54afa18d936516`, bucket `shenron-cdn` existant                            |

Neon : branche `br-noisy-voice-b9x9aubu` (`production`), PostgreSQL 18,
base et rôle `shenron_overflow`. La requête réelle `SELECT current_database(),
current_user, pg_database_size(current_database())` a réussi : 7 716 864 octets
avant toute donnée applicative. Plafonds renvoyés par l'API :
`logical_size_bytes=400000000`, `compute_time_seconds=288000`,
`data_transfer_bytes=4000000000`, compute fixé à 0,25 CU.
La suspension utilise le réglage imposé par le compte gratuit : la personnalisation
de cet intervalle a été refusée, sans création du premier projet tenté.
Ces plafonds concernent Neon uniquement, ils ne garantissent pas le coût des
autres fournisseurs. Aucun secret Neon n'a été extrait ni injecté en production.

DBFR : base `shenron_site` de 2 672 039 615 octets ; 14 connexions observées,
`max_connections=40`. Relations par schéma : `bot` 290 004 992 octets,
`public` 980 238 336, `chat` 172 032, `shenron_compute` 1 358 708 736,
`drizzle` 65 536. Les tailles changent et ne prouvent pas une saturation.
Le disque système dispose d'environ 23 Go libres ; ce chiffre ne constitue
pas une allocation disponible pour copier le CDN ni un budget PostgreSQL.

La santé publique et les deux index CDN répondent HTTP 200. Le catalogue servi
annonce 110 782 fichiers et 54 011 802 453 octets logiques, observation du
13 octobre à 11:49:57 UTC. Les alias peuvent partager des objets : ce total
ne mesure pas les octets uniques facturés par R2 et ne prouve pas la lecture
de chaque fichier. La métrique du compte est précisée ci-dessous.

Les projets existants Neon `inagle` et Supabase `rg` restent affectés à leurs
produits. Le propriétaire a choisi explicitement l'organisation Supabase
`aphrody` pour un projet Shenron séparé. Son plan `free` et son projet existant
ont été vérifiés avant création. Les outils connecteur `get_cost` et
`confirm_cost` renvoient encore `UNAVAILABLE`, « MCP tool … was not returned by
tools/list » ; le projet dédié a été créé par l'API officielle après connexion
de la CLI, avec un mot de passe aléatoire scellé par DPAPI dans le profil local.
La CLI et le connecteur confirment `ACTIVE_HEALTHY` le 13 octobre 2026. Aucun
bucket supplémentaire ni schéma applicatif n'est créé.

Les CLI locales Neon 8.4.3, Supabase 2.120.0, Wrangler 4.149.0 et cloudflared
2026.10.0 sont disponibles. Le binaire Supabase a été vérifié contre le checksum
de sa release. Le wrapper privé `~/.local/bin/wrangler-aphrody.ps1` utilise le
jeton Cloudflare du store protégé sans le recopier et `whoami` confirme un compte.
Les alias SSH `vps` et `dbfr` ont été testés avec `BatchMode yes`,
`ConnectTimeout 15` et la vérification stricte des clés d'hôtes ; les hôtes
renvoient respectivement `vps-203bea89` et `vps-6732365f`.
Sur les deux hôtes, Supabase CLI 2.120.0 et Neon CLI 8.4.3 sont installées
dans les dossiers utilisateur et répondent à `--version` ; l'archive Linux
Supabase a passé son SHA-256 officiel. Sur DBFR, un wrapper local exécute la
CLI Neon par Bun, car son lanceur amont exige `node`, absent de ce serveur.
Aucun jeton de session local n'a été copié sur ces hôtes.

Le catalogue CDN a été parcouru entièrement : 1 154 pages, 110 782 URL,
87 877 empreintes distinctes et 31 804 128 614 octets uniques référencés. Les
542 assets de la release publique active DBFR, les 536 fichiers publics du dépôt
et les 851 assets bot sont déjà couverts. Seuls 15 fichiers d'un ancien build
`/_next/static` sont absents ; ils renvoient 404 et aucune référence active n'a
été observée. Ils ne sont pas publiés sans preuve d'usage et de droits.
La métrique R2 du compte rapporte 35 459 389 060 octets de payload stocké dans
six buckets ; elle n'est pas une facture mensuelle. Elle dépasse déjà la capacité
gratuite nominale de 10 GB-month, donc aucune nouvelle copie massive R2 n'est
engagée pour cette demande.

Les données hors PostgreSQL inventoriées comprennent notamment 44 714 731 005
octets de captures privées locales dans `data/source-acquisition/episodes`, le
SQLite bot local (286 113 792 octets) et le SQLite bot DBFR (environ 808 Ko).
Ces deux SQLite ne sont pas présumés identiques. Le SQLite local contient aussi
des données propres au bot, dont 59 995 chunks RAG vectorisés, 225 752 lignes
de journal d'actions et 8 037 utilisateurs au relevé du 13 octobre 2026 :
son rôle ne se réduit pas à une copie éditoriale. Les captures ne sont pas des
assets CDN publiables. Le propriétaire a arrêté le transfert des frames le
13 octobre : les trois tâches `Shenron-Corpus-even`, `Shenron-Corpus-odd` et
`Shenron-Corpus-Verify` sont désactivées et leurs processus rsync associés
arrêtés. La copie partielle privée sur le VPS n'est pas un corpus vérifié.
Le transfert média a livré une archive privée contenant la vidéo source de
681 525 411 octets et les distributions complètes de `@aphrody/bun-video` et
`@aphrody/bun-runtime-sdk`, directement vers DBFR par rsync reprenable. Son
chemin cible est `/home/ubuntu/.aphrody/profiles/dbfr/video-handoff/beerus-01/beerus-video-sdk.tar`.
Son SHA-256 distant `a91d9f4bb97fab834cc65883617b1507c2a91645112f18fa57049f2ba129af1e`
égale celui de l'archive locale ; les trois contenus ont aussi passé leurs
vérifications. Le manifeste historique indique encore
`publicPublicationQualified=false` ; l'attestation ultérieure du propriétaire
est conservée séparément dans le store privé.
Aucune suppression locale n'a été effectuée.

Les fichiers `.env` de Shenron, la base de cookies Crunchyroll et le HAR requis
ont été copiés séparément dans les stores privés de DBFR, avec permissions 600
et SHA-256 identiques à leurs sources. Les environnements locaux sont conservés
comme imports, sans écraser la configuration de production. Le catalogue SQLite
Bun Video et ses références privées ont été copiés dans un dossier distinct :
deux SQLite intègres et 206 objets SHA-256, tous vérifiés avec permissions 600.
Ce snapshot DBFR n'est pas un writer. Le site Bun Video local utilise désormais
son catalogue Neon ; le consommateur DBFR n'a pas été basculé.

L'inventaire des fichiers SQLite sous `data/` (répertoires ignorés inclus)
compte sept bases. Quatre sont des miroirs historiques du VPS et une est un
miroir `knowledge.db` de DBFR : leurs empreintes SHA-256 correspondent aux
fichiers encore présents sur ces hôtes au contrôle du 13 octobre. Le
`data/home/agent-home/db/aphrody.sqlite` local (1 441 792 octets, daté du
7 octobre) n'a pas de correspondant actif confirmé sur DBFR ; il reste
protégé jusqu'à qualification de sa provenance. Aucun de ces miroirs n'est
promu comme nouveau writer PostgreSQL ni envoyé une seconde fois au cloud.

La pipeline privée `dbfr-private-pipeline.sh` a réussi sur DBFR : MP4 H.264/AAC
1280×720 de 259 771 165 octets et 1 397,688 secondes, SHA-256
`db34b27925caeb0f21b3b04aff71c1ce5e8bb544bdb479c0204591c30f13d473`,
et poster WebP de 6 284 octets, SHA-256
`d566c212b5849bb7c92307155cf9e349f360ddf4a8244833fbb5792b485d6768`.
Le helper Infra a publié atomiquement ces deux seuls fichiers sur le disque
public DBFR, avec empreintes égales. La release `9bd60d67c72abac7ea6f53f14c958a78073f0e41`
a ensuite été vérifiée et activée par l'adaptateur Docker Infra officiel ; le
site, le bot et la gateway sont `healthy`. Le MP4 public est vérifié par Range
206 avec longueur et Content-Range cohérents. Le propriétaire a
attesté dans `AGENTS.md` la diffusion mondiale sans échéance connue de la vidéo
complète et de ses versions compressées ; le texte privé n'a pas été vérifié
indépendamment. Aucun effacement automatique n'est programmé.

## Écarts vérifiés et transferts du 13 octobre

Un audit HTTP des 151 routes audio/vidéo du catalogue a relevé 75 réponses
`404` ; la comparaison des autres chemins avec le `public` scellé et la
configuration Nginx en a relevé 45 de plus. Les 120 routes ont été testées.
Leurs objets R2 existaient déjà et ont été vérifiés par taille, empreinte ou
lecture intégrale ciblée : aucun nouvel upload n'était nécessaire. Les
correctifs de la gateway Aphrody (`b3b9905966`, `3cbb0e8259`) couvrent les
120 routes historiques. Après activation de la release `9bd60d67`, les 118
routes toujours référencées répondent `200/118`. Les deux autres sont des
anciens WASM non référencés par le code courant ; les nouveaux WASM de Shenron
et Next répondent `200`. Le reçu détaillé est
`var/reports/cdn-gap-fresh-20261013/current-assets-final.json`.

La règle Cloudflare `aphrody-origin-cdn` a activé les requêtes Range vers
l'origine. Le service natif DBFR intègre `5560a8cb`; les contrôles publics Range
de Bardock et Beerus renvoient `206`, `Content-Length: 1024` et le
`Content-Range` attendu. La release site/CDN est active ; 118 routes courantes
sur 118 passent le HEAD public.

Le bot actif DBFR écrit encore certaines données runtime en SQLite. Un timer
Infra actif, déclenché automatiquement et idempotent, réplique vers PostgreSQL
les journaux d'action, évaluations RAG, profils Discord, contacts et messages
privés ainsi que les sanctions ; les identifiants en collision utilisent une
provenance et des IDs négatifs stables. Au dernier contrôle, 343 profils
Discord sont relus dans PostgreSQL après de nouveaux événements bot. Le
writer PG prioritaire des profils est poussé (`cfd729ba`), mais attend une
nouvelle image bot. Les writers DM et sanctions restent SQLite : leur passage
PG demande un adaptateur avec idempotence des opérations Discord.

Les 20 variantes locales de `economy_index`, `race_level_roles` et
`card_themes` ont été archivées par empreinte dans une table PostgreSQL
privée (`bot.sqlite_runtime_variants`), sans modifier les tables canoniques.
Le rejeu n'a inséré aucun doublon. L'inventaire privé `data/home` et `data/rag`
du 13 octobre à 17:44 UTC compte 1 044 fichiers et 710 SHA-256 distincts :
640 empreintes existaient déjà dans les workspaces DBFR/VPS, 29 objets RAG
étaient déjà archivés et ont été revérifiés, et 41 objets supplémentaires
(102 254 637 octets), dont `aphrody.sqlite`, ont été transférés dans le store
privé DBFR. Les 41 objets ont été relus par SHA-256, avec répertoire en mode
700 et fichiers en mode 600 ; le reçu reste privé dans
`var/reports/storage-cluster/private-home-rag-archive-20261013.json`.
Les 314 fichiers `data/rag/raw/aphrody` identiques aux miroirs n'ont pas été
recopiés. Ces archives n'activent aucun writer ni nouveau corpus RAG ; une
modification ultérieure d'un fichier privé exige un nouveau contrôle de son
empreinte.

## Placement exclusif

PostgreSQL DBFR reste la source éditoriale. Aucune requête éditoriale n'est
envoyée aléatoirement à une autre base : sans les mêmes données, le résultat
serait incomplet. Une réplique complète contredirait l'absence de doublons.
Seuls de nouveaux jeux SQL publics, déclarés détachables par leur propriétaire,
peuvent être placés sur Neon ou Supabase. Aucune table actuelle n'a été déclarée
détachable par cet audit ; aucun DDL/DML ni transfert n'a été exécuté.

Les objets publics utilisent une identité SHA-256 et un emplacement unique.
L'emplacement déjà déclaré reste stable ; une panne ou un quota de lecture
ne déclenche pas une copie automatique. Un nouvel objet va vers un propriétaire
compatible avec une marge vérifiée. Une même empreinte avec une taille ou un
propriétaire contradictoire provoque un refus. Les données privées restent
dans leurs stores DBFR et ne sont jamais exportées implicitement.

Le propriétaire de publication est `deploy/cloudflare/cli/publish-catalog.ts`
avec son verrou partagé et ses clés `_objects/<sha256>`. Le repli Nginx vers
`cdn-origin.ts` continue de lire R2/S3 : il couvre certaines erreurs Workers,
mais ne couvre pas une indisponibilité ou un quota R2. Aucun second uploader,
writer PostgreSQL ou fallback vers les projets d'autres produits n'est ajouté.

## Gratuité et activation

Les allocations gratuites sont des limites, pas une capacité illimitée :
[R2 Standard](https://developers.cloudflare.com/r2/pricing/) inclut 10 GB-month,
1 million d'opérations A et 10 millions B mensuelles ; son dépassement peut être
facturé. Ces allocations sont partagées au niveau du compte avec les autres
buckets, y compris les sauvegardes. [Workers Free](https://developers.cloudflare.com/workers/platform/limits/)
inclut 100 000 requêtes quotidiennes par compte.
[Supabase Free](https://supabase.com/pricing) inclut 500 Mo de base par projet,
1 Go de fichiers, 5 Go de transfert non caché et 5 Go caché ; deux projets actifs
au maximum. Neon expose les limites effectives du projet dans son API ;
les annonces et anciennes pages peuvent différer de ces limites.

Un préflight doit refuser de planifier une nouvelle allocation si la mesure
de consommation est inconnue ou périmée. Les réservations du plan restent
locales au calcul : elles ne sont pas des réservations transactionnelles
entre plusieurs writers ni une protection de facturation active.

Le préflight est `scripts/ops/storage-cluster-plan.ts`. Il lit un JSON contenant
`observedAt`, `providers` (`dbfr`, `neon`, `supabase`, `r2`) et `inventory`.
Chaque fournisseur décrit `enabled`, `health`, le périmètre de ses mesures,
et les budgets `storageBytes` / `writeOperations` sous la forme
`{used, limit, reserved}`. Les demandes explicites de transfert ou de calcul
exigent aussi les mesures correspondantes. Les limites effectives doivent
tenir compte des plafonds du projet et des consommations mutualisées.
Les entrées décrivent uniquement `sha256`, `size`, `kind`, `public`,
`detachable`, `owner` éventuel et les coûts attendus ; aucun contenu, chemin
privé, URL signée ni identifiant secret n'est accepté.

Exécution avec un dossier de rapport déjà créé :

```sh
bun scripts/ops/storage-cluster-plan.ts --input /chemin/prive/snapshot.json --out var/reports/storage-cluster/placement.json
```

Le rapport est créé exclusivement, sans écraser de fichier. Le code de sortie
est 0 pour un plan possible, 2 pour des allocations sans capacité et 1 pour
un préflight refusé. `active=false` et `reservationsAreGlobal=false` figurent
toujours dans la sortie. Ce script ne modifie ni le service CDN, ni les bases,
ni les comptes fournisseurs ; un plan possible ne garantit pas la disponibilité
des placements conservés. `var/reports/storage-cluster/preflight.json`
consigne les observations de cette session, sans servir de snapshot de capacité.

La répartition du stockage entre DBFR, Neon et Supabase reste inactive : elle
exige encore des mesures fraîches de consommation mensuelle R2 et des autres quotas,
inventaire complet avec propriétaires exclusifs et données éligibles,
registre de placement et budgets transactionnels dans le propriétaire
canonique, routage des consommateurs, puis qualification d'écritures/lectures
réelles avant l'activation par Infra. Les transferts privés ci-dessus ne sont
pas une activation du cluster. La release Shenron `9bd60d67` est déployée, mais
aucune bascule de données SQL vers Neon/Supabase ni modification DNS n'a eu lieu.
