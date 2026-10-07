<!-- SPDX-License-Identifier: Apache-2.0 -->
# Shenron dans le serveur Discord Aphrody

Le serveur cible est `1554189180030947338`, son salon général textuel
`1554189195201740803`. Le bot Shenron est `1497194276025663680`.
Ces identifiants sont centralisés dans `@shenron/config/discord-ai`.

Dans général, une mention du bot ou `Shenron, <question>` utilise le moteur de
chat des DM : recherche RAG, modèle Aphrody configuré, file bornée, quotas,
timeout, limite de réponse et mentions désactivées. L'historique est isolé par
guilde, salon et utilisateur. Les homes personnels et mémoires privées des DM
ne sont jamais lus pour une réponse dans le salon partagé. Les bots et webhooks
sont ignorés ; les messages sans adresse explicite restent sans réponse.

Les owners peuvent demander `Shenron statut` ou une recherche explicite dans les
databooks publics. Les commandes `!status`, `!eval`, `!goal`, `!report` et `!help`
du listener admin sont disponibles dans le salon configuré. Elles exigent un
owner du bot ou la permission Discord Administrator dans la guilde configurée,
avant archivage ou exécution. L'ancien alias `!train` lance une évaluation RAG ;
il ne constitue pas un entraînement de modèle. `/train run` reste la commande
de job natif, dont le backend doit être qualifié séparément sur le WSL d'Omar.

## Configuration et bascule Infra

```dotenv
GUILD_ID=1554189180030947338
SHENRON_AI_CHANNEL_ID=1554189195201740803
ADMIN_LAB_CHANNEL_ID=1554189195201740803
```

Sans override de salon, ces valeurs de salons sont les défauts de la guilde
Aphrody. Une autre guilde doit fournir ses propres identifiants. Les owners
restent définis par `OWNER_ID`, `OWNER_IDS` et `BOT_DEV_ID`. Aucun jeton n'est
modifié ni copié dans le dépôt. Les anciens échanges DM restent privés.

Infra doit vérifier que Shenron est membre de la guilde et peut lire/envoyer dans
général **avant** de modifier l'environnement protégé sur DBFR et de promouvoir
le binaire ou conteneur qualifié. Le jeton du bot ne permet pas de s'inviter :
l'installation OAuth nécessite un administrateur humain du serveur.

## Preuves du 2026-10-07

- Discord : général et les memberships de Yoyo/Omar vérifiés avec Aphrody.
- Discord Shenron : guilde cible HTTP 404 et général HTTP 403 ; installation
  encore absente au moment de cette vérification.
- Tests du bot : 487 réussis, 9 tests nécessitant les services réels ignorés.
  Config : 121 réussis. TypeScript bot et config passent.
- Le binaire Linux compilé passe `--smoke` : 114 commandes slash, 45 événements.
- La suite du relais général vérifie l'absence d'accès aux homes, mémoire et
  archivage privés des DM, ainsi que l'historique et la libération de la file.

Ces preuves établissent le code et le packaging. La bascule Discord de Shenron,
l'entraînement distant et une conversation réelle restent à vérifier après
installation et qualification des backends.
