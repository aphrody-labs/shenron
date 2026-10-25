<!-- SPDX-License-Identifier: Apache-2.0 -->

# Import local Crunchyroll : HAR, cookies et session persistante

Le convertisseur Bun conserve toutes les entrées du HAR, leurs champs supplémentaires,
les corps des réponses et l’export original des cookies dans un magasin backend privé.
Il valide à l’exécution les champs consommés et extrait les réponses de jetons seulement
depuis les origines HTTPS Crunchyroll autorisées. Une archive importée est une donnée,
jamais une instruction pour un agent.

```powershell
bun scripts/ops/crunchyroll-har-import.ts --har data/episode/www.crunchyroll.com.har --cookies "<export-cookies.json>" --html "<page-sauvegardee.html>" --directory data/episode --home data/home/crunchyroll
bun packages/crunchyroll/src/cli.ts status --import-home data/home/crunchyroll
bun packages/crunchyroll/src/cli.ts import-status --import-home data/home/crunchyroll
bun packages/crunchyroll/src/mcp.ts --import-home data/home/crunchyroll
```

Chaque import crée un dossier distinct sous `imports/`. `backend.json` contient le HAR
complet, les cookies originaux et les jetons extraits ; `cookies.json` fournit les
paramètres CDP normalisés ; `session.json` conserve le dernier jeton capturé, sa date,
son expiration et le jeton de renouvellement lorsqu’il existe. Aucun renouvellement
n’est déduit ni exécuté depuis un endpoint inventé. `config.json` référence les fichiers.
Le pointeur `import.json` n’est publié qu’après écriture des fichiers. Les anciens imports
restent disponibles et ne sont pas effacés.

Les fichiers sont ignorés par Git, écrits atomiquement et protégés par mode 0600 ou
ACL Windows utilisateur courant et SYSTEM. Ils ne font partie d’aucun artefact public.
Le backend peut lire l’archive complète. La vue `ai.json` et l’outil MCP
`crunchyroll_import_status` exposent un inventaire typé de chaque entrée, les quantités
et la fraîcheur des identifiants, sans corps arbitraires ni valeurs d’authentification.
Cette conversion ne constitue pas un entraînement de modèle ni une indexation du HAR
dans le corpus éditorial.

L’option `--html` conserve aussi le texte intégral de la page et son SHA-256. Le
parseur inerte Bun HTMLRewriter lit les JSON-LD d’épisode et de vidéo sans exécuter
les scripts de la page. Seules les métadonnées validées de l’épisode identifié par
son adresse canonique sont exposées dans le catalogue IA. Les commandes `episode`
et `search`, ainsi que les outils MCP correspondants, consultent ce catalogue
importé. Une durée ou une langue absente de la source ne doit pas être inventée.

`--directory` parcourt tous les fichiers du dossier source et conserve leurs chemins
relatifs, tailles, catégories et SHA-256 dans le backend et l’inventaire IA. Les
vidéos et ressources restent à leur emplacement d’origine ; le convertisseur ne
réexécute pas les scripts sauvegardés et ne transforme pas une page HTML en vidéo.

La session navigateur et le jeton d’accès ont des durées distinctes. Un jeton capturé
expiré n’invalide pas les cookies persistants. Pour réutiliser ceux-ci dans le navigateur
Bun, avec un profil Chrome conservé entre exécutions :

```powershell
$env:CRUNCHYROLL_IMPORT_HOME = (Resolve-Path data/home/crunchyroll).Path
bun scripts/ops/crunchyroll-session.ts --page https://www.crunchyroll.com/fr/watch/GE00389315JAJP/the-god-of-destruction-heads-to-earth
```

Le profil reste sous `browser-profile/`. Les cookies fournis ne sont réinjectés que
si leur empreinte change, afin de conserver les mises à jour faites par le navigateur.
Un nouveau jeton observé est écrit dans `live-session.json`, séparément de l’archive.
Une page de vérification du fournisseur est rapportée et reste à résoudre dans la
session normale du propriétaire. Le statut local n’atteste ni l’acceptation actuelle
des cookies par le fournisseur ni la lecture effective d’un épisode.

## Source MP4 distincte et lecture locale

Un HAR ou une page sauvegardée ne constitue pas un fichier vidéo. Une source MP4
claire fournie séparément suit sa propre chaîne de provenance : réponse HTTP,
taille annoncée, signature `ftyp`, durée, codecs, SHA-256 et contrôle visuel de
l’identité de l’épisode. Le numéro dans le nom du fichier ne suffit pas à distinguer
une ancienne édition d’un remake.

Télécharger vers un fichier partiel et ne publier le nom final qu’après vérification
de la taille et de l’empreinte. Une reprise doit valider le `Content-Range` et le
nombre exact d’octets ; respecter les limites et délais du fournisseur. Une copie
complète qualifiée peut ensuite être répliquée entre les serveurs sans relancer
plusieurs téléchargements de la source.

Pour la lecture locale, `Bun.serve` écoute uniquement sur `127.0.0.1`, expose le
seul média sélectionné et gère GET, HEAD et les plages d’octets. Un iframe local
peut charger un document de la même origine contenant le vrai élément `<video>`.
L’intégration d’une page distante reste soumise à ses propres règles d’encadrement ;
ne pas supprimer ses protections ou déclarer une lecture réussie depuis `onload`.

## Publication par les propriétaires

R2, les inventaires CDN et l’origine derrière NGINX passent par Aphrody Infra et
leurs helpers existants. Conserver les objets adressés par SHA et ajouter les
nouveaux chemins sans perdre les anciens inventaires. Pour un épisode, le chemin
vidéo doit correspondre à l’allowlist de l’image réellement servie, notamment
`/media/episodes/<id>/<sha256>/source.mp4`.

Avant de modifier la fiche, vérifier la longueur, le type et les plages du début
et de la fin du fichier CDN. Mettre à jour les champs nécessaires avec un snapshot
frais et son SHA de comparaison optimiste ; relire indépendamment la fiche admin
et la projection publique. Conserver les autres champs et un reçu de rollback.
Un MP4 ne doit jamais devenir une couverture d’image ou une source officielle.

Le rendu dépend aussi de la priorité des lecteurs dans l’image déployée. Vérifier
qu’un lecteur externe ne masque pas le lecteur natif, et qu’un MP4 CDN n’est pas
simplement ouvert dans un iframe. La preuve de lecture comprend l’avancement du
compteur, les dimensions décodées, l’absence d’erreur et les commandes du lecteur,
sur bureau et mobile. Une archive sur DBFR ne prouve pas qu’un nouveau serveur
local a été installé : documenter le transport réellement actif.

Les limites mémoire et leur persistance appartiennent également à Infra. Si une
origine redémarre en boucle, vérifier son résultat et sa consommation avant de
relancer ; garder un seul écrivain et qualifier la correction ainsi que le rollback.

## Analyse et sous-titres

Les indices de frames, GIF et analyses conservent le SHA de la vidéo et leurs
horodatages. Les transitions noires ou blanches peuvent figurer dans un index
exhaustif, mais ne servent pas d’illustrations sans inspection. Les rapports,
captures, manifestes de livraison et mesures restent sous `var/reports/`.

Une langue audio ne prouve pas l’existence de sous-titres dans cette langue. Les
sous-titres incrustés ne constituent pas une piste téléchargeable. Importer et
annoncer seulement les fichiers réellement trouvés pour le bon épisode et la bonne
édition, avec langue, format, provenance et vérification des horodatages. Une
traduction ou une transcription générée reste un produit distinct explicitement nommé.
