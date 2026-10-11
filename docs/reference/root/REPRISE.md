# Reprise : chantiers ouverts

Lu au démarrage de chaque session (hook `scripts/dev/session-start.ts`). Une session reprend ces
chantiers sans demander, jusqu'à la production, puis met ce fichier à jour (retirer le fini, ajouter
le restant) dans le même lot que le code. Les rapports générés vont dans `var/reports/`, pas ici.

## But en cours

Shenron Studio, l'application de bureau, avec le modèle fine-tuné `shenron-chat-v2` (Qwen3-4B, LoRA
sur tout Dragon Ball), une interface de chat M3 et la mémoire persistante d'Aphrody. Le cœur est livré ;
l'installeur (v3) est déposé pour Omar, la validation de bout en bout reste à faire.

## À faire

- **Corpus documentaire Dragon Ball** : poursuivre en autonomie l'acquisition et
  l'indexation de toutes les pages des 18 Sōshūhen, des Kai Dragon Books, des éditions
  Full Color, des numéros Weekly Shōnen Jump mentionnant Dragon Ball et des interviews.
  Séparer les identités d'édition et les paginations imprimées des fichiers acquis.
  Utiliser directement le MCP et la CLI Aphrody ; les audits de production passent
  par `aphrody-infra ssh exec`, les documents bruts privés par `data/source-acquisition/`
  (ignoré), les preuves par `var/reports/source-*`. Les contrôles
  `source-coverage.ts`, `source-ingestion-postgres.ts` et `source-readiness.ts`
  sont livrés ; les dépôts DB/RAG, les vecteurs, la mise à jour du site et la
  qualification de production restent à exécuter et vérifier sur le corpus complet.
  Le gel des écritures OCR/traduction des databooks reste applicable.

- **Release en production** : la directive propriétaire Aphrody du 2026-10-04 demande une cible
  serverless pour Shenron après benchmark des fournisseurs. Le fournisseur et l’adaptateur ne sont pas
  qualifiés dans ce dépôt. Ne pas lancer l’ancien parcours `--build-host vps` comme déploiement cible.
  Garder le checkout, les assets et les données jusqu’à ce que la cible, les secrets, les migrations,
  les routes et le retour arrière soient vérifiés. Chaque artefact livré doit viser le SHA exact et
  porter manifeste et sommes.
- **CDN** : `shenron-cdn-sync` est local ; vérifier `/.well-known/agent-card.json` (doit être A2A 1.0,
  pas la carte du 3 octobre) une fois la passe de l'optimiseur finie.
- **Chat** : `APHRODY_AI_CHAT_BASE_URL=http://127.0.0.1:8799/v1` et `APHRODY_AI_CHAT_MODEL=shenron-chat-v2`
  sont posés dans `/etc/rose-griffon/shenron-{site,bot}.env` ; redémarrer le site et le bot après la
  release, mesurer la latence de `/api/chat` (relever le délai amont de 30 s de
  `apps/site/src/app/api/chat/route.ts` au-delà de 25 s).
- **Auth sur Bun** : basculer le site sur l'hôte (`SHENRON_HOST_URL`), test de bout en bout Discord réel,
  validation du profil, invalidation du cache et garde staff du bot à reprendre côté hôte.
  La limite Redis et [la purge DB partagée](../../operations/bun-account-deletion.md) sont branchées sur Bun ; la reprise durable
  d'une purge interrompue après la suppression Better Auth reste à implémenter.
- **Installeur Studio** : signature, mise à jour automatique Tauri, détection GPU CUDA, vérification de
  l'espace disque avant téléchargement.
- **Omar** : WSL non activé (`wsl --install --no-distribution`, redémarrage, VT-x/SVM), puis `agy-all.md` ;
  son second compte Discord refuse les DM du bot (403).
- **Lint** : 571 avertissements (set-state-in-effect, no-shadow, prefer-tag-over-role,
  no-array-index-key, control-has-associated-label).
- **Tests rouges** : site (DATABASE_URL absente, préchargement RAG périmé), serveur (timeouts sous
  charge), bot (bibliothèque native non construite).
- **npm** : publier `@aphrody/a2a` 0.1.0, rag-core, shell-web, cli-wasm sur ordre écrit de l'utilisateur,
  puis les brancher dans Shenron.

## Décisions ouvertes

- `OWNER_ID 1323725494184841256` (« Omar le Banni ») : à Omar ou à l'utilisateur ?
- `default-secret-key-12345` codé en dur dans `aphrody-labs/rg` : sans propriétaire.
