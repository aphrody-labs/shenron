---
name: shenron-admin
description: "Prépare ou exécute une administration Shenron couverte par la demande : sans API authentifiée joignable, produit la requête exacte (route, corps, contrôle de vérification) sans rien écrire."
---

# Administration Shenron

Appliquer le [contrat partagé](../../references/execution.md).
Configuration des clients et références de secrets : [clients administratifs](../../references/admin-clients.md).

## Deux modes

1. **Proposition (par défaut, hors ligne)** : aucun outil admin exposé, aucun jeton
   dans l'environnement autorisé, API injoignable (503, délai) ou demande qui ne
   couvre pas la mutation. Livrer la **requête exacte** ci-dessous (méthode, URL,
   en-têtes sans valeur de secret, corps JSON validé), l'effet attendu, et le
   **contrôle de vérification** à lancer après coup. Ne rien écrire, ne rien simuler
   comme fait. Écrire en clair : « non exécuté — proposition ».
2. **Exécution** : seulement si la demande couvre l'effet, que l'outil MCP
   `dragonball_admin_*` est réellement exposé (ou l'API joignable avec le jeton de
   l'environnement autorisé) et qu'aucun gel ne s'applique. Lire schéma et catalogue,
   exécuter, puis vérifier par une lecture indépendante. Une opération déjà couverte
   s'exécute sans nouvelle confirmation ; un diagnostic ne couvre pas une mutation.

Les secrets restent dans l'environnement : écrire `Authorization: Bearer $SHENRON_DATABOOKS_API_TOKEN`
ou `$SHENRON_API_ADMIN_TOKEN`, jamais une valeur. Un défaut d'authentification ou
d'exposition se rapporte sans contournement.

## Requêtes

| Effet                                           | Outil MCP                                                        | Requête HTTP                                                                                                                                                                       | Vérification                                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Dépôt de transcription databook (fusion ciblée) | `admin_databooks_deposit` `{databookId, pages:[{number,text}]}`  | `POST https://dragonballfr.com/api/databooks/<id>/transcription`, `Authorization: Bearer $SHENRON_DATABOOKS_API_TOKEN`, corps `{"mode":"merge","pages":[{"number":7,"text":"…"}]}` | `GET https://dragonballfr.com/api/databooks/<id>` : le texte des planches citées, et une révision dans `/admin/wiki/history`              |
| Catalogue des commandes Discord                 | `admin_bot_commands`                                             | `GET https://bot.dragonballfr.com/api/bot/commands/catalog`, `Authorization: Bearer $SHENRON_API_ADMIN_TOKEN`                                                                      | — (lecture)                                                                                                                               |
| Exécution d'une commande Discord                | `admin_bot_command_execute` `{invocation, options?, channelId?}` | `POST https://bot.dragonballfr.com/api/bot/commands/exec`, même jeton, corps `{"invocation":"…","options":{…},"channelId":"<17-20 chiffres>"}`                                     | effet visible dans le salon ou par la lecture publique concernée (`/api/public/…`)                                                        |
| Catalogue des actions de service                | `admin_services`                                                 | `GET https://bot.dragonballfr.com/api/services`, même jeton                                                                                                                        | — (lecture)                                                                                                                               |
| Action de service                               | `admin_service_action` `{service, action, arguments?}`           | `POST https://bot.dragonballfr.com/api/services/<service>/<action>` (`[a-z0-9-]{1,80}`), même jeton, corps = arguments                                                             | relire `GET /api/services` et `GET https://bot.dragonballfr.com/health`                                                                   |
| Correction d'une fiche du wiki                  | —                                                                | `PATCH https://dragonballfr.com/api/wiki-admin/<table>/<id>` (session admin du site, pas de jeton), corps = champs modifiés                                                        | `GET /api/wiki-admin/<table>/<id>` puis la fiche publique ; révision dans `public.wiki_revisions` (`/admin/wiki/history`)                 |
| XP d'un membre du bot                           | —                                                                | `POST https://bot.dragonballfr.com/api/levels/users/<id>/xp`, `Authorization: Bearer $SHENRON_API_ADMIN_TOKEN`, corps `{"mode":"set","amount":<xp>}` (`"add"` pour ajouter)        | réponse `previousXp`, `newXp`, `newLevel`, `rolesSynced` ; ligne `XP_SET` du journal ; rang dans `GET …/api/public/leaderboard?metric=xp` |
| Zénis d'un membre du bot                        | —                                                                | `POST https://bot.dragonballfr.com/api/levels/users/<id>/zeni`, même jeton, corps `{"mode":"set","amount":<zénis>}` (`"add"` pour ajouter)                                         | ligne `ZENI_SET` du journal ; `GET …/api/public/leaderboard?metric=zeni`                                                                  |

## Membres du bot : XP, zénis, classements

- **Jamais de valeur au jugé.** « Remettre un membre à son niveau » se fait en deux étapes.
  D'abord, calculer sa valeur légitime : sa dernière valeur sûre (sauvegarde ou journal),
  plus ses gains `XP_GAIN` journalisés depuis, chacun plafonné au taux légitime de sa source.
  Ensuite, écrire cette valeur par l'API ci-dessus. La méthode et les requêtes de lecture
  sont dans `docs/operations/bot-economie-incidents.md`. En mode proposition, livrer le
  calcul et la requête, sans rien écrire.
- **Repérer une écriture hors journal.** Elle se voit à une rupture dans la suite des
  `XP_GAIN` d'un membre : le `before` d'un gain ne vaut pas l'`after` du précédent. Une
  rupture qui retombe sur la valeur de la sauvegarde est une restauration ; toute autre
  rupture est une écriture à expliquer.
- **Classements.** Le classement XP, celui des zénis, le rang de `/profil`, le classement
  mensuel et l'API publique lue par le site suivent tous la même règle : les membres partis,
  les bots et le compte `BOT_DEV_ID` (le développeur, aux valeurs de test) n'y figurent
  jamais. Cacher un autre membre demande une modification du code (`rankedMembersOnly` dans
  `apps/bot/src/services/LevelService.ts`), pas une écriture en base.
- **Rôles de palier.** L'écriture d'XP par l'API les réaligne sur le nouveau niveau. Le
  retrait des paliers en trop reste désactivé tant que `level_role_sync.strip` n'est pas
  activé.

Règles de corps : databook `id ≥ 1`, 1 à 2 000 planches, numéro ≥ 1, texte non vide
d'au plus 40 000 caractères. Une chaîne vide est ignorée ; `"text": null` efface et
exige une autorité explicite. `mode: "replace"` remplace tout le tableau : jamais
sans demande expresse. Une écriture databooks pendant un gel répond 423 : ne pas
contourner. Suppression éditoriale toujours logique (`visible = false`), jamais
physique. Les redémarrages de service touchent la production.

## Avec le dépôt Shenron (mainteneurs, facultatif)

Ré-ancrer une fiche sans bibliographie :
`bun apps/site/scripts/reancre-sources-wiki.ts db_characters --ids <id> --sans-sources --limite 1`.
La simulation précède la lecture du passage primaire ; le score RAG ne fonde pas la
citation. `--ecris` seulement pour les identifiants revus et l'écriture autorisée,
puis relire `article_sources` et la révision. Ce flux préserve le texte ; ne pas
inventer un outil d'écriture substitut.
