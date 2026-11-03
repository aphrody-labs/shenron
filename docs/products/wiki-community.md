<!-- SPDX-License-Identifier: Apache-2.0 -->

# Wiki communautaire : présentation et chaîne éditoriale

Le wiki réunit le portail, les catalogues, les fiches documentées et la participation
communautaire. Une contribution reste une proposition jusqu’à sa relecture ; la rédaction
assistée produit un brouillon, jamais une publication automatique.

## Présentation publique

`apps/site/src/lib/wiki-visual-theme.ts` associe les rubriques à leurs thèmes. Le cadre
`WikiVisualFrame` applique cette identité à la navigation initiale et aux changements de
route. Les routes `/wiki/characters` et `/wiki/techniques`, ainsi que leurs descendants,
restent exclues de cette refonte.

La palette vit dans `components/wiki/wiki-editorial.module.css`. Les variables
`--wiki-theme-adventure`, `--wiki-theme-namek`, `--wiki-theme-capsule`, `--wiki-theme-energy`,
`--wiki-theme-cosmos`, `--wiki-theme-cinema`, `--wiki-theme-archive` et
`--wiki-theme-community` permettent de la personnaliser sans modifier les composants.
`--wiki-accent`, `--wiki-border`, `--wiki-paper` et `--wiki-card` en sont les rôles de
consommation. Les lecteurs et les lecteurs vidéo gardent leurs propres compositions.

`WikiIndexPage` et `WikiDetailPage` sont les cadres réutilisables des catalogues et des
fiches. Le héros éditorial utilise une illustration réellement présente dans le catalogue,
avec une alternative textuelle ; il ne présente pas une couverture comme une image
d’épisode. Une rubrique sans illustration garde une composition typographique. Aucun
compteur de complétude ni lien vers un contenu fictif n’est créé pour meubler la page.

Le portail lit les libellés dans la même langue client que le shell, avec un premier rendu
français. La négociation `Accept-Language` du serveur ne doit pas laisser des titres anglais
dans un shell français. Les nouveaux dictionnaires du parcours participatif et de
l’administration sont séparés et complets en français, anglais et japonais.

## Contribution et correction

`/wiki/contribute` explique le parcours et expose les chantiers mesurés en base. Son suivi
personnel charge uniquement les propositions de la session connectée. Une panne de lecture
ne doit pas être présentée comme une absence de propositions ou comme un travail terminé.

- `/api/wiki/contributions` permet de proposer, consulter et retirer ses propositions selon
  les autorisations existantes. La liste applique réellement `limit` et `offset`.
- `/api/admin/wiki-contributions` permet à l’administration de filtrer les propositions et
  de les accepter ou les refuser. Les paramètres et décisions sont validés par les schémas
  partagés de `lib/wiki-editorial-contracts.ts` ; les réponses privées ne sont pas mises en cache.
- Les valeurs avant et après restent visibles dans la file de relecture. Une proposition
  fondée sur une valeur qui a changé devient obsolète et ne remplace pas la correction récente.
- Le journal conserve l’auteur de la contribution et le relecteur. Le chemin d’écriture
  canonique du wiki conserve ses gardes de visibilité, de précondition et de gel éditorial.

L’acceptation verrouille la proposition puis sa cible dans une transaction unique. La
correction, le snapshot réversible, le crédit de l’auteur et le statut accepté sont validés
ensemble. Un échec d’écriture du journal annule la correction. Les transcriptions de
planches empruntent ce même client transactionnel et conservent leur mise à jour ciblée
du JSON ; le gel des databooks reste applicable. Le cache public est invalidé après la
validation de la transaction.

## Rédaction assistée

`POST /api/wiki-ai` reste réservé à l’administration. Le corps accepte `query` (1 à 2 000
caractères), `limit` (entier de 1 à 12), `entity` facultatif, `lang` (`fr`, `en`, `ja`) et
`action` (`search` ou `draft`, avec `search` par défaut).

La recherche renvoie les passages et leurs liens nettoyés. Le mode `draft` réutilise le
fournisseur d’inférence déjà configuré dans `@aphrody/shenron-pipeline`, avec le vérificateur
de citations existant. Le contexte et la sortie sont bornés, la requête est annulable et
soumise à une échéance. Les liens Fandom/Wikia sont exclus. Sans source exploitable,
aucun appel de génération n’est déclenché.

La réponse distingue `draftKind: "generated"` et `draftKind: "extracts"` et indique
`reviewRequired: true`. Un assemblage d’extraits ne doit jamais être présenté comme une
rédaction générée. L’éditeur conserve sa saisie lorsqu’une réponse arrive après une
modification manuelle et peut choisir explicitement de reprendre la nouvelle proposition.
L’insertion demande une relecture et suit l’API éditoriale existante.

## Qualification et livraison

### Médiathèque et provenance

Le sélecteur d’images de l’administration partage les uploads persistants et l’archive
CDN existante. `/api/admin/media-library` est réservé aux administrateurs, ne se met pas
en cache partagé et parcourt la projection publique paginée par révision. Le catalogue
conserve ses contrôles d’intégrité ; aucun second inventaire de fichiers n’est créé.
Le filtre porte sur la page affichée. La liste historique des uploads garde sa limite
serveur, signalée dans l’interface ; l’archive CDN permet de parcourir ses autres médias.

Les anciennes illustrations et les nouveaux uploads ne partagent pas nécessairement le
même stockage. Le résolveur d’assets garde leurs adresses publiques canoniques et le
gateway peut relayer un upload UUID manquant vers le stockage persistant de son écrivain.
Ce repli est limité aux images publiques, sans transmission de cookie ou d’autorisation.
Sa source de configuration mutable est activée avec une nouvelle release ; une release
déjà scellée ne se modifie pas pour corriger un chemin.

Une extraction doit conserver son média source, son empreinte, sa page ou son horodatage,
ses dimensions et l’outil utilisé. Une planche bitmap encapsulée dans un SVG reste une
image matricielle : elle ne constitue pas une vectorisation du dessin. Une image issue
d’une colorisation française ne devient pas une édition officielle. L’association à une
fiche doit rester justifiée par la source ; une image absente ne se remplace pas par une
illustration inventée présentée comme officielle.

### Publication des images de cartes

`POST /api/admin/cards/images` complète le propriétaire d’import des cartes par un
chemin limité aux images. Les identités utilisent le jeu de cartes, le numéro, la langue
et la région ; une ressemblance de nom ne prouve pas une association. Les miniatures
officielles restent décrites comme des miniatures, sans inventer une finition ou une
variante absente du modèle et des sources.

Un aperçu prépare les valeurs avant/après et les empreintes de précondition. La validation
du lot conserve ces identités et ce plan ; les images publiées sont relues et décodées,
avec comparaison de leurs dimensions et de leur empreinte. Les lignes sont verrouillées
dans un ordre déterministe. La mise à jour des seuls champs d’image et son journal strict
partagent la transaction ; un échec annule le lot entier. L’import ne change ni le statut,
ni la rareté, ni les autres métadonnées des cartes.

La restauration utilise la révision persistée et une nouvelle précondition sur la ligne
actuelle. Un ancien état sans image doit pouvoir retrouver ses valeurs nulles. L’historique
d’une ancienne image ne doit pas être assimilé à une nouvelle publication : sa restauration
doit conserver les valeurs enregistrées, avec les contrôles d’accès et d’intégrité applicables.
Une révision seule ne prouve pas qu’un retour arrière fonctionne ; qualifier le chemin réel.

Les preuves datées, captures et matrices de routes se conservent dans
`var/reports/wiki-redesign-20261103/`, hors documentation de référence. Vérifier les
exclusions, les changements de langue, les images réellement chargées, le clavier,
les erreurs réseau et les largeurs 1280/390. Une validation avec doubles de test ne vaut
pas preuve d’inférence réelle ni de mutation de production.

Le dépôt livre le code qualifié et les artefacts par `scripts/deploy/release.sh` ;
l’activation reste celle d’Aphrody Infra. La disponibilité du code sur Git ne prouve pas
la disponibilité de la nouvelle interface sur dragonballfr.com.
