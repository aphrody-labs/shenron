<!-- SPDX-License-Identifier: Apache-2.0 -->
# Collections demandées et preuves de couverture

Le registre canonique `apps/bot/data/editorial-collections-manifest.json` décrit les
18 collections demandées le13octobre2026. Ses variantes de langue, sous-titres et
couleur sont des besoins éditoriaux ; elles ne prouvent ni une édition publiée,
ni un média disponible, ni des droits de republication ou une exclusivité.

Le CMS peut lire `GET /api/editorial-collections`, protégé par le propriétaire
d'authentification administrateur existant. `?id=soshuhen` sélectionne une
collection. Cette API ne sert aucune capture privée, transcription ou clé.
Les lecteurs de contenu restent propriétaires des assets effectivement disponibles.

`bun scripts/ops/editorial-collection-catalog.ts` produit
`var/reports/editorial-collections/inventory.json` : bibliographie locale,
snapshot historique explicitement daté, intégrité SHA256 des manifestes et
fichiers de transcription. Un fragment JSONL `#L` ne prouve pas le hash du fichier
agrégé ; ces références ne sont pas comparées à un hash de fichier entier.
L'inventaire ne modifie ni PostgreSQL, ni R2, ni Redis et ne copie aucun texte.
Les manques et les limites sont conservés dans chaque reçu.

La transcription japonaise conserve la source originale, ses pages ou repères
temporels, le hash du média et celui du texte. La relecture linguistique reste
distincte de l'intégrité du fichier. Le texte japonais relu est la source de
la traduction française ; un pivot anglais est refusé. Les transcriptions
partielles et brouillons ne deviennent jamais complètes par simple indexation.
RAG et entraînement exigent leur propre choix explicite et leurs droits.

Les vidéos et scans intégraux passent par les assets déjà détenus et autorisés,
les writers transactionnels existants et leurs contrôles. Les notices bibliographiques
n'activent aucun lecteur ni téléchargement. Les titres exacts des chapitres spéciaux
Jaco/Bardock doivent être résolus avec leur édition, sans fusionner des œuvres distinctes.
Les interviews supplémentaires des éditions Full Color se vérifient volume par
volume ; l'existence d'une édition couleur ne prouve pas leur présence.

Sources primaires utilisées pour définir le périmètre :

- [Annonce Shueisha Sōshūhen, 18 tomes prévus](https://www.dreamnews.jp/press/0000131506).
- [Shueisha, Dragon Ball Full Color japonais](https://www.shueisha.co.jp/books/items/contents.html?jdcn=08851831851831325501).
- [Dragon Ball Official, interview japonaise Toyotarō/Makino](https://dragon-ball-official.com/news/01_3370.html).
- [Bandai, anime promotionnel Super Dragon Ball Heroes](https://www.carddass.com/dbh/sdbh_ugm/anime/story.php).
- [Toei, Dr Slump 1997](https://lineup.toei-anim.co.jp/ja/tv/arale_2nd/story/).
- [VIZ, Dragon Ball anglais](https://www.viz.com/dragon-ball) et [Dragon Ball Super anglais](https://www.viz.com/shonenjump/chapters/dragon-ball-super?locale=en).

Le registre est un périmètre éditorial, pas une déclaration de couverture exhaustive
des interviews YouTube, des numéros Weekly Shōnen Jump ou des catalogues officiels.
