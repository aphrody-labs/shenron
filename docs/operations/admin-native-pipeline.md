<!-- SPDX-License-Identifier: Apache-2.0 -->

# Pilotage natif depuis le dashboard admin

Le dashboard consomme le backend Bun du bot par le proxy admin existant. Next ne
charge aucune bibliothèque FFI. Le panneau partagé dans `@aphrody/shenron-ui` utilise les
composants Material 3 d’Aphrody. Les mesures ABI/version et les statistiques RAG
proviennent de `@aphrody/shenron-native` ; le test WASM charge le binaire publié et exécute
le parseur Rust PUP dans le navigateur.

## Contrat

- `GET /api/admin/pipeline` : versions natives, statistiques RAG, actions installées
  et les 50 derniers jobs. Une bibliothèque absente renvoie des mesures nulles.
- `POST /api/admin/pipeline`, corps `{ "action": "identifiant-installé", "id": "uuid" }` :
  réserve un job idempotent puis exécute le plan natif. Réponse 202.
- `POST /api/admin/pipeline/:id/cancel` : transmet l’annulation au moteur natif.
  L’état terminal est publié après le retour du moteur, pas à l’envoi de la demande.

Les trois routes utilisent la garde admin du bot. Le proxy du site vérifie
également l’administration avant de transmettre son jeton serveur. Aucun argument
de commande, chemin de fichier, hôte ou jeton n’est accepté depuis le navigateur.

## Provisionnement par le propriétaire Infra

Déclarer sur le backend Bun :

- `SHENRON_ADMIN_PIPELINE_CONFIG` : chemin absolu du fichier privé de plans, mode 600
  sur Linux ; ne jamais mettre ce fichier dans Git ni dans l’image publique.
- `SHENRON_ADMIN_PIPELINE_HOME` : dossier absolu privé et persistant du journal SQLite.
- `SHENRON_ADMIN_PIPELINE_HOST` : rôle réellement qualifié de ce backend (`dbfr` ou `vps`).
- Les bibliothèques vérifiées `SHENRON_FFI_LIB` et `APHRODY_FFI_LIB`, ainsi que la
  configuration du profil dbfr des capacités propriétaires, restent propres à l’hôte.

Exemple de structure à adapter aux chemins, permissions et capacités **installés** :

```json
{
  "plans": [
    {
      "id": "rag-stats",
      "category": "rag",
      "engine": "shenron",
      "target": "dbfr",
      "args": ["rag", "stats", "--json"],
      "probe": ["rag", "stats", "--json"],
      "timeoutMs": 30000
    },
    {
      "id": "shenron-bot-restart",
      "category": "docker",
      "target": "dbfr",
      "args": ["infra", "service", "restart", "--id", "shenron-bot", "--target", "dbfr", "--json"],
      "probe": ["infra", "service", "status", "--id", "shenron-bot", "--target", "dbfr", "--json"]
    }
  ]
}
```

Le catalogue Infra doit pointer vers les conteneurs actifs. Les catégories
acceptées sont `rag`, `crawl`, `llm`, `training`, `docker`, `pipeline` ; leur
propriétaire natif est respectivement `rag`, `web`, `model`, `train`, `infra`, `web`.
L’option `engine: "shenron"` utilise directement les commandes RAG et
entraînement disponibles dans `libshenron_ffi`, sur son pool de workers ; les
autres plans utilisent la bibliothèque canonique Aphrody. Les deux chemins restent
en processus, sans repli vers un exécutable. Shenron propose les candidats
d’embeddings/reranker ; LoRA appartient au propriétaire Aphrody.
Les sondes sont en lecture seule. Les commandes Docker doivent préciser un service
Shenron et un hôte. Les autres commandes tournent sur le backend Bun courant ;
elles sont refusées si son rôle ne correspond pas. Un entraînement exige `vps` :
ce contrat ne transforme pas DBFR en machine de calcul et ne simule pas une
exécution distante. Un backend de calcul qualifié doit être raccordé avant de
permettre son lancement depuis DBFR.

Les arguments de LoRA suivent le propriétaire installé : `train run --kind lora`,
avec les chemins privés d’entrée, gold, modèle et sortie. Les rollouts ou les
évaluations RAG ne valent pas entraînement. La promotion automatique n’est pas
implémentée dans le propriétaire inspecté le 2026-10-10 et ne doit pas être annoncée.
Le gel éditorial des databooks reste applicable aux plans de pipeline.

## État et qualification

Une seule action locale tourne à la fois sur ce backend. Le journal contient l’identifiant,
l’action, les dates, l’état et le code natif. Les sorties capturées ne sont pas
recopiées : elles peuvent contenir des données de fournisseur. La consultation
des résultats détaillés reste celle du propriétaire, dans ses magasins isolés.
Un redémarrage classe les actions locales en cours comme interrompues ; aucune
relance implicite ni réussite inventée. Le dossier de contrôle est réservé à un
seul processus de backend, sans partage entre réplicas.

### File Web distribuée

`SHENRON_ADMIN_WEB_CONFIG` désigne un fichier JSON privé absolu (0600 sous Linux).
Il déclare les hôtes déjà qualifiés et les seuls workflows proposés à l’admin :

```json
{
  "hosts": [
    { "id": "vps", "config": "/private/vps-mcp.json", "slots": 2, "workerReady": true },
    { "id": "dbfr", "config": "/private/dbfr-mcp.json", "slots": 2, "workerReady": true }
  ],
  "actions": [{ "id": "web-index", "args": ["crawl-index", "--help"], "maxAttempts": 1 }]
}
```

L’exemple teste l’aide ; remplacer les arguments par un workflow qualifié avant
une acquisition réelle. `workerReady` constate une qualification préalable et
n’installe aucun worker. Le panneau sonde la file native par MCP avant de proposer
les actions. Les secrets restent dans les fichiers MCP du propriétaire.

Le contrôleur réutilise `AphrodyWebJobs` : files et leases Aphrody, placement selon
les slots et la charge, réservation durable avant soumission, même clé sur le même
hôte après perte d’accusé de réception. Les actions `web-*` peuvent être lancées
simultanément. Les journaux SQLite locaux restent privés et ne sont jamais partagés
sur le réseau. Une reconnexion du dashboard réconcilie les jobs distants ; une panne
conserve le dernier état reçu. L’annulation attend le reçu natif, sans simuler un
arrêt. Le panneau n’expose que l’hôte, l’identifiant distant, l’état et les dates ;
les contenus scrapés et erreurs fournisseurs restent dans le magasin privé.

Ces contrats et leur reprise sont testés localement ; ils ne prouvent pas encore
un crawl distribué en production. Le serving CDN, les migrations SQL par Infra et
l’ingestion Redis restent des étapes à raccorder et à qualifier sur leurs services
réels. Aucun `db:push` ni publication implicite de corpus privé n’est introduit.

Au contrôle du 2026-10-10, les CLI installées sur Windows, VPS et dans le conteneur
compute DBFR refusent `rag` et `train` faute de features. Les commandes Infra de
catalogue échouent aussi sans la racine/configuration qualifiée. Avec
la configuration Infra qualifiée de DBFR, la sonde
`service status --id shenron-bot --target dbfr --json` identifie réellement
`docker:aphrody-bot-1` comme `running/healthy`. Aucun plan de
mutation n’a été installé pour contourner ces erreurs. Le panneau affiche ces
limites. La qualification locale de code et de WASM ne prouve ni l’activation des
capacités ni leur livraison en production.

La bibliothèque de l’image du bot en production a été chargée dans un conteneur
éphémère de cette même image, réseau coupé et système de fichiers en lecture
seule : ABI **5**, version **1.3.0**, Bun **1.4.3**, cible **x86_64**. Ce contrôle
valide réellement les exports et les métadonnées de `libshenron_ffi.so` ; il ne
vaut pas chargement du nouveau dashboard dans le processus de production.

Le nouveau contrôleur a ensuite exécuté un **vrai job de recherche du canon
local** (`engine: shenron`, `rag local`, pool FFI) dans cette image : état
`succeeded`, code natif `0`, reçu SQLite persistant. Le conteneur de qualification
avait un `/tmp` éphémère, aucun réseau ni magasin privé monté. Ce succès ne dépend
pas de la feature `rag` de la CLI Aphrody et ne qualifie pas les crawls, LoRA ou
les mutations Docker encore non installés.
