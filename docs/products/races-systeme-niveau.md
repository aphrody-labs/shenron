# Races & système de niveau — référence factuelle Xenoverse 2

> **Source** : données extraites du jeu **Dragon Ball Xenoverse 2** (Steam 454650,
> v1.25.02.0). Les outils d'analyse et de formats sont désormais détenus par `shenron-re`.
> Tous les chiffres et libellés ci-dessous sont
> tirés des fichiers du jeu (cités en §6), pas d'estimations. Les descriptions de races
> sont le **verbatim français** de l'écran de création de personnage
> (`data1/data/msg/tribeselect_text_fr.msg`).
>
> Objet : servir de **base factuelle** au système de races/niveaux de Shenron
> (transposition en §7). Le membre choisit une race qui module sa progression, façon XV2.

---

## 1. Les 5 races jouables (CaC)

À la création, le joueur (un « Patrouilleur du temps ») choisit **une race** parmi 5,
avec un **sexe** (Masculin/Féminin) sauf Namek et Race de Freezer (masculin uniquement
dans le jeu). Libellés exacts (`tribeselect_text_fr`, idx 141-145) :

|   # | Race (FR)           | Sexes | Description courte (verbatim jeu)                                           |
| --: | ------------------- | ----- | --------------------------------------------------------------------------- |
|   1 | **Terrien**         | M / F | « Stats équilibrées en attaque et en défense. »                             |
|   2 | **Saiyen**          | M / F | « Tribu de guerriers : santé faible mais attaques puissantes. »             |
|   3 | **Race de Freezer** | M     | « Vitesse élevée, mais santé faible. »                                      |
|   4 | **Namek**           | M     | « Attaque faible mais santé élevée et récupération rapide de l'endurance. » |
|   5 | **Majin**           | M / F | « Défense augmentée si endurance max. Stats variables selon sexe. »         |

### Traits innés par race (verbatim de l'écran de sélection)

- **Terrien** — _« Stats équilibrées en attaque et en défense. »_ +
  _« Ki automatiquement récupéré et attaques plus puissantes si au niv. max. »_ +
  _« Objets plus efficaces que les autres races et santé restaurée. »_
  → polyvalent ; **récup de Ki automatique**, bonus au **Ki max**, et **objets de soin plus efficaces**.

- **Saiyen** — _« Une tribu de guerriers qui possède une très grande force, mais peu de santé. »_ +
  _« Attaques plus puissantes si santé faible. Stats augmentées après réanimation. »_
  → glass cannon ; **Zenkai** : dégâts ↑ à basse santé et **boost de stats après une réanimation**.

- **Race de Freezer** — _« Une race fragile qui domine ses ennemis grâce à sa grande vitesse. »_ +
  _« Récupération de l'endurance pendant l'attaque. Vitesse augmentée si santé faible. »_
  → rapide et fragile ; **endurance qui remonte en attaquant**, **vitesse ↑ à basse santé**.

- **Namek** — _« Attaque faible mais santé élevée et récupération rapide de l'endurance. »_
  → tank régénérant ; grosse santé, **endurance qui revient vite**, attaque faible.

- **Majin** — _« Défense élevée mais récupération lente de l'endurance. »_ +
  _« Défense augmentée si endurance max. Stats variables selon sexe. »_
  → défensif, **stats fortement dépendantes du sexe** (voir §2).

> Note jeu : en **version Lite**, _Saiyen (H/F)_ et _Race de Freezer_ sont indisponibles
> (`tribeselect_text_fr` idx 189-193).

---

## 2. Modificateurs de sexe (Masculin / Féminin)

Règle générale (verbatim, `tribeselect_text_fr` idx 232-239) :

> « Les personnages **masculins** disposent d'attaques normales plus puissantes et de
> buffs qui durent plus longtemps. Leurs techniques spéciales sont légèrement plus
> faibles. Les personnages **féminins** ont une jauge de Ki et une jauge d'endurance qui
> se remplit plus rapidement, mais une santé moins importante. »

Variantes spécifiques **Majin** (idx 176-177) :

- **Majin Masculin** : _« santé élevée et peu de dégâts subis tant que l'endurance est élevée. »_
- **Majin Féminin** : _« santé plus faible, mais temps de récupération plus élevé permettant d'éviter les attaques critiques. »_

---

## 3. Les 6 statistiques

Libellés exacts (`data1/data/msg/customize_status_text_fr.msg`, idx 129-133 + ki) :

| Code radar | Stat (FR)            | Effet (verbatim)                                                                       |
| ---------- | -------------------- | -------------------------------------------------------------------------------------- |
| HEA        | **Santé**            | « Augmenter la santé maximum. »                                                        |
| KI         | **Ki**               | « Augmenter le ki maximum. »                                                           |
| STM        | **Endurance**        | « Augmenter l'endurance maximum. »                                                     |
| ATK        | **Attaques de base** | « Augmenter la puissance des attaques normales et des Kikohas. »                       |
| STR        | **Super frappes**    | « Augmenter la puissance des attaques spéciales, ultimes et compétences d'évolution. » |
| BLA        | **Super Kikohas**    | « Augmenter la puissance des super attaques de Ki. »                                   |

> Le diagramme radar du menu d'état affiche ces 6 axes ; les outils binaires et formats sont détenus par `shenron-re`.
> 49 descriptions de **tendances de stats** (QQ Bang / équipement) existent dans le même
> fichier (idx 211-259) — ex. _« Endurance élevée. Privilégie la puissance des attaques
> normales, réduit les autres capacités. »_

### Style de combat de départ (`tribeselect_text_fr` idx 182-184)

À la création, choix d'un préréglage de stats initiales :

- **Équilibré** — « bon équilibre entre Kikohas et techniques de frappe »
- **Frappe** — « penchant pour les frappes »
- **Kikoha** — « penchant pour les Kikohas »

---

## 4. Système de niveau & expérience

### 4.1 Niveau maximum

**Niveau max = 180.** Preuve factuelle dans la table d'EXP
(`system/avatar_growth_data.agd`) : l'EXP requise pour le niveau suivant
(`exp_to_next`) reste **non nulle jusqu'au niveau 180**, puis **tombe à 0 à partir du
niveau 181** ; l'EXP cumulée se fige alors à **481 199 100** (le total est atteint, plus
aucune progression possible). La table de coûts `CharacterLevelupPriceList.clv` contient
d'ailleurs exactement **180 entrées** (niveaux 1→180).

La courbe a **deux ruptures de pente** internes (pas des caps) : un pic vers le niveau 98
(43,75 M pour un seul niveau) suivi d'une réinitialisation à 500 k au niveau 99, puis une
remontée jusqu'au cap. C'est cette rupture qui pouvait faire croire à tort à un cap à 99.

### 4.2 Courbe d'EXP (`avatar_growth_data.agd`, verbatim)

|  Niveau | EXP → niveau suivant | EXP cumulée pour l'atteindre |
| ------: | -------------------: | ---------------------------: |
|       1 |                  100 |                            0 |
|      10 |                1 450 |                        6 300 |
|      50 |               22 450 |                      398 800 |
|      80 |               53 950 |                    1 499 050 |
|      90 |            5 503 950 |                   17 788 550 |
|      98 |           43 753 950 |                  127 570 150 |
|      99 |              500 000 |                  171 324 100 |
|     150 |            4 250 000 |                  328 149 100 |
|     179 |            8 150 000 |                  471 049 100 |
| **180** |            2 000 000 |              **479 199 100** |
|    181+ |      0 (cap atteint) |                  481 199 100 |

→ atteindre le **niveau 180 demande ≈ 479,2 millions d'EXP cumulés** ; le total absolu de
la table se fige à **481 199 100**. Le gros du grind est sur les tranches 90-98 puis
150-180.

### 4.3 Coûts de niveau (`system/CharacterLevelupPriceList.clv`)

Table de **180 entrées** (= le niveau max). Les coûts en jeu sont définis **jusqu'au
niveau 80** (héritage du cap d'origine), puis la valeur passe à la sentinelle
`0xFFFFFFFF` (−1) du niveau 81 au niveau 180. Ex. : niv 50 → 12 500, niv 80 → 250 000.

### 4.4 Monnaie de déblocage : médailles PT / SPT

La création/personnalisation consomme des **médailles PT** (et **SPT**) pour débloquer
options et apparences (`tribeselect_text_fr` idx 240-242, 256-262) — ex. changer
tête/cheveux = **10 médailles PT**.

---

## 5. Tables de paramètres avatar (croissance par niveau)

Les valeurs de stats par niveau/race vivent dans des binaires `system/*` propriétaires
(format `#XXX` + marqueur `FE FF` + count) **non gérés par pyxenoverse** :

| Fichier                                | Contenu                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| `system/level_character_parameter.lcp` | 199 entrées × 34 champs — paramètres de perso par niveau      |
| `system/parameter_spec_avater.psa`     | 200 entrées × 8 floats — spec de croissance de l'avatar (CaC) |
| `system/parameter_spec_char.psc`       | spec des personnages du roster (184 Ko)                       |
| `system/powerup_parameter.pup`         | 72 entrées — paramètres d'investissement de stats             |
| `system/avatar_growth_data.agd`        | table d'EXP (§4.2)                                            |

> Le détail numérique exact des multiplicateurs par race n'a pas été décodé champ-par-champ
> (format binaire non documenté) ; les **traits qualitatifs** du §1 proviennent du texte
> in-game, qui fait foi côté joueur.

---

## 6. Provenance des données (fichiers du jeu)

| Donnée                                                        | Fichier extrait (`output/cpk/...`)                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Noms & traits des races, sexes, style de combat, médailles PT | `data1/data/msg/tribeselect_text_fr.msg(.json)`                                                 |
| Noms des 6 stats + tendances QQ Bang                          | `data1/data/msg/customize_status_text_fr.msg(.json)`                                            |
| Table d'EXP, niveau max                                       | `data/system/avatar_growth_data.agd`                                                            |
| Coûts de niveau                                               | `data/system/CharacterLevelupPriceList.clv`                                                     |
| Croissance des paramètres avatar                              | `data/system/{level_character_parameter.lcp, parameter_spec_avater.psa, powerup_parameter.pup}` |
| Tutoriels / aide                                              | `data1/data/msg/{tutorial_text_fr, lobby_tutorial_text_fr}.msg(.json)`                          |

---

## 7. Transposition Shenron — ✅ IMPLÉMENTÉE (Phase 1)

On **transpose les traits réels XV2 sur les leviers du bot** (XP, vocal, zéni, jeux) — pas
un moteur de combat. Le membre choisit sa race via **`/race`** (ou le menu de rôles
Discord) ; elle est posée comme rôle de race exclusif et module sa progression.

Les **6 races** correspondent aux **rôles Discord** du serveur (exclusifs) :

| Race (rôle serveur) | Inspiration XV2                        | Effet implémenté                                                                  |
| ------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| **Saiyan**          | Saiyen : guerrier né, Zenkai           | **×1,25 XP** (chat+vocal) + **Zenkai** : +50 % XP pendant 1 h après chaque palier |
| **Humain**          | Terrien : équilibré, objets +efficaces | **+25 % zéni** sur tous les gains (daily, drops, jeux, paliers)                   |
| **Namek**           | Santé élevée, régén, patience          | **×1,1 XP** + **régén passive** : +200 XP & +200 zéni à la 1re activité du jour   |
| **Mutant**          | Puissance brute et instable            | **×1,4 XP en chat** (montée régulière à l'écrit)                                  |
| **Cyborg**          | Machine infatigable/efficace           | **×1,4 XP en vocal** (récompense la présence vocale)                              |
| **Majin**           | Défensif, joueur imprévisible          | **+50 % zéni aux mini-jeux** (pfc/morpion/pendu/bingo)                            |

Choisir une race **pose le rôle Discord exclusif** correspondant (et retire les autres). Les
IDs de rôles sont dans `RACES[].roleId` (`lib/races.ts`). Le rôle **Saiyan** n'est **plus**
distribué automatiquement (c'était un auto-rôle posé à tout le monde) — c'est désormais un
choix de race.

### Implémentation (fichiers)

- **Catalogue + logique pure** (testée) : `apps/bot/src/lib/races.ts` (`apps/bot/tests/races.test.ts`).
- **Commande** : `apps/bot/src/commands/race/Race.ts` (`/race` — embed + boutons, persona `kaio`).
- **Schéma** : `users.race` / `race_chosen_at` / `race_boost_until` (Zenkai) / `last_race_regen_at`
  (migration `0013`).
- **Application des perks** : XP → `events/MessageXP.ts` + `events/VoiceXP.ts` ; zéni paliers +
  Zenkai → `apps/bot/src/services/LevelService.ts` ; zéni général/jeux → `apps/bot/src/services/EconomyService.ts`
  (`addZeni(..., { kind: "game" })`).

> Source de vérité runtime = `apps/bot/data/bot.db` (SQLite, forward-sync Neon). Ne **pas**
> écrire la progression dans le wiki éditorial (`wiki-write-guard`). Les valeurs sont des
> points de départ équilibrables (cf. `lib/races.ts`).

### Phase 2 — rôles de palier PAR RACE — ✅ en place

- **Échelles de transformations par race** : `apps/bot/src/lib/race-levels.ts` (module pur
  testé par `apps/bot/tests/race-levels.test.ts`, `xp-tiers.test.ts` et
  `xp-tier-hydration.test.ts`). La **source de vérité** est la table `race_level_roles`
  (éditable depuis l'admin, `/api/levels/race-rewards`), chargée au boot par
  `loadRaceLevelRoles`. **Rien n'est jamais seedé automatiquement** : une table vide veut dire
  « aucun palier » et le boot le signale en erreur.
- **Échelle canonique Saiyan, 14 paliers** (`RACE_LEVEL_ROLES.saiyan`, repli tant que le cache
  DB n'est pas hydraté) : 2 Ozaru · 5 Zenkaï · 8 Kaioken · 15 Super Saiyan · 20 SSJ 2 · 30 SSJ 3 ·
  32 Super Saiyan God · 35 Super Saiyan Blue · 38 SSB Kaioken · 40 Ultra Instinct · 42 UI
  Maîtrisé · 45 Perfect Ultra Instinct · 48 Super Ozaru · 50 Super Saiyan 4. Les autres races sont
  vides par défaut et se renseignent dans la table. Un membre **sans rôle de race** suit l'échelle
  Saiyan (`DEFAULT_LEVEL_RACE`, conception voulue).
- **Un rôle = un niveau.** Un même `roleId` à deux niveaux d'une échelle est refusé à l'écriture
  (`409` sur `POST /api/levels/race-rewards`). À la lecture, si la table en contient quand même
  (restes d'un ancien seed), seul le niveau le plus haut est retenu et l'erreur est journalisée :
  le 2026-10-22, sept lignes résiduelles (niveaux 1, 3, 4, 6, 7, 9, 10) ouvraient « Perfect
  Ultra Instinct » au niveau 10.
- **Niveau → multiplicateur d'XP.** Les rôles de palier sont aussi des rôles boostés
  (`xp.boost.role.<roleId>`). Un rôle de palier ne multiplie qu'à partir du niveau où l'échelle
  l'attribue (`tierEntitlement`, utilisé par `MessageXP`, `VoiceXP` et `/boosts`) : un palier
  posé trop tôt ne rapporte rien. `/config xp-boost-set` refuse un multiplicateur supérieur à
  `min(xp.multiplier.max, 100 000)` et journalise l'auteur (`action_logs`, `CONFIG_SET`).
- **Le niveau suit l'XP.** `levelFromXp(xp)` (`lib/xp.ts`) est la seule définition du niveau, pure ;
  `levelDrift(rows)` liste les niveaux stockés qui ont dérivé.
- **Plafonds d'XP** (`LevelService.addXP`, source ≠ `admin`) : plafond par gain et par minute,
  dérivés de la configuration active (`xp.message.max`, `xp.voice.per_minute`,
  `xp.multiplier.max`, régén, part de fusion) ; `xp.gain.max_single` et `xp.gain.max_per_minute`
  ne peuvent que les resserrer (0 = dérivé). Un gain écrêté ouvre un `XP_SPIKE` (ou `XP_RATE`),
  **un seul signalement ouvert par membre et par code et par heure** ; au-delà de 10 × le plafond
  le signalement est « high » et **gèle** le compte (`zeni_frozen`) : plus de gain tant qu'il est
  gelé. Les signalements d'XP n'entrent pas dans les avis URSAF.
- **Alignement des rôles** : `LevelService.syncRaceLevelRoles(member, race?, { removal })` pose les
  paliers dus et, au changement de race, retire ceux des autres races. La réconciliation
  périodique (`level-role-reconcile`, 6 h) **constate** les paliers en trop (au-dessus du niveau ou
  d'une autre race) et ne retire rien par défaut. Pour retirer : réglage
  `level_role_sync.strip = true` (opt-in). Même activé, rien n'est retiré si plus de la moitié des
  membres seraient touchés, ni pour un membre absent de la base ou à XP nulle.
- `level_rewards` reste la table **race-agnostique** des paliers (zéni, seuil XP, bannière) ;
  seuls les **rôles** de transformation sont par race. `seed-level-rewards.ts` ne seede plus rien :
  la table se règle explicitement (`/config level-reward-set`, `/api/levels/rewards`). Le zéni
  de palier (`zeni.per_level`) est versé **pour chaque niveau franchi**.

### XP des mini-jeux

Les mini-jeux (pfc, morpion, pendu, bingo, puis l'Arène) donnent de l'XP en plus des zénis.
Règle pure dans `apps/bot/src/lib/game-xp.ts` (`apps/bot/tests/game-xp*.test.ts`) :

- **Montant** : `max(games.xp.min, round(écart × part))`, l'écart étant la distance entre le palier
  atteint et le suivant sur la courbe active (`xpProgress().span` ; au niveau maximal, l'écart du
  dernier palier). Parts : victoire 2 % (`games.xp.win_ratio`), égalité et podium 1 %
  (`games.xp.draw_ratio`), participation 0,4 % (`games.xp.play_ratio`) ; plancher 25
  (`games.xp.min`). Un résultat pèse donc autant à chaque niveau et ne fait jamais passer un palier
  à lui seul.
- **Jamais multiplié.** `GameRewardService.grantGameXp` crédite par
  `LevelService.addXP(userId, montant, { source: "game", propagateFusion: false })` : ni rôle boosté
  (`xp.boost.role.<id>`), ni race, ni nuit, ni Zenkai, ni part de fusion. C'est la leçon de
  l'inflation du 2026-10-22 (`docs/operations/bot-economie-incidents.md`) ; un test pose un rôle
  à ×100 000 en base et vérifie que le gain reste celui de la règle.
- **Plafond sur 24 h glissantes** : la somme de l'XP de jeu (`XP_GAIN`, `source: "game"`) ne dépasse
  pas `games.xp.daily_ratio` (10 %) × l'écart du palier courant ; au-delà, le reliquat puis 0.
  Le montant est aussi borné au plafond d'un gain unique (`singleGainCeiling`), pour ne jamais
  déclencher `XP_SPIKE` ni geler un compte.
- **Plafonds anti-farm** : une victoire non payée (`games.daily_reward_cap`,
  `games.pair_reward_cap`) ne donne que l'XP de participation. Le perdant d'un duel ou d'une
  partie contre le robot, et chaque joueur d'un duel sans vainqueur (égalité), reçoivent `play` ou
  `draw` ; au pendu et au bingo, seulement après un coup valide.
- **Passage de palier** : flux normal de `LevelService.handleLevelUp` (rôles de palier de la race,
  zéni de palier, annonce unique). Le message de résultat affiche « +X XP · +Y Ƶ » et « Niveau N → M »
  (clés `games.reward.*` des trois locales), sans message public supplémentaire.
- **Réglages** : `games.xp.enabled` (true), `games.xp.win_ratio`, `games.xp.draw_ratio`,
  `games.xp.play_ratio`, `games.xp.min`, `games.xp.daily_ratio`.

### Phases suivantes (roadmap)

- **Peupler les échelles non-Saiyan** dans `race_level_roles` (Namek, Mutant, Cyborg,
  Majin, Humain) une fois les rôles Discord créés. Cooldown/coût de changement de race,
  intégration carte de profil (`CardService`).
- **Phase 3 — stats & combat** (optionnel) : vraies stats HP/Ki à la XV2 si un mode combat
  est introduit.
