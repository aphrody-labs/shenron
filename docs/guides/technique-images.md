<!-- SPDX-License-Identifier: Apache-2.0 -->
# Retrouver les illustrations des techniques

`discover-technique-images.ts` rapproche le catalogue courant des images et textes
déjà extraits par les propriétaires natifs. Il ne remplace pas les parseurs HTML,
MediaWiki, OCR ou vidéo d’Aphrody. Le snapshot public SQLite est ouvert en lecture
seule ; les dossiers MediaWiki natifs peuvent être ajoutés par `--native`.

```powershell
bun apps/site/scripts/discover-technique-images.ts --snapshot var/reports/wiki-public-snapshot-20261024.sqlite --live-catalogue --out var/reports/technique-image-discovery-20261026/report.json
```

Le catalogue complet est paginé par l’API autorisée, avec le credential du coffre
`shenron-mcp/owner-admin`, conservé uniquement en mémoire. Pour un audit hors
ligne, remplacer `--live-catalogue` par `--catalogue <snapshot.json>`.

Le rapprochement conserve les URL d’image, l’adresse de lecture et le numéro de
page réellement présents dans le snapshot. Il cherche les noms français, les
noms japonais et les lectures du lexique canonique, avec garde d’identité sur le
nom de la fiche. Les espaces OCR et accents latins sont normalisés. Les alias
communs à plusieurs fiches restent ambigus ; un nom composé tel que « Big Bang
Kamehameha » ne valide pas sa sous-chaîne « Kamehameha ».

Chaque fiche visible reçoit une ligne de couverture, y compris sans résultat.
Les médias de portraits, jeux et Fandom, les identifiants dans les URL et les
liens signés sont refusés. Une correspondance OCR reste un **candidat à relire
visuellement** : une réplique peut citer une attaque absente du dessin. Le
rapport n’écrit aucune fiche et n’annonce aucune image vérifiée. La publication
d’une scène et la création d’un SVG passent par le manifeste mesuré séparé.

Le snapshot daté peut être incomplet et ne possède pas les photogrammes de tous
les épisodes. Un zéro signifie « aucune preuve retrouvée dans ces entrées »,
jamais « technique sans image existante ». Les dossiers natifs d’images anime
portent explicitement `medium: "anime"` et leurs légendes ; le titre général de
la page ne suffit pas à attribuer toute sa galerie à une technique.

La découverte exploite aussi `debutChapterId` pour produire une file bornée des
pages du chapitre de première apparition, même si leur OCR manque. Ces résultats
portent `matchIn: "debut-chapter"`, distinct des mentions OCR : toutes les pages
du chapitre ne représentent évidemment pas la technique. Les graphies de
recherche du lexique canonique sont relues sur leurs pages sources avant emploi ;
elles ne renomment aucune fiche et ne valident aucune illustration.

Les entrées de `--native` acceptent les dossiers MediaWiki, les documents du
crawler natif avec `canonical_url/payload.embedded_media`, et les conversions
Markdown complètes d’Aphrody Web sous cette forme :

```json
{"format":"native-markdown","url":"https://en.dragon-ball-official.com/news/01_3929.html","medium":"manga","markdown":"…"}
```

Le rapprochement du Markdown utilise `Bun.markdown.render`, conserve l’empreinte
du document et distingue `matchIn: "context"` d’une légende native. Une nouvelle
section réinitialise le contexte ; un intitulé en gras précédant l’image reste
prioritaire sur les techniques citées à titre de comparaison dans le paragraphe.
Le protocole ne reconstitue aucun parseur HTML ou MediaWiki du propriétaire.

Sur la fiche officielle Vegeta vérifiée le 26 octobre 2026, `aphrody web extract`
ne retenait que le bloc de partage (21 mots), tandis que `aphrody web scrape
--markdown` conservait le corps et ses URL d’images. Ce constat justifie de
consommer la conversion complète pour ce site. L’index local de photogrammes
était vide lors du contrôle ; aucune couverture de tous les épisodes n’est
revendiquée.
