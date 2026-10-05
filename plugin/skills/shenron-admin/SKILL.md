---
name: shenron-admin
description: "Exécute une administration Shenron couverte par la demande via les outils MCP authentifiés, avec vérification indépendante du résultat."
---

# Administration Shenron

Appliquer le [contrat partagé](../../references/execution.md).

Utiliser uniquement les capacités réellement exposées. Le serveur
`aphrody-mcp` les enregistre derrière la feature `dragonball` ; aucun outil
présent dans les docs n'est garanti dans le binaire installé.

| Outil `dragonball_admin_*` | Usage |
| --- | --- |
| `bot_commands` | Catalogue préalable aux commandes Discord |
| `services` | Catalogue préalable aux actions de service |
| `databooks_deposit` | Fusion ciblée `{databookId, pages:[{number,text}]}` comparée au scan |
| `bot_command_execute` | `invocation`, `options`, `channelId` du catalogue |
| `service_action` | `service`, `action`, `arguments` autorisés ; aucun shell arbitraire |

L'authentification bot utilise `SHENRON_API_ADMIN_TOKEN`, le dépôt site
`SHENRON_DATABOOKS_API_TOKEN`. L'outil distinct `dbfr_deposit`, s'il est exposé
par la feature `dbfr`, utilise `DBFR_TOKEN`. Les valeurs restent hors du plugin.
Un défaut d'authentification ou d'exposition se rapporte sans contournement.

Une demande de diagnostic ne couvre pas une mutation ; une opération déjà
couverte s'exécute sans nouvelle confirmation. Lire schéma, effet et paramètres,
puis vérifier l'état par une lecture indépendante. Les redémarrages touchent
la production. Le catalogue ne fournit pas de chat admin ni de CLI générique.

Pour ré-ancrer une fiche sans bibliographie, depuis Aphrody :
`bun apps/site/scripts/reancre-sources-wiki.ts db_characters --ids <id> --sans-sources --limite 1`.
La simulation précède la lecture du passage primaire ; le score RAG ne fonde
pas la citation. Ajouter `--ecris` seulement pour les identifiants revus et
l'écriture autorisée, puis relire `article_sources` et la révision. Ce flux
préserve le texte ; ne pas inventer un outil d'écriture substitut.
