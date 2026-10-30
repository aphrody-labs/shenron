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

## 2026-10-22 22 h 54 UTC : XP du compte développeur écrite hors journal

- **Symptôme.** Après le rollback du 23/10, le compte `BOT_DEV_ID` (281114294152724491)
  restait premier du classement avec 100 Md d'XP au niveau 19, alors qu'il avait 784 M
  d'XP au niveau 16 dans la sauvegarde du 11/10.
- **Cause.** Entre deux gains vocaux, son XP est passée de 796 041 933 à 99 999 999 999.
  Aucun `XP_GAIN` ne correspond à ce saut : c'était une écriture d'administration
  (`POST /api/levels/users/:id/xp`). Le rollback rejoue le journal, il n'a donc pas pu la
  voir. À cette date, la version en production ne journalisait pas ce type d'écriture.
  Ses 999 999 947 999 zénis (compte gelé) viennent de la même voie
  (`POST /api/levels/users/:id/zeni`).
- **Correction (23/10).** XP recalculée en une transaction. Le point de départ est la
  valeur restaurée le 22/10 à 22 h 51 (784 041 933). S'y ajoutent les gains journalisés
  depuis, chacun plafonné au taux légitime de sa source : 2 M par minute de vocal, 43 600
  par message, 150 000 par part de fusion. Résultat : 978 706 975 XP, niveau 16. Une
  ligne `XP_ROLLBACK` est inscrite au journal, et la ligne d'origine est sauvegardée
  (`~/audit/` sur DBFR, droits 600). Les quatre autres ruptures de la nuit retombent
  exactement sur les valeurs de la sauvegarde : ce sont des restaurations.
- **Suites.**
  - Les écritures d'administration sont journalisées (`XP_SET` et `ZENI_SET`, avec les
    valeurs avant et après).
  - Le compte `BOT_DEV_ID` n'apparaît plus dans aucun classement : XP, zénis, mensuel,
    rang de `/profil` et API publique.

Repérer une écriture hors journal pour un membre : cette requête liste ses ruptures, c'est-à-dire
les gains dont le `before` ne vaut pas l'`after` du gain précédent. On compare ensuite chaque
rupture à la sauvegarde.

```sql
with g as (
  select id, created_at, json_extract(meta, '$.before') b, json_extract(meta, '$.after') a
  from action_logs where action = 'XP_GAIN' and user_id = :id
), o as (select *, lag(a) over (order by created_at, id) pa from g)
select id, datetime(created_at / 1000, 'unixepoch'), pa, b, b - pa from o
where pa is not null and b != pa order by created_at;
```

## Outils

Les deux scripts sont autonomes (`bun:sqlite` et `fetch`), sans dépendance au dépôt. Ils
simulent par défaut et n'écrivent qu'avec `APPLY=1`.

```sh
# XP et zénis de paliers : rejoue le journal XP_GAIN depuis FROM et plafonne chaque gain
DB=<shared>/bot/data/bot.db FROM=2026-10-22T21:59:00Z \
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
