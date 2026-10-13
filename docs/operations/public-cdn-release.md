<!-- SPDX-License-Identifier: Apache-2.0 -->

# Publication CDN commune aux sources et aux releases

La capacité propriétaire `deploy/cloudflare/cli/publish-catalog.ts` publie les
sources et les fichiers d’une release scellée dans le même plan de contrôle.
Tous les callers utilisent le même `stateDirectory` privé et son `publish.lock`.
Un script local qui PATCH directement les bindings sans ce verrou peut faire
échouer un autre lot ; il ne constitue pas la route canonique de publication.

La commande reste `publish-catalog --options <JSON-prive>` puis
`--apply --plan-sha256 <SHA-plan>`. Le plan ne modifie pas le CDN distant.
Le JSON contient les références protégées habituelles, sans valeurs de secrets.
Pour les sources, `publicRoot` reste limité à `/publications/<slug>` et aux objets
adressés par leur contenu. Pour une release, ajouter explicitement :

```json
{
  "targetUrl": "https://dragonballfr.com/",
  "publicRoot": "/job-prive/extracted",
  "siteRelease": {
    "siteRoot": "/job-prive/extracted/site",
    "staticRoot": "/job-prive/extracted/static",
    "releasePublicRoot": "/job-prive/extracted/release-public",
    "archivePath": "/job-prive/public-cdn.tar.zst",
    "archiveSha256": "<SHA256 de l’archive publique scellée>"
  }
}
```

L’archive régulière0600 ≤256MiB et les racines publiques vivent sous le
`inventoryRoot` du propriétaire. Le contrôle Infra en amont vérifie le SHA,
l’allowlist du bundle et son extraction ; aucun store, capture ou fichier d’env
ne rejoint ces racines. Les racines sont `site/public`, `static` et
`release-public` sous `publicRoot`, sans symlink. Une release ne peut pas fournir
de fichiers sous `/publications` ni `/catalog/assets` : ces espaces appartiennent
au producteur de sources et à la projection automatique.

Sous verrou, la capacité relit l’état partagé, vérifie son inventaire contre les
256 bindings réellement actifs, puis génère l’union avec les inputs de la
release. Les publications et anciens chunks restent présents ; le catalogue
public complet est automatiquement régénéré. Les objets et shards passent un
GET S3 avec SHA et metadata avant un PATCH limité aux cinq bindings de manifest.
Le code, les autres settings et les annotations manuelles restent épinglés.

`activation-receipt.json` marque l’activation réelle avant la qualification.
Un échec conserve `public-failure.json` avec uniquement route, origine, SHA,
taille et raison publique. Le tuple reste contrôlé avant et après les GET
indépendants de chaque input de la release et de chaque artefact de catalogue,
aux deux origines. L’état partagé n’avance qu’après qualification complète.
Un caller ne doit pas annoncer un succès depuis le seul checkpoint d’activation.
Les credentials, le SDK installé, le runtime et les services ne sont pas copiés
ou reconfigurés par cette publication.
