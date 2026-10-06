# Reprise : chantiers ouverts

Lu au démarrage de chaque session (hook `scripts/dev/session-start.ts`). Une session reprend ces
chantiers sans demander, jusqu'à la production, puis met ce fichier à jour (retirer le fini, ajouter
le restant) dans le même lot que le code. Les rapports générés vont dans `var/reports/`, pas ici.

## But en cours
Shenron Studio, l'application de bureau, avec le modèle fine-tuné `shenron-chat-v2` (Qwen3-4B, LoRA
sur tout Dragon Ball), une interface de chat M3 et la mémoire persistante d'Aphrody. Le cœur est livré ;
l'installeur (v3) est déposé pour Omar, la validation de bout en bout reste à faire.

## À faire
- **Release en production** : livrer les commits récents de `main` (retrait de « Découvrir », hôte Bun
  avec Better Auth, canvas wasm wgpu 30). `bun scripts/ops/release.ts --build-host vps` (le build du
  site exige Docker : dbfr n'en a pas). Si le vps est saturé, arrêter `shenron-cdn-sync.timer` pendant la
  release et le relancer après.
- **CDN** : `shenron-cdn-sync` est local ; vérifier `/.well-known/agent-card.json` (doit être A2A 1.0,
  pas la carte du 3 octobre) une fois la passe de l'optimiseur finie.
- **Chat** : `APHRODY_AI_CHAT_BASE_URL=http://127.0.0.1:8799/v1` et `APHRODY_AI_CHAT_MODEL=shenron-chat-v2`
  sont posés dans `/etc/rose-griffon/shenron-{site,bot}.env` ; redémarrer le site et le bot après la
  release, mesurer la latence de `/api/chat` (relever le délai amont de 30 s de
  `apps/site/src/app/api/chat/route.ts` au-delà de 25 s).
- **Auth sur Bun** : basculer le site sur l'hôte (`SHENRON_HOST_URL`), test de bout en bout Discord réel,
  hooks du site (purge de compte, rate limit) et garde staff du bot à reprendre côté hôte.
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
