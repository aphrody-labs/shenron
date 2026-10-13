<!-- SPDX-License-Identifier: Apache-2.0 -->

# Publication d’une source publique

Depuis un hôte propriétaire qualifié Bun1.4.4, préparer un plan déterministe puis
appliquer exactement les mêmes paramètres dans un job privé neuf :

```sh
bun scripts/ops/publish-source.ts --source https://publisher.example/guide --target https://dragonballfr.com/publications/guide --job /chemin/prive/source-guide
bun scripts/ops/publish-source.ts --source https://publisher.example/guide --target https://dragonballfr.com/publications/guide --job /chemin/prive/source-guide --apply
```

La cible accepte exclusivement `/publications/<slug>` sur dragonballfr.com :
elle correspond à la route dynamique réelle. Son déploiement initial qualifié
est nécessaire ; les publications suivantes réutilisent cette route sans
nouveau build Next. Le plan
ne lance aucun crawl, upload ou writer. `--apply` compare son contenu épinglé,
refuse de réutiliser un job déjà commencé, puis appelle `aphrody web crawl`
avec robots, sitemaps et domaine source unique. Options communes :
`--max-requests 1..256` (256), `--max-depth 0..10` (5), `--timeout 1..1800`
secondes (900). Une frontière restante ou une erreur interdit la publication.
« Complète » qualifie cette frontière bornée, pas toutes les API du fournisseur.

Le job conserve SQLite, markdown, stderr et snapshots privés. Seuls les objets
explicitement projetés dans `public/` sont livrés : index JSON ≤2MiB,
256documents, textes ≤1MiB, images Markdown du même domaine ≤96objets,
16MiB/objet et128MiB au total. Les images étrangères et fournisseurs protégés
restent des références ; les iframe, vidéo et API paginées ne sont pas acquis
par cette commande. La décision propriétaire de publication doit couvrir les
textes et médias de la source sélectionnée. Aucun RAG, entraînement ou canon
n’est activé.

L’environnement privé existant fournit `DATABASE_URL`, `APHRODY_CLI` éventuel,
`SHENRON_SOURCE_CDN_MODULE` (chemin absolu installé du propriétaire
`deploy/cloudflare/cli/publish-catalog.ts`) et `SHENRON_SOURCE_CDN_CONFIG`
(JSON régulier0600 contenant les chemins du contrat propriétaire :
`previousInventory`, `previousInventorySha256`, `manifest`, `profile`,
`tokenFile`, `sdkModule`, `stateDirectory`, `expectedDeployment`,
`expectedCodeSha256`, `expectedPrefix`, `inventoryRoot`, `workerOrigin`,
`cdnOrigin`). Le job CDN doit vivre sous le `inventoryRoot` privé déclaré ;
`stateDirectory` est commun aux publications. Le module propriétaire relit
son `current-inventory.json` qualifié pour la prochaine base, sans réutiliser
un ancien préfixe actif. Les identifiants restent dans les stores Infra ;
aucun secret n’est passé en argument ni affiché. Le runner se lance via Infra
sur le contexte qui possède ces droits, jamais par import d’auth sur le poste.

Le module CDN conserve l’union active, vérifie les octets indépendamment,
puis active le nouvel index. Le wrapper prépare son plan CDN, épingle
`planSha256`, puis applique uniquement cette identité. L’ingestion utilise `ingestNativeCrawl` et
`createPostgresCrawlRegistry`, sans créer de schéma ni modifier le canon.
`registry-before.json` sauvegarde les identités concernées ; la relecture
contrôle leur cardinalité et leurs hashes. Le wrapper conserve intégralement
les notices déjà présentes : un shell HTML pauvre ne remplace pas leurs
titres, extraits, classifications ou provenance éditoriale. Archive.org garde
la classification `archive` pour les nouvelles identités. Une mise à jour de
metadata existante exige son propriétaire explicite. `receipt.json` distingue cible
demandée, URL réelle, documents, couverture médias et reçu CDN. Une erreur
après une phase ne constitue pas un succès global : inspecter les reçus privés
avant toute reprise ; aucun rollback ou replay implicite n’est exécuté.

Tout lancement distant long passe par un job tmux borné et journalisé avec
`EXIT_CODE`, puis un contrôle réel de la cible, des SHA CDN et du catalogue.
Les tests unitaires du script ne prouvent pas une publication de production.
