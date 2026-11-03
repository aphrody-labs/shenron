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

Les preuves datées, captures et matrices de routes se conservent dans
`var/reports/wiki-redesign-20261103/`, hors documentation de référence. Vérifier les
exclusions, les changements de langue, les images réellement chargées, le clavier,
les erreurs réseau et les largeurs 1280/390. Une validation avec doubles de test ne vaut
pas preuve d’inférence réelle ni de mutation de production.

Le dépôt livre le code qualifié et les artefacts par `scripts/deploy/release.sh` ;
l’activation reste celle d’Aphrody Infra. La disponibilité du code sur Git ne prouve pas
la disponibilité de la nouvelle interface sur dragonballfr.com.
