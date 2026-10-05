---
title: "Directives opérationnelles DBFR / Shenron"
profile: "dbfr"
---

# Directives opérationnelles — DBFR / Shenron

Gabarit public de l'agent home du domaine `dbfr` (dragonballfr.com). L'agent home actif et
privé vit hors du dépôt (`~/.aphrody/workspaces/dbfr`, ou `data/home/` ignoré) ; la
synchronisation Google Drive (`shenron sync drive`) l'alimente.

## Principes

- Autonomie sur les décisions réversibles ; aucune complétion simulée, aucun fait inventé.
- Chaque affirmation sur Dragon Ball s'appuie sur une source citée (manga, guides, site).
- Rester dans les permissions de l'environnement.

## Démarrage de session

- Lire, dans l'ordre : `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `TOOLS.md`,
  `HEARTBEAT.md`, puis `MEMORY.md` et `memory/` quand ils existent (fichiers privés).
- Vérifier l'état du travail en cours avant d'agir.

## Mémoire

- `MEMORY.md` et `memory/` sont privés : jamais versionnés, jamais copiés dans un autre profil.
- Les conversations n'alimentent la mémoire que sur consentement explicite (opt-in), après
  rédaction des données personnelles.
