<!-- SPDX-License-Identifier: Apache-2.0 -->

# Collecte et livraison natives Bun

Le propriétaire est `scripts/ops/bun-source-pipeline.ts`. Il relie le collecteur
`Bun.Crawl`, le registre PostgreSQL existant via `Bun.SQL`, l'acquisition HTTP et
le stockage de contenu adressé par SHA-256. Les dernières étapes passent par les
propriétaires RAG et Infra existants. Les captures, configurations et reçus sont
privés ; ils ne font pas partie du paquet npm ni du dépôt.

## Exécution

Exécuter d'abord `bun scripts/ops/bun-source-pipeline.ts doctor`. L'absence d'un
fournisseur natif requis est une erreur de qualification : un nom de paquet ou
une compilation réussie ne prouvent pas son fonctionnement.

Placer une configuration versionnée dans un répertoire privé, avec des chemins
absolus. Exemple minimal pour traiter un export déjà capturé :

```json
{
  "version": 1,
  "input": "/app/data/source-campaign/export.jsonl",
  "policy": "/app/data/source-campaign/policy.json",
  "job": "/app/data/source-campaign/delivery",
  "maxDocuments": 1000,
  "autoMedia": true,
  "transport": "fetch",
  "concurrency": 1,
  "timeoutMs": 30000,
  "maxBytes": 8388608,
  "maxCycleFiles": 8,
  "maxCycleBytes": 33554432
}
```

La politique doit respecter `crawlIngestPolicySchema` dans
`packages/pipeline/src/dragon-ball/crawl-ingest.ts`. Elle épingle les domaines,
la provenance et les droits de chaque source. Le stockage CDN, le RAG et le
déploiement nécessitent leurs configurations explicites ; cet exemple ne les
active pas. Les identifiants SQL restent dans `DATABASE_URL`, les identifiants
du stockage dans le profil protégé de son propriétaire.

```sh
bun scripts/ops/bun-source-pipeline.ts plan --config /app/data/source-campaign/config.json
bun scripts/ops/bun-source-pipeline.ts collect --config /app/data/source-campaign/config.json
bun scripts/ops/bun-source-pipeline.ts plan --config /app/data/source-campaign/config.json
bun scripts/ops/bun-source-pipeline.ts apply --config /app/data/source-campaign/config.json --plan-sha256 SHA_DU_PLAN
bun scripts/ops/bun-source-pipeline.ts verify --config /app/data/source-campaign/config.json
```

Le deuxième plan lie les médias effectivement acquis. `auto --config …` enchaîne
les étapes avec des révisions et reçus épinglés. Le code de sortie `2` signale un
cycle incomplet ; il ne signifie pas que toute la campagne a été livrée. Les
quotas limitent chaque cycle, les checkpoints permettent la reprise. Des sources
manquantes, une quarantaine ou une campagne incomplète empêchent l'activation
publique et la livraison finale.

Pour lancer la collecte elle-même, ajouter `crawl` avec `mode: "run"`, les
chemins absolus `config` et `output`, et éventuellement `sources`, `maxRequests`
et `timeoutMs`. `mode: "attach"` vérifie la campagne existante. Le collecteur
utilise directement l'action `dragon-ball` de `Bun.Crawl` ; le rendu navigateur
non disponible est refusé explicitement. Les reçus sont propres à chaque source
et épinglent la politique, plutôt que de prendre le dernier rapport global pour
preuve de complétude.

## Automatisation et vérification

En production, utiliser le job `source-pipeline` du registre existant du bot.
Les deux variables et les contraintes de placement sont décrites dans
[ENV.md](ENV.md). Ne pas superposer `--watch` ou un second ordonnanceur à ce job.
Son arrêt attend l'annulation du cycle avant de fermer les bases.

La vérification SQL compare les identités et valeurs réellement relues. Celle
du stockage vérifie les octets signés et leur SHA-256, en plus des métadonnées.
Un objet stocké ne prouve ni la publication d'un manifeste ni sa visibilité
publique. La livraison RAG doit retrouver la source attendue par le lecteur
produit, avec son vecteur si demandé. Un filtre éditorial qui exclut une source
reste applicable après ingestion.

Le déploiement exige une release scellée, les empreintes attendues, un plan
Infra avant application et une sonde produit après application. La fabrique
qualifie séparément le runtime de construction et les exécutables compilés du
site et du bot. Les clés Jev et le bouton Canon restent des réglages serveur
distincts ; une clé préparée dans un fichier ne prouve pas son chargement par
le processus actif.

## Index vectoriel

`packages/pipeline/scripts/rag-vector-sidecar.ts` prépare une projection hors
ligne des vecteurs PostgreSQL existants vers `Bun.VectorIndex`. Le snapshot lie
la génération du propriétaire, le modèle, la dimension et les empreintes du
mapping UUID/clé et des vecteurs. Il ne copie pas les textes, ne recalcule pas
les embeddings et n'active aucun lecteur. Un changement de génération invalide
la projection. Le lecteur produit, ses filtres et son hydratation doivent être
qualifiés avant tout basculement.

Le lecteur bot optionnel `RAG_BACKEND=bun` conserve les filtres d’origine, le
mapping UUID, l’hydratation PostgreSQL et la fusion RRF. Le modèle d’embedding
reste celui du service HTTP configuré ; `Bun.VectorIndex` ne fournit pas cette
inférence. Les variables `SHENRON_VECTOR_SIDECAR_*` épinglent le bootstrap ;
`SHENRON_VECTOR_REFRESH_ROOT`, `SHENRON_VECTOR_REFRESH_INTERVAL_MS`,
`SHENRON_VECTOR_REFRESH_MIN_FREE_BYTES` et
`SHENRON_VECTOR_REFRESH_MAX_INDEX_BYTES` bornent explicitement le refresh.
Le répertoire doit être privé, absolu et canonique. Aucun backend n’est activé
par la livraison de ces sources.

Le propriétaire Cron existant observe deux fois une génération stable, puis
exporte par lots de128, construit dans le worker embarqué, vérifie et publie
atomiquement le pointeur privé. Il partage le pool PostgreSQL existant et un
verrou transactionnel ; il n’ajoute ni service ni minuteur récurrent. Une dérive
de génération rend la recherche temporairement indisponible, sans repli périmé.
Les requêtes déjà engagées libèrent leurs leases avant fermeture de l’ancien
index. L’arrêt attend le worker et ses RPC PostgreSQL avant fermeture du pool.
L’annulation reste coopérative pendant un appel natif synchrone.

Avant activation, qualifier le binaire bot compilé et son worker avec le vrai
snapshot, une reconstruction, une réouverture et une recherche filtrée. Mesurer
le pic RSS/cgroup durant la coexistence ancien index + worker, puis ancien +
nouveau lecteur : la limite de768MiB porte sur le fichier index, **pas** sur sa
mémoire résidente. Le conteneur de3GiB ne constitue donc pas une preuve que le
refresh tient en mémoire. Pour257386 vecteurs384D, l’export représente
395344896octets de vecteurs et environ17,7Mo de mapping ; conserver une réserve
disque d’au moins2GiB et mesurer aussi les métadonnées et buffers. Garder les
reçus de génération, empreintes, pic mémoire et santé avant tout basculement.
La rétention supprime uniquement les générations gérées et vérifiées hors
current+previous ; le bootstrap externe et les artefacts sans reçu valide
restent protégés et exigent une récupération propriétaire explicite.

## Découverte Search optionnelle

La configuration privée peut ajouter `search` avec `queries` (1–8 recherches),
`domains` (1–8 domaines explicites), `count` (1–20), `cookieJar` (chemin absolu
canonique, fichier privé) et `timeoutMs` (maximum120000). Le plan épingle cette
entrée ; seul `collect` lance `bun search --json`. Chaque recherche ajoute les
restrictions `site:` validées, refuse les résultats hors domaines et borne la
sortie à256Kio. Le cookie jar passe par `APHRODY_GOOGLE_COOKIES_JSON`, jamais
par les arguments ni les journaux. Le reçu privé et son empreinte sont repris
par le journal existant ; un replay ne relance pas la recherche.

Ces résultats sont uniquement des pistes de découverte avec provenance. Ils
n’ajoutent aucune source autorisée au crawl, aucune entrée PostgreSQL, aucun
canon ni publication. Le runtime doit réellement fournir la commande Search
qualifiée ; une commande absente ou un refus d’authentification échoue sans
repli. L’isolation VPN appartient au job hôte qualifié qui lance le pipeline :
aucune option publique de commande shell ou namespace n’est acceptée ici.
