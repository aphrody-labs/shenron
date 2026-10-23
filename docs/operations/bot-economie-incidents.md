<!-- SPDX-License-Identifier: Apache-2.0 -->

# Bot Discord : incidents d'économie et procédures de correction

Ce document consigne les incidents qui ont touché l'XP, les zénis, les paliers et le
classement du bot, leurs causes et les outils qui les corrigent. Le système de niveaux
lui-même est décrit dans [races-systeme-niveau.md](../products/races-systeme-niveau.md).

## 2026-10-12 → 2026-10-22 : table `users` vide

- **Symptômes.** `/top` affichait « Aucun membre enregistré », `/profil` une erreur
  temporaire. Aucun gain d'XP ou de zénis n'était crédité.
- **Cause.** La colonne `users.zeni_frozen` manquait ; chaque `INSERT` échouait. La
  configuration (`guild_settings`), la boutique et les inventaires avaient aussi disparu.
- **Correction (22/10).** Correctif de schéma, puis fusion de la sauvegarde vérifiée du
  11/10 (8 071 membres) et rattrapage de l'XP des messages de la fenêtre perdue.

## 2026-10-22 22 h → 2026-10-23 13 h 30 UTC : inflation d'XP par les paliers

### Symptômes

- Classement à 10¹¹–10¹² XP au niveau 20, gains de 400 M à 1 Md d'XP par minute en
  vocal, paliers L11 → L20 enchaînés en quelques minutes.
- « Tout le monde est en MUI » : des membres de niveau 6 à 17 portaient Ultra Instinct
  et Perfect Ultra Instinct.

### Causes

Les rôles de palier sont aussi des multiplicateurs d'XP (`xp.boost.role.<id>`, de ×10 à
×100 000, plafond `xp.multiplier.max`). Trois défauts les ont distribués trop tôt :

1. **Échelle Saiyan polluée.** Pendant que les tables étaient vides, le démarrage a
   rempli `race_level_roles` avec l'ancienne échelle à 10 niveaux codée en dur
   (Kaioken au niveau 1 … Perfect UI au niveau 10). La fusion de la sauvegarde a ajouté
   l'échelle réelle (2, 5, 8, 15 … 50) sans retirer les lignes 1, 3, 4, 6, 7, 9 et 10.
2. **`level_rewards` recréée.** Vide dans la sauvegarde, elle contenait de nouveau
   l'ancienne échelle (`seed-level-rewards.ts`) : tout membre, toutes races confondues,
   recevait Ultra Instinct au niveau 9 et Perfect UI au niveau 10, avec
   1 000 × niveau zénis.
3. **Boosts modifiés à la main.** Entre 23 h 50 et 00 h 30 UTC, un compte disposant de
   `/config` a porté les multiplicateurs des paliers 15 et 20 Cyborg et Mutant de 50/100
   à 1 000 000 ou 10 000 000, puis s'est attribué Perfect UI par `/role give`.

L'anti-triche signalait chaque tick (`XP_SPIKE`, seuil fixe de 5 M, sans dédoublonnage ni
gel) : 4 250 signalements ouverts, sans effet.

### Corrections de données (23/10)

| Étape       | Effet                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Boosts      | Les 4 multiplicateurs remis à leur valeur du 11/10 (service `settings`).                                                                                                                   |
| Échelles    | 7 lignes Saiyan supprimées et 10 lignes `level_rewards` vidées, par l'API admin du bot (recharge du cache) ; les tables sont identiques à la sauvegarde.                                   |
| XP et zénis | `rollback-xp-inflation.ts` : 37 membres, 1,46 × 10¹² XP et 211 530 Ƶ de paliers retirés ; niveau stocké et palier affiché recalculés pour 2 290 autres membres ; 4 250 `XP_SPIKE` résolus. |
| Rôles       | `revert-incident-level-roles.ts` : retrait des paliers posés par le bot pendant la fenêtre et que le niveau corrigé ne justifie pas.                                                       |
| Divers      | 10 instantanés d'inflation à masse nulle supprimés, 123 succès `FIRST_MESSAGE` rattrapés, 17 isolements sans rôle clos.                                                                    |

Chaque étape d'écriture a été précédée d'un instantané `VACUUM INTO` dans `~/audit/` sur
DBFR (droits 600).

### Corrections de code

- Un rôle de palier ne multiplie l'XP qu'à partir du niveau où l'échelle l'attribue ; un
  rôle présent à deux niveaux d'une échelle n'est retenu qu'au plus haut, et l'API admin
  refuse un tel doublon.
- `race_level_roles` et `level_rewards` ne sont plus jamais remplies automatiquement.
- Plafonds durs par gain et par minute dérivés de la configuration ; dédoublonnage des
  signalements par membre, code et heure ; gel réel au-delà de 10 × le plafond.
- `/config xp-boost-set` refuse un multiplicateur supérieur au plafond et journalise
  l'auteur (`CONFIG_SET`).
- La réconciliation des paliers constate les rôles en trop et ne les retire que si
  `level_role_sync.strip` est activé.

## Outils

Les deux scripts sont autonomes (`bun:sqlite` et `fetch`), sans dépendance au dépôt. Ils
simulent par défaut et n'écrivent qu'avec `APPLY=1`.

```sh
# XP et zénis de paliers : rejoue le journal XP_GAIN depuis FROM et plafonne chaque gain
DB=/home/ubuntu/apps/shenron/shared/bot/data/bot.db FROM=2026-10-22T21:59:00Z \
  bun apps/bot/scripts/rollback-xp-inflation.ts
# Seconde passe sur les gains postérieurs : FROM_ID = toId du passage précédent + 1

# Rôles : d'après le journal d'audit Discord, retire les paliers posés par le bot depuis FROM
DB=… TOKEN=… GUILD=934894610545770506 BOT_ID=1497194276025663680 FROM=2026-10-22T21:59:00Z \
  KEEP_FILE=removed.json EXTRA_ROLES=<id,…> bun apps/bot/scripts/revert-incident-level-roles.ts
```

- `FROM` borne toujours la fenêtre par date : la fusion du 22/10 a réinséré l'historique
  de la sauvegarde sous des identifiants récents.
- Le plafond d'un gain suppose les multiplicateurs les plus favorables (nuit ou sleepcall,
  groupe maximal, Zenkai) : la correction ne retire que ce qu'aucune configuration légitime
  n'aurait pu donner.
- `KEEP_FILE` protège les rôles que le bot n'a fait que reposer (restauration du 22/10).
- Les passes sont tracées dans `action_logs` (`XP_ROLLBACK`, `XP_ROLLBACK_PASS`).
