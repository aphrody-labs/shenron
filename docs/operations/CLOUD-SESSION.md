# Session Claude Code cloud : prête dès le départ

Une session cloud (`CLAUDE_CODE_REMOTE=true`) démarre en `bypassPermissions` (`.claude/settings.json`) et
mène le travail de bout en bout, du code à la production, sans humain dans la boucle.

## Au démarrage (hooks `SessionStart`)
1. `scripts/dev/cloud-setup.sh --background` : Rust, Bun, uv, Graphify, outils de build, dépendances.
2. `scripts/dev/cloud-ssh.sh` : écrit les alias SSH `vps` et `dbfr` depuis l'environnement et teste la connexion.
3. `scripts/dev/session-start.ts` : injecte `docs/reference/root/REPRISE.md` (chantiers ouverts),
   `data/home/MEMORY.md` (mémoire privée si présente), l'état Git et l'état du SSH ; la session reprend
   le plan et les éléments mémorisés sans qu'on les lui redise.

## Secrets de l'environnement cloud (jamais dans Git)
| Variable | Rôle |
| --- | --- |
| `SHENRON_SSH_KEY_B64` | clé privée SSH, en base64 |
| `SHENRON_VPS_HOST` | adresse de l'hôte de production |
| `SHENRON_DBFR_HOST` | adresse du second hôte (facultative) |
| `SHENRON_SSH_USER` | identifiant (défaut `ubuntu`) |

Le jeton GitHub (`gh`, push sur `main`) et `APHRODY_GIT_TOKEN` (dépendances Aphrody) se règlent de la même
façon. Sans ces variables, la session code, teste et pousse, mais ne livre pas : elle le dit dans son bilan.

## Du code à la production
`gates (typecheck, lint, tests, format)` → commit + push `main` → `bun scripts/ops/release.ts --build-host
vps|dbfr|auto` (build, CDN, `aphrody-infra deploy --apply`, sondes) → réglages d'hôte par
`aphrody-infra ssh exec --host vps|dbfr` (env sous `/etc/rose-griffon/`, redémarrages) → vérification
publique. Les hôtes restent propriété de l'Infra d'Aphrody : pas de manipulation hors `aphrody-infra` et de
la release, et jamais de secret dans un journal ou un message.

## Reprise
Chaque session lit `REPRISE.md`, finit ce qu'elle peut jusqu'à la production, puis met le fichier à jour
dans le même lot que le code.
