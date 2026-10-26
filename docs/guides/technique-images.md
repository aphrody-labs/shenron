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
