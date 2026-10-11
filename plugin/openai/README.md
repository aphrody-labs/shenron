# Shenron pour Codex et ChatGPT

Ce paquet décrit trois compétences de recherche Dragon Ball sourcée et le MCP
public `https://dragonballfr.com/mcp`. Il conserve le plugin Claude Code voisin
et ne contient aucun credential DBFR. La présence des manifestes ne prouve pas
une installation dans un compte ni une publication dans un annuaire.

## Installation et qualification

Le dépôt déclare une marketplace locale dans `.agents/plugins/marketplace.json`
avec une entrée vers `plugin/openai`. Elle sert aux tests et à la distribution
dans l'équipe ; elle ne publie pas le paquet dans l'annuaire public d'OpenAI.

La [documentation officielle](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server),
consultée le 11 octobre 2026, décrit aussi une connexion dans ChatGPT : ajouter
le MCP personnalisé dans Plugins, puis utiliser son identifiant de connexion
avec Plugin Creator. Le manifeste de compatibilité et le mapping `.app.json`
obtenus dépendent de cette connexion réelle. Ce dépôt ne fabrique aucun
identifiant de compte et n'annonce pas ce parcours comme déjà exécuté.

Après installation, tester dans une nouvelle conversation les cinq cas positifs
et trois cas négatifs de `plugin.json`. Recontrôler `tools/list` du serveur
public et ses annotations de lecture seule. Un relevé ancien ne garantit ni
le nombre actuel d'outils ni la disponibilité du serveur.

## Publication et synchronisation

La publication publique reste distincte : suivre les exigences actuelles du
[portail officiel](https://developers.openai.com/plugins/deploy/submission).
Une marketplace Claude ou locale ne valide pas cette soumission.

Dans le checkout, `bun scripts/plugin/sync.ts --check` contrôle les références,
les manifestes Antigravity et les manifestes portables. Sans `--check`, il
synchronise les fichiers publics, sans commit, push ni configuration de compte.
Voir le [contrat de synchronisation](../references/synchronization.md).

A2A conserve son contrat de coordination distinct. Une connexion MCP ne crée
ni boîte de messages A2A ni authentification d'administration.
