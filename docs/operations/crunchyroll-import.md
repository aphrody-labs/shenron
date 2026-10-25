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

Le HAR fourni le 25 octobre 2026 contient 34 entrées et une réponse de jetons ; les
15 cookies proviennent de l’export séparé. Il ne contient aucune réponse catalogue,
saison ou épisode. La conversion intégrale est possible ; aucune fiche d’épisode
supplémentaire ne peut être déduite de cette capture.
La page HTML de l’épisode 3, fournie ensuite, constitue une source distincte de
métadonnées : elle est conservée et analysée avec sa propre provenance.
L’inventaire fourni contient 70 fichiers, dont un MP4 nommé épisode 02 ; il ne
contient aucun fichier vidéo de l’épisode 3. La lecture officielle de l’épisode 3
a été recontrôlée dans la session Chrome existante (compteur 616,75 à 646,93 s,
854 × 480, durée 1397,688 s). Le navigateur Bun avec cookies importés a rencontré
une vérification fournisseur : cela ne prouve pas une session propriétaire expirée.
Le [téléchargement officiel Crunchyroll](https://crunchyroll.zendesk.com/hc/en-us/articles/19203280609172-How-do-I-download-content-to-watch-offline)
n’est pas proposé sur PC. Aucun MP4 de l’épisode 3 ni export d’un flux protégé
n’a été produit par cet import.
