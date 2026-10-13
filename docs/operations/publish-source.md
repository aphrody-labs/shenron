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
secondes (900). À profondeur0, la découverte des sitemaps est désactivée :
la commande qualifie uniquement la page explicitement sélectionnée. La
profondeur récursive par défaut5 conserve les sitemaps. Une frontière restante
ou une erreur interdit la publication.
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

## Transcription visuelle relue

Pour une page dont le texte existe uniquement dans des PNG, fournir séparément
`--reviewed-input /chemin/prive/reviewed-input.json --reviewed-sha256 <SHA256>`.
Ce JSON régulier privé ≤2MiB suit strictement le contrat :

```json
{
  "schema": "shenron-reviewed-transcription/v1",
  "sourceUrl": "https://publisher.example/interview",
  "targetUrl": "https://dragonballfr.com/publications/interview",
  "reviewed": true,
  "method": "direct_visual_transcription",
  "language": "ja",
  "title": "対談",
  "text": "日本語の対談\n",
  "textSha256": "<SHA256 des octets UTF-8 exacts de text>",
  "sourceImages": [{ "url": "https://publisher.example/img.png", "sha256": "<SHA256 PNG>" }],
  "nativeOcr": { "qualified": false, "status": "failed" }
}
```

Préparer avec `--max-requests 1 --max-depth 0`, puis appliquer avec les mêmes
arguments et `--plan-sha256 <SHA256 physique de plan.json> --apply`.
Le plan épingle le JSON, le texte, les URL et les images ; il ne publie rien.
L’application conserve le crawl natif intact et exige son unique page source
HTTP200. Elle publie le texte relu distinct, sans remplacer le Markdown vide
dans la frontière SQLite. Les images sont des URL HTTPS publiques uniques du
même hôte, jamais des fichiers locaux arbitraires : chaque GET frais doit
répondre200 avec des octets PNG et le SHA épinglé, dans les budgets habituels.

`native-export.jsonl` garde exclusivement la capture native ; l’entrée séparée
`reviewed-export.jsonl` porte la catégorie `reviewed-visual-transcription`.
L’index public v1 et la provenance du writer canonique identifient la méthode,
la langue, les SHA originaux, l’empreinte de la capture native séparée et
l’OCR natif non qualifié. Les droits RAG, entraînement et canon restent faux.
Le statut OCR est `failed` si une tentative a réellement échoué, ou
`not_requested` si aucune tentative n’a été effectuée ; jamais un succès implicite.
Les notices existantes restent protégées ; un refus de hash ou une capture
incomplète interdit l’activation. Une transcription visuelle relue ne constitue
pas une réussite OCR native.

## Finalisation après une qualification CDN reprise

Si l’activation est réelle mais qu’un GET de qualification a échoué, conserver
le job et son échec. Ne pas relancer le crawl ni le lot d’uploads. Le propriétaire
CDN qualifie intégralement le candidat actif, contrôle son code, ses settings,
son déploiement et les empreintes, puis adopte cet état qualifié par comparaison
optimiste. Le reçu de cette qualification reste privé et épinglé par SHA.

Pour une transcription relue, la CLI peut ensuite terminer uniquement le writer :

```sh
publish-source --source <source-originale> --target <cible-originale> --job <job-original> --max-requests 1 --max-depth 0 --timeout 1800 --reviewed-input <JSON-original> --reviewed-sha256 <SHA-original> --plan-sha256 <SHA-plan-original> --finalize-qualified <recu-prive> --qualified-sha256 <SHA-recu> --original-export-sha256 <SHA-reviewed-export.jsonl> --registry-before-sha256 <SHA-registry-before.json> --apply
```

Cette opération exige `verifyQualifiedPublication` du propriétaire CDN installé.
Elle vérifie les fichiers originaux, le texte, les neuf images ou le nombre
épinglé, la provenance, le plan propriétaire, les empreintes du SDK et du
manifest, la base active et le snapshot PostgreSQL avant toute écriture.
Les objets publics et l’index no-store sont relus aux deux origines ; le tuple
actif et l’état partagé restent stricts. Le writer canonique conserve les
identités présentes, vérifie les champs et la provenance des nouveaux records,
puis relit la qualification. `finalization-receipt.json` distingue cette reprise :
zéro nouveau crawl, upload ou PATCH, aucune promotion canonique. Les traces
`EXIT_CODE=1` originales restent intactes.

Après la relecture PostgreSQL, `registry-after.json` et un reçu privé de phase
conservent le résultat réel avant le dernier contrôle CDN. Si ce contrôle échoue,
la même commande reprend sans écriture PostgreSQL, uniquement si le snapshot
actuel correspond exactement au snapshot enregistré et aux empreintes originales.
Une interruption entre le commit PostgreSQL et ce reçu de phase est refusée si
le snapshot initial a changé : elle exige une qualification indépendante et ne
se transforme jamais en succès implicite.
