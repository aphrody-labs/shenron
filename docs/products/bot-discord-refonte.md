<!-- SPDX-License-Identifier: Apache-2.0 -->

# Refonte du bot Discord Shenron : recherche et plan

Document de cadrage, établi le 2026-10-23 sans modifier le code. Périmètre : `apps/bot`
(discordx, discord.js, Bun, `@aphrody/discord-kit`), le serveur « Dragon Ball FR » (environ
6 400 membres), l'Activité Discord, et les liens avec le site, l'API, le wiki, le RAG, le MCP,
`/games/dragon-pixel`, Shenron Studio, les lecteurs et les épisodes. Les règles du dépôt
(`CLAUDE.md`) s'appliquent : Bun natif, code en anglais, tout texte visible dans des dictionnaires,
documentation en français.

Unité d'effort : **j = une journée d'un agent** (code, tests, relecture, commit), hors délais
d'attente du propriétaire. Les chiffres de l'inventaire viennent de l'arbre de travail du
2026-10-23 (29 fichiers du bot modifiés et une quinzaine non suivis par d'autres agents, voir §11).

Contenu : 1. Décisions proposées · 2. Inventaire · 3. Recherche externe · 4. Principes de design · 5. Fiches par commande · 6. Nouveaux jeux · 7. Activité Discord · 8. Connexions monorepo · 9. Bibliothèques · 10. Serveur · 11. Lots de livraison · 12. Risques et décisions du propriétaire · 13. Sources et limites de la recherche.

---

## 1. Décisions proposées

| #   | Décision                                                                                                                                                                                                                                                | Pourquoi                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Components V2 (`IS_COMPONENTS_V2`) pour toute réponse riche ; les embeds ne restent que pour les journaux staff et les webhooks.                                                                                                                        | Aucune des 218 constructions d'embed des commandes n'utilise V2 ; discord.js 14.27.0 fournit tous les builders.                                        |
| D2  | Une réponse = un message. Éphémère par défaut pour tout retour personnel ; public seulement par un bouton « Partager » explicite.                                                                                                                       | Aujourd'hui `/profil`, `/top`, `/solde`, `/scan`, `/buy` répondent en public ; le garde `CommandsChannelOnly` masque le bruit au lieu de le supprimer. |
| D3  | Noms de commandes, d'options et valeurs en anglais ; les noms français et japonais passent en `nameLocalizations` / `descriptionLocalizations` (discordx les supporte).                                                                                 | Règle « Langues et noms » de `CLAUDE.md` ; aujourd'hui `/solde`, `/planete`, `/succes`, `/voc`, `mise`, `facile`… sont des identifiants français.      |
| D4  | Tout texte visible du bot passe par `apps/bot/src/locales/{fr,en,ja}.json` (17 lignes aujourd'hui ; les 32 fichiers de commandes contiennent du français codé en dur).                                                                                              | Règle i18n de `CLAUDE.md`.                                                                                                                             |
| D5  | Rendu visuel : garder `@napi-rs/canvas` (déjà livré, vérifié par `canvas-smoke.ts`), refaire le kit de cartes sur les jetons de `packages/ui` et le style Toriyama.                                                                                     | Zéro migration native ; les alternatives n'apportent pas assez (§9).                                                                                   |
| D6  | Annonces regroupées : un message « flux » édité sur place au lieu d'un message par niveau, succès, vocal ou sleepcall.                                                                                                                                  | `LevelService.handleLevelUp` envoie un embed avec mention à chaque palier ; 18 événements publient via les gabarits.                                   |
| D7  | Jeux : remplacer les saisies de lettres dans le salon (pendu, bingo) par boutons et modales ; ajouter 7 jeux (§6) ; un budget quotidien unique par membre, aucun gain d'XP de jeu multiplié par les rôles.                                              | Incidents d'économie du 2026-10-12 et du 2026-10-22 (`docs/operations/bot-economie-incidents.md`).                                                     |
| D8  | Activité « Arène Shenron » : nouveau paquet `packages/activity` (règles, protocole) et nouvelle app `apps/activity` (Bun.serve + client Bun.build). Jeu 1 : Quiz Budokai. Jeu 2 : duel Dragon Pixel (`DragonPixelEngine` de `@aphrody/shenron-engine`). | Détail et alternatives au §7.                                                                                                                          |
| D9  | Prérequis bloquant côté propriétaire : vérification de l'application et Discovery. Sans cela, une Activité non vérifiée ne se lance que dans des serveurs de moins de 25 membres.                                                                       | §7.5 et §12 (information issue d'un résultat de recherche, article d'aide non ouvert).                                                                 |
| D10 | Livraison en 22 lots à chemins disjoints, environ 123 j-agent au total, soit environ 5 semaines avec 4 à 6 agents en parallèle (hors délai de vérification de l'application).                                                                           | §11.                                                                                                                                                   |

Critère de réussite mesurable : messages publics postés par le bot hors contenu éditorial
(actualités, TikTok, giveaway, jeux en cours) divisés par au moins 5, mesurés avant et après par un
compteur sur `messageCreate` dont l'auteur est le bot (l'événement `InteractionLog` existe déjà
comme point d'ancrage).

---

## 2. Inventaire de l'existant

### 2.1 Versions installées (lues dans `package.json`, `workspaces.catalog` et `node_modules`)

| Paquet                             | Installé                           | Dernière sur npm (date) | Remarque                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun (Aphrody)                      | 1.4.6-canary.1                     | n/a                     | `engines.bun >= 1.4.3` côté bot                                                                                                                                                  |
| `discord.js`                       | 14.27.0                            | 14.27.0 (2026-07-15)    | Components V2 depuis 14.19.0 (2025-04-26), modales Label/sélecteurs 14.23.0, File Upload 14.24.0, Radio/Checkbox 14.26.0, `fetchActivityInstance` 14.27.0                        |
| `discordx`                         | 11.13.3                            | 11.13.3 (2025-12-13)    | Ignore volontairement les commandes `PRIMARY_ENTRY_POINT` (voir `initGlobalApplicationCommands`) ; aucun support V2 propre                                                       |
| `@discordx/pagination`             | 4.4.2                              | 4.4.2 (2026-07-29)      | Embeds et composants legacy uniquement ; aucune occurrence de `ComponentsV2` dans le paquet                                                                                      |
| `@discordx/di`                     | 3.3.4                              |                         |                                                                                                                                                                                  |
| `@aphrody/discord-kit`             | 0.1.3                              | épinglé exact           | Intents négociés, caches, `safeExecuteInteraction`, `NotBot`, garde mono-guilde, REST, arrêt propre. Le bot remplace déjà `safeExecuteInteraction` par `lib/safe-interaction.ts` |
| `@napi-rs/canvas`                  | 1.0.9                              | 1.0.13 (2026-10-21)     | 1.0.12 (2026-10-20) a 3 jours : éligible à `minimumReleaseAge` ; 1.0.13 non                                                                                                      |
| `sharp`                            | 0.35.5                             | 0.35.5 (2026-09-27)     |                                                                                                                                                                                  |
| `@discordjs/builders` / `rest`     | 1.14.1 / 2.6.3 (patché)            | 1.14.1 / 2.6.3          | `patches/@discordjs%2Frest@2.6.3.patch` (annulation propre des requêtes) à refaire à chaque montée de version                                                                    |
| `discord-api-types`                | 0.38.56                            |                         | Contient `Label`, `FileUpload`, `RadioGroup`, `CheckboxGroup`, `Checkbox`, `LaunchActivity`, `PrimaryEntryPoint`                                                                 |
| `zod` / `drizzle-orm` / `tsyringe` | 4.6.5 / 0.45.3 / 4.10.0            |                         |                                                                                                                                                                                  |
| `pixi.js` / `@pixi/react` (site)   | 8.22.0 (catalogue ^8.21.0) / 8.0.5 |                         | Disponibles pour un client d'Activité, mais non nécessaires (§7.3)                                                                                                               |

`bunfig.toml` : `minimumReleaseAge = 259200` (3 jours), `linker = "isolated"`. Les paquets
`@aphrody/*` listés dans `minimumReleaseAgeExcludes` (dont `@aphrody/discord-kit`,
`@aphrody/bun-plugin-tailwind`, `@aphrody/web-test`) en sont exemptés.

### 2.2 Kit visuel actuel

| Élément                    | Fichier                                                | État                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embeds                     | `apps/bot/src/lib/embeds.ts` (308 l.)                  | Quatre palettes concurrentes (`COLORS`, `DBZ_COLORS`, `SHENRON_THEME`, hex en ligne comme `0x38bdf8` dans `/ask`) ; `COLORS.brand = 0xfbbf24` alors que le site utilise l'orange du gi `#e78220` et l'or `#ffb200` ; séparateurs ASCII `━━━` et pieds de page répétés ; textes français codés en dur |
| Embeds wiki                | `apps/bot/src/lib/wiki-embeds.ts` (191 l.)             | `sendPages` : pagination `@discordx/pagination` avec boutons « Précédent / Suivant / Fermer » codés en dur                                                                                                                                                                                           |
| Primitives canvas          | `apps/bot/src/lib/canvas-kit.ts` (403 l.)              | Polices, rectangles arrondis, jauges, halos, lignes de scan, Dragon Balls, étoiles, `drawImageCover`, `loadRemoteImage`. Bon socle, pas de système de mise en page                                                                                                                                   |
| Cartes de jeu              | `apps/bot/src/lib/game-cards.ts`                       | Seulement pendu et bingo                                                                                                                                                                                                                                                                             |
| Carte de profil            | `apps/bot/src/services/CardService.ts` (797 l.)        | Thèmes `card_themes`, bannières, badge, titre, couleur, rang, fusion                                                                                                                                                                                                                                 |
| Classement                 | `apps/bot/src/services/LeaderboardService.ts` (705 l.) | PNG de 10 lignes ; l'embed répète les mêmes 10 lignes en texte                                                                                                                                                                                                                                       |
| Polices canvas             | `apps/bot/src/lib/canvas-fonts.ts`                     | Google Sans Flex, Teko, Saiyan Sans, DBS Scouter ; repli emoji et CJK par famille système (paquets `fonts-noto-color-emoji`, `fonts-wqy-microhei` de l'image)                                                                                                                                        |
| Garde d'emoji de composant | `apps/bot/src/lib/component-emoji.ts`                  | Un emoji invalide rejette tout le message ; aucun emoji d'application (jusqu'à 2 000 possibles) n'est utilisé                                                                                                                                                                                        |
| Locale du bot              | `apps/bot/src/locales/{fr,en,ja}.json`                 | 17 lignes (`dm.*`, `interaction.*`) ; `lib/i18n.ts` (`t()`, `botLang()`) est utilisé par 2 fichiers                                                                                                                                                                                                  |
| Components V2              | partout                                                | Aucune occurrence de `ContainerBuilder`, `TextDisplayBuilder` ou `IsComponentsV2` dans `apps/bot/src`                                                                                                                                                                                                |

Mesures sur `apps/bot/src/commands` (`rg`, approximatives) : 12 496 lignes, 114 gestionnaires
`@Slash` (sous-commandes comprises), 218 constructions d'embed, 140 occurrences de
`MessageFlags.Ephemeral`, 43 `ActionRowBuilder`.

### 2.3 Commandes existantes (état)

Colonnes : visibilité (Éph. = éphémère par défaut), sortie, défauts. « Embeds » est un décompte
approximatif de constructions dans le fichier.

| Commande (fichier)                                                                                                                    | Visibilité                                                          | Sortie actuelle                                                                                                                                                                                                                 | Défauts relevés                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/profil`, `/top`, `/boosts` (`level/Level.ts`)                                                                                       | public, public, éph.                                                | `/profil` : PNG plus un embed (5 champs, barre ▰▱, pied de page) plus 2 boutons ; `/top` : PNG plus liste texte identique plus pagination                                                                                       | Répétition image et texte ; barre de progression déjà dans l'image ; `/boosts` : mur de texte de 12 lignes                                                                                                          |
| `/scan` (`fun/Scan.ts`)                                                                                                               | public                                                              | Embed plus PNG « scouter »                                                                                                                                                                                                      | Pas de menu contextuel « Scanner » (clic droit sur membre)                                                                                                                                                          |
| `/gay`, `/raciste` (`fun/Fun.ts`)                                                                                                     | public                                                              | Pourcentage aléatoire plus PNG                                                                                                                                                                                                  | Risque de signalement et de modération ; faible valeur (décision propriétaire, §12)                                                                                                                                 |
| `/race` (`race/Race.ts`)                                                                                                              | éph.                                                                | Embed plus 6 boutons                                                                                                                                                                                                            | Bon principe, à passer en V2 et à localiser                                                                                                                                                                         |
| `/solde`, `/zeni`, `/custom`, `/fusion`, `/defusion`, `/eprofil`, `/shop`, `/buy` (`economy/Economy.ts`, 810 l.)                      | `/solde` public, `/buy` public, `/shop` paginé                      | Embeds de 2 à 5 champs, pagination                                                                                                                                                                                              | Huit points d'entrée pour une seule boucle (voir, acheter, équiper) ; `/buy` exige de saisir une clé d'objet sans autocomplétion ; achat confirmé en public ; `/solde` double `/profil`                             |
| `/shop-panel`, `/shop-item` (`economy/Shop.ts`)                                                                                       | mixte                                                               | Panneau de boutique et fiche d'objet                                                                                                                                                                                            | Doublon de `/shop`                                                                                                                                                                                                  |
| `/inventaire list                                                                                                                     | equip                                                               | dequip` (`economy/Inventaire.ts`)                                                                                                                                                                                               | éph. majoritaire                                                                                                                                                                                                    | Embed de 5 champs, listes de clés brutes (`card_x`, `badge_y`)     | Clés techniques affichées à l'utilisateur ; doublon de `/eprofil` |
| `/pfc`, `/morpion`, `/pendu`, `/bingo` (`games/*.ts`)                                                                                 | public (plateau)                                                    | Embeds, boutons ; **pendu et bingo : l'utilisateur tape lettres et nombres dans le salon, un collecteur de messages relit, et à chaque coup le plateau est supprimé puis renvoyé** (`services/games/duel.ts`, `runMessageGame`) | Deux messages par coup (la saisie et le nouveau plateau), notification à chaque envoi, dépendance à l'intent `MessageContent`, risque de limite de débit sur `delete`                                               |
| `/giveaway` (`giveaway/Giveaway.ts`)                                                                                                  | public                                                              | Embed plus bouton « Participer »                                                                                                                                                                                                | 7 options de commande au lieu d'une modale ; gagnant annoncé par un message de plus (`giveaway_winner`)                                                                                                             |
| `/wiki`, `/races`, `/planete` (`wiki/Wiki.ts`)                                                                                        | public                                                              | Embeds plus pièces jointes, pagination                                                                                                                                                                                          | Pagination « Précédent / Suivant » par transformation, au lieu d'un sélecteur                                                                                                                                       |
| `/ask` (`wiki/Ask.ts`)                                                                                                                | public                                                              | Embed de 3 extraits plus champ « Sources » plus 4 boutons                                                                                                                                                                       | Réponse 100 % extraits (aucune génération) ; trois boutons d'entraînement du RAG (Valider Vérité, Diagnostic, Signaler) **affichés à tous** (les gestionnaires refusent les non-staff, mais l'interface les expose) |
| `/canon verifier                                                                                                                      | doctrine                                                            | sujets                                                                                                                                                                                                                          | citations                                                                                                                                                                                                           | jour` (`wiki/Canon.ts`)                                            | public                                                            | Embed de verdict plus boutons                     | Cinq sous-commandes pour un usage dominant (`verifier`) |
| `/databooks fiche                                                                                                                     | recherche                                                           | planche                                                                                                                                                                                                                         | catalogue` (`wiki/Databooks.ts`)                                                                                                                                                                                    | public                                                             | Embeds                                                            | Noms français ; pas de lien vers `DatabookReader` |
| `/scanlate queue                                                                                                                      | voir` (`wiki/Scanlate.ts`), menu épisodes (`wiki/ForumEpisodes.ts`) | staff / éph.                                                                                                                                                                                                                    | Embeds plus boutons                                                                                                                                                                                                 | Bon modèle d'éphémère pour les épisodes (menu qui répond en privé) |
| `/help` (`admin/Help.ts`)                                                                                                             | éph.                                                                | Embed plus sélecteur de 8 catégories                                                                                                                                                                                            | `CATEGORIES` liste les noms de commandes à la main : dérive garantie ; pas de recherche                                                                                                                             |
| `/ticket-panel`, `/close`, `/ticket` (`ticket/Ticket.ts`)                                                                             | mixte                                                               | Embed plus boutons plus modale                                                                                                                                                                                                  | À passer en V2 avec bouton « Prendre en charge »                                                                                                                                                                    |
| `/voc kick                                                                                                                            | ban                                                                 | unban` (`vocal/Vocal.ts`)                                                                                                                                                                                                       | public                                                                                                                                                                                                              | 8 embeds                                                           | Trois actions sans interface ; réponses publiques                 |
| `/invitations`, `/inviteur` (`utility/Invitations.ts`)                                                                                | éph.                                                                | Embed                                                                                                                                                                                                                           | Deux commandes pour un seul sujet                                                                                                                                                                                   |
| `/tiktok` (7 sous-commandes), `/config` (11), `/admin` (3), `/train` (10), `/succes` (6), `/report` et `/goal` (6), `/ids`, `/niveau` | staff                                                               | Embeds (`/config` : 27)                                                                                                                                                                                                         | Le tableau de bord du site (`/admin`, `/dashboard`) couvre une partie de ces écrans                                                                                                                                 |
| 19 commandes de modération et `/jail`, `/unjail`, `/jail-setup` (`moderation/*.ts`, 1 412 + 437 l.)                                   | staff                                                               | 57 plus 14 embeds                                                                                                                                                                                                               | Une commande par sanction ; aucune interface unifiée ; mélange d'annonces publiques et de journaux                                                                                                                  |

### 2.4 Événements qui produisent du bruit public

`apps/bot/src/lib/message-templates.ts` déclare 18 événements publiables : `welcome`, `farewell`,
`level_up`, `achievement_unlocked`, `first_message`, `daily_quest`, `zeni_drop`, `zeni_game_win`,
`anti_link_jail`, `jail_expired`, `giveaway_winner`, `vocal_tempo_created`, `vocal_tempo_destroyed`,
`sleepcall_start`, `sleepcall_end`, `mod_sanction_dm`, `mod_purge_announce`, `ticket_opened`.
Pour le niveau, `LevelService.handleLevelUp` envoie `content: <@id>` (une notification) plus un
embed à 3 champs à chaque palier ; en cas d'incident (inflation d'XP du 2026-10-22) cela devient
une rafale de pings. Les clés de salons configurées dans `guild_settings` sont `channel.achievement`,
`announce`, `commands`, `farewell`, `giveaway`, `level`, `log_*` (audit, economy, join_leave,
level_role, message, sanction, ticket), `mod_notify`, `ticket_category`, `vocal_tempo_hub`,
`welcome`, `zeni` (lecture seule de la base locale, aucun salon dédié aux jeux).

### 2.5 Jeux existants

Moteurs réutilisables : `services/games/duel.ts` (`ChallengeBoard`, `ActivePlayers`,
`duelStakeError`, `runMessageGame`), `anti-farm.ts` (fenêtre glissante, plafond quotidien
`games.daily_reward_cap` = 20 victoires payées par 24 h, plafond par paire
`games.pair_reward_cap` = 3, `settleStakes`), `GameRewardService` (`grantWin`, séquestre des mises,
journal du salon casino), `sessions.ts` et `session-journal.ts` (récupération des parties après un
redémarrage, remboursement des mises), `difficulty.ts` (facile ×1, normal ×1,5, difficile ×2,5),
`tokens.ts` (états signés HMAC pour les versions du site). Gains de base : `ZENI_GAME_WIN = 100`,
`ZENI_GAME_LOSS_PENALTY = 50`. Le site rejoue les mêmes moteurs par `/api/games/*`
(`pfc/play`, `morpion/move`, `bingo/play`, `pendu/new`) via le proxy `/api/bot-user/*`.

### 2.6 Connexions au monorepo déjà présentes

- **API REST du bot** (`apps/bot/src/api/server.ts`, 6 950 lignes, `Bun.serve`) : publiques
  `/api/public/{user/:discordId, leaderboard, shop, stats, presence, personas, commands,
  news, assets, sources, data/coverage, rag/{search,context,chat}, wiki/*, manga/*,
  profile/:id/card.png, profile/:id/scan.png}` ; joueurs signés `/api/economy/*` et
  `/api/games/*` (en-têtes `x-acting-user`, `x-acting-ts`, `x-acting-sig`, HMAC-SHA256 de
  `discordId:ts`, tolérance de 5 minutes, `packages/auth/src/acting-user.ts`) ; admin
  (`checkAdmin`, dont le flux SSE `/api/events`) ; A2A (`/api/a2a/jsonrpc`) ; GraphQL en lecture.
- **`@aphrody/shenron-api`** monté en repli : `/api/public/{wiki,lexicon,rag,stats,openapi.json}`,
  `/api/v1/{chat,ocr,vfs,site/theme,site/home,wiki/timeline}`.
- **MCP** (`shenron-mcp`) : outils `dragonball_bot_{commands,leaderboard,personas,stats}`,
  `dragonball_admin_bot_command_execute`, `dragonball_rag_*`, `dragonball_wiki_*`, `dragonball_manga_*`.
- **Site** : pages `/leaderboard`, `/shop`, `/profile/[id]`, `/commands`, `/games/*`
  (2048, bingo, rock-paper-scissors, tic-tac-toe, dragon-pixel, xenoverse-2), `/personas`, `/stats`.
- **OAuth Discord** : `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `DISCORD_PUBLIC_KEY`
  (`docs/operations/ENV.md`) ; `apps/bot/src/api/oauth.ts` fait déjà l'échange de code côté serveur.
- **Enregistrement des commandes** : `initApplicationCommandsSafe` avec `botGuilds` (commandes de
  guilde) ; le bot quitte toute guilde non admise (`index.ts`, garde mono-guilde).

### 2.7 Défauts transverses (par ordre d'impact)

1. Pas de Components V2 ; embeds de 4 à 6 blocs par réponse.
2. Textes visibles et identifiants en français, hors dictionnaires.
3. Réponses publiques pour des données personnelles.
4. Pendu et bingo : une saisie plus un plateau supprimé et renvoyé à chaque coup.
5. Pagination par `@discordx/pagination` (incompatible V2) et contournement dans `safe-interaction.ts`.
6. Doublons : `/solde` et `/profil`, `/shop` et `/shop-panel`, `/inventaire` et `/eprofil`, `/top` image et texte.
7. `/help` désynchronisé de la liste réelle de commandes ; `/ask` expose ses boutons staff.
8. Quatre palettes de couleurs ; aucune lecture du thème du site (`GET /api/v1/site/theme`).
9. Rôles de palier qui servent aussi de multiplicateurs d'XP (cause de l'incident du 2026-10-22,
   voir `docs/operations/bot-economie-incidents.md`).

---

## 3. Recherche externe

Sources : documentation officielle lue dans le dépôt `discord/discord-api-docs` (branche `main`, lue
le 2026-10-23 ; le dernier élément du journal des changements est du 2026-10-14), et pages
publiées sous `https://docs.discord.com/developers/...` (l'ancien préfixe
`discord.com/developers/docs/...` redirige vers ce domaine). Liste complète et limites au §13.

### 3.1 Components V2

Source : <https://docs.discord.com/developers/components/reference>, `.../components/overview`,
`.../components/using-message-components`.

- Drapeau `IS_COMPONENTS_V2 = 1 << 15` (32768) posé par message ; **irréversible** une fois le
  message envoyé. Il désactive `content`, `embeds`, `poll` et `stickers` ; les pièces jointes
  ne s'affichent que si un composant les référence ; **40 composants au total** par message
  (récursif). Le legacy (embeds, 5 rangées d'actions) reste supporté sans date de fin.
- Composants de message : Action Row (1), Button (2), String/User/Role/Mentionable/Channel Select
  (3, 5-8), **Section (9)** : 1 à 3 TextDisplay plus un accessoire (Thumbnail ou Button),
  **Text Display (10)** : Markdown, mentions et emojis, **Thumbnail (11)** : image, description
  jusqu'à 1 024 caractères, **Media Gallery (12)** : 1 à 10 médias, **File (13)**,
  **Separator (14)** : `divider` et `spacing` 1 ou 2, **Container (17)** : couleur d'accent
  `accent_color` (0x000000 à 0xFFFFFF) et `spoiler`, enfants limités à Action Row, Text Display,
  Section, Media Gallery, Separator, File (pas de Container imbriqué).
- Limites relevées : bouton `label` 80 caractères, `custom_id` 1 à 100, `url` 512, sélecteur
  `placeholder` 150, option `label` 100.
- Réponse à une interaction : après `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE`, **seul le drapeau
  `EPHEMERAL` est valide ; le drapeau V2 doit être posé par la modification de la réponse
  originale** (`editReply`). Jeton d'interaction : 3 s pour répondre, 15 min de validité.
  Webhook : `?with_components=true` obligatoire. Modification d'un message existant : le drapeau V2
  ne peut qu'être ajouté, `content` doit être mis à `null` et `embeds` à `[]`.
- Les mentions d'un Text Display notifient selon `allowed_mentions` (à positionner vide par défaut).
- **Non précisé dans la référence lue** : longueur cumulée maximale du texte d'un message V2. À
  mesurer par un test d'intégration avant de figer les gabarits.

### 3.2 Modales (nouveaux composants)

Source : <https://docs.discord.com/developers/components/using-modal-components>, journal des
changements du 2026-02-12.

- Une modale contient des **Label (18)** (`label` 45 caractères, `description` 100) enveloppant
  un composant, des **Text Display (10)**, ou : Text Input (4, `max_length` 4 000), String Select (3),
  User/Role/Mentionable/Channel Select (5-8), **File Upload (19)** (0 à 10 fichiers, `file_types`
  filtrable), **Radio Group (21)** (2 à 10 options), **Checkbox Group (22)** (1 à 10 options,
  `min_values`, `max_values`), **Checkbox (23)**.
- Conséquence pour le bot : giveaway, tickets, signalements, sanctions et achats peuvent devenir
  des formulaires (Radio Group pour la sanction, Select pour la durée, Text Input pour le motif)
  au lieu de 5 à 7 options de commande.

### 3.3 Embedded App SDK et Activités

Sources : <https://docs.discord.com/developers/activities/overview>, `.../how-activities-work`,
`.../building-an-activity`, `.../development-guides/{local-development,networking,
multiplayer-experience,user-actions,production-readiness,mobile,layout,assets-and-metadata,
growth-and-referrals}`, `.../activities/design-patterns`,
<https://docs.discord.com/developers/developer-tools/embedded-app-sdk>.

- Une Activité est une application web d'une seule page dans une iframe, servie par le **proxy
  Discord** (Cloudflare Workers) à `https://<application_id>.discordsays.com`. Le SDK
  `@discord/embedded-app-sdk` (v2.5.0, MIT, publié le 2026-05-05) gère le `postMessage` avec le
  client.
- Cycle : `new DiscordSDK(clientId)` → `ready()` → `commands.authorize({ scope, prompt: 'none' })`
  → **échange du code côté serveur** (`POST https://discord.com/api/oauth2/token`, le secret reste
  sur le serveur) → `commands.authenticate({ access_token })`. Le redirect URI du portail est un
  simple espace réservé (`https://127.0.0.1`).
- **Mappage d'URL** (portail, Activities → URL Mappings) : préfixe → cible, **sans protocole**,
  cible = un dossier ; `/` désigne la page HTML. Les requêtes de l'Activité vont à
  `/.proxy/...` ou à des chemins relatifs mappés. Exceptions de CSP sans mappage :
  `discord.com/api/`, `cdn.discordapp.com/{attachments,avatars,icons}/`,
  `media.discordapp.net/...`. Une bibliothèque qui appelle un domaine externe échoue en
  `blocked:csp` ; `patchUrlMappings()` du SDK réécrit `fetch`, `WebSocket` et `XMLHttpRequest`.
- Réseau : **WebSocket supporté ; WebTransport et WebRTC non supportés.** Le proxy supprime les
  en-têtes de cache des réponses `text/html` : il faut un nom de fichier haché pour tout le reste.
  Cookies : domaine `{client_id}.discordsays.com`, `SameSite=None; Partitioned`.
- Multijoueur : `discordSdk.instanceId` (disponible avant `ready()`) est la clé de l'état partagé ;
  l'instance meurt quand le dernier participant part. Participants :
  `commands.getActivityInstanceConnectedParticipants()` (renommée le 2026-10-06) et événement
  `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE`. Pseudo et avatar de guilde : portée `guilds.members.read`,
  appel serveur recommandé.
- Sécurité : ne pas faire confiance aux données du client. `GET /applications/{app}/activity-instances/{instance}`
  (jeton du bot) renvoie `users[]` et 404 si l'instance n'existe pas ; en-têtes optionnels du proxy
  `X-Signature-Ed25519`, `X-Signature-Timestamp`, `X-Discord-Proxy-Payload` (clé publique de
  l'application). discord.js 14.27.0 expose `client.application.fetchActivityInstance(id)`.
- Lancement : commande **Entry Point** (`type: 4`, `PRIMARY_ENTRY_POINT`, une seule, globale) créée
  automatiquement sous le nom « Launch » à l'activation (`handler: 2`,
  `DISCORD_LAUNCH_ACTIVITY` : Discord ouvre l'Activité et poste un message). Avec
  `handler: 1` (`APP_HANDLER`), l'app répond par le type de callback `LAUNCH_ACTIVITY` (12) ;
  discord.js : `interaction.launchActivity()` sur une `PrimaryEntryPointCommandInteraction`.
  `PUT /commands` écrase **tous** les types de commandes ; discordx 11.13.3 exclut déjà les
  `PRIMARY_ENTRY_POINT` de son diff global et ne les route pas, donc le gestionnaire
  `APP_HANDLER` se branche sur `interactionCreate` à part.
- Bonnes pratiques officielles (design-patterns) : « Solo-Plus » (jouable seul, meilleur à 3-8),
  accueillir les arrivées en cours de partie (spectateur), afficher présence et orateurs,
  pseudo et avatar de guilde, invitations aux moments utiles (`openInviteDialog`), partage de
  moments (`openShareMomentDialog`), pas de dépendance à la voix pour comprendre le jeu, mobile
  (zones sûres `--discord-safe-area-inset-*`, verrou d'orientation, état thermique), arrêt de la
  session quand le dernier joueur part, mesure des abandons par phase.
- Croissance : liens `https://discord.com/activities/<id>?referrer_id=…&custom_id=…`, commande SDK
  `shareLink`, lecture de `discordSdk.customId` / `referrerId` au démarrage.
- Fiche : art de couverture, fond de grille 16:9 d'au moins 1024 px, tuile, aperçu vidéo
  640 x 360 mp4 de moins de 10 s et 1 Mo.
- Disponibilité : « Launching a non-distributed Activity is limited to you or members of the
  developer team » (building-an-activity). Un résultat de recherche citant l'article d'aide
  développeur 21204493235991 indique en plus que les Activités non vérifiées ne se lancent que dans
  des serveurs de **moins de 25 membres** ; l'article n'a pas pu être ouvert (HTTP 403). Voir §7.5.
- Journal des changements : 2026-09-22, vérification d'âge (des Activités soumises à restriction
  d'âge peuvent demander une confirmation) ; 2026-10-05, aperçus de liens en composants.

### 3.4 Autres fonctions de la plateforme utiles

- **Aperçus de liens en composants** (2026-10-05, <https://docs.discord.com/developers/link-previews/component-embeds>) :
  une page HTML peut porter `<script id="discord:component-embed" type="application/json">`
  (3 000 octets au plus) ou `<link rel="discord:component-embed">` ; un seul Container de 40
  composants au plus (boutons de lien seulement, 10 médias au plus) ; la balise doit être dans le HTML
  rendu côté serveur, le tout récupéré en moins de 10 s. Aucun bot nécessaire : tout lien du site
  collé dans Discord devient une carte V2 aux couleurs du site.
- **Sondages natifs** (<https://docs.discord.com/developers/resources/poll>) : question de 300
  caractères au plus, 10 réponses de 55 caractères au plus, durée jusqu'à 32 jours, multi-choix ;
  le champ `poll` est désactivé dans un message V2 (message séparé).
- **Soundboard** (<https://docs.discord.com/developers/resources/soundboard>) : l'envoi d'un son exige
  que l'appelant soit connecté à la voix (`USE_SOUNDBOARD`, `SPEAK`) ; utile surtout pour des sons
  de serveur téléversés par les administrateurs, peu pour le bot.
- **Emojis d'application** (<https://docs.discord.com/developers/resources/emoji>) : jusqu'à 2 000
  emojis propres à l'app, sans consommer d'emplacements du serveur, utilisables dans les boutons
  et les messages V2 ; supprime la classe d'erreurs traitée par `component-emoji.ts`.
- **Commandes** (<https://docs.discord.com/developers/interactions/application-commands>) :
  100 commandes `CHAT_INPUT` globales, 15 `USER`, 15 `MESSAGE`, 1 `PRIMARY_ENTRY_POINT` ; 200
  créations par jour et par guilde ; localisations de noms et de descriptions ;
  `integration_types` et `contexts` pour l'installation par utilisateur (non retenue, §12).
- **Débit** (<https://docs.discord.com/developers/topics/rate-limits>) : 50 requêtes par seconde
  au global par bot, 429 avec `Retry-After`.
- **Monétisation** : hors périmètre (pas d'achat).

### 3.5 Bibliothèques et état de l'art

- discord.js : V2 depuis 14.19.0 (<https://github.com/discordjs/discord.js/releases/tag/14.19.0>),
  modales enrichies 14.23.0 à 14.26.0, activités 14.27.0 (notes de version GitHub).
  Vérifié localement dans `node_modules/.bun/discord.js@14.27.0` et `@discordjs/builders@1.14.1`
  (classes `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `ThumbnailBuilder`,
  `MediaGalleryBuilder`, `SeparatorBuilder`, `FileBuilder`, `LabelBuilder`, `FileUploadBuilder`,
  `RadioGroupBuilder`, `CheckboxGroupBuilder`, `CheckboxBuilder`).
- discordx : décorateurs, `nameLocalizations` et `descriptionLocalizations` sur commandes, groupes,
  options et choix (documentation discordx via Context7) ; aucun helper V2 ni pagination V2.
- Rendu serveur sous Bun : `@napi-rs/canvas` (en production), `sharp` (en production) ; `skia-canvas`
  4.0.0 (2026-10-12, MIT, ajoute un second binaire Skia) ; `satori` 0.63.2 (MPL-2.0, 2026-10-20) ;
  `@resvg/resvg-js` et `resvg-wasm` 2.6.2 (MPL-2.0, **sans publication depuis 2024-03-26**) ;
  `@vercel/og` 1.0.3 (MPL-2.0, Node 22 et Next) ; `@takumi-rs/core` 2.17.1 (2026-10-20,
  MIT ou Apache-2.0, Rust, rendu JSX vers image, non qualifié sous Bun).
- Multijoueur temps réel : `Bun.serve` avec WebSocket natif (rooms par `server.publish` /
  `ws.subscribe`, `perMessageDeflate`, `maxPayloadLength`, `idleTimeout`) ; Colyseus 0.18.x (MIT,
  Node >= 22.x, aucun support de Bun documenté) ; PartyKit 0.0.115 (dernière version 2025-05) ;
  boardgame.io 0.50.2 (dernière version 2022-11) ; PlayroomKit 0.0.97 (service hébergé, licence non
  déclarée dans le registre).

### 3.6 Inspirations (ce que les utilisateurs retiennent)

La recherche web a donné peu de sources indépendantes ; les points suivants sont à lire avec cette
réserve (blogs de vendeurs de bots signalés).

- **Dank Memer** : boucle quotidienne courte (commandes, aventures, familiers, prestige) ; plaintes
  récurrentes : « command spam », nouveaux joueurs perdus, fonctions réservées au premium (PeakBot,
  blog de vendeur : <https://peakbot.pro/blog/best-discord-economy-bots-2026>).
- **UnbelievaBoat** : économie personnalisable, boutique de rôles, classements ; peu de jeux
  (même source). **Tatsu / Arcane** : XP et niveaux sans dépense possible, d'où l'intérêt de
  puits de monnaie (même source).
- **Mudae / Karuta / Pokétwo** : collection, échange et rareté ; Pokétwo est cité pour les
  apparitions qui encombrent les salons (résultats de recherche agrégés, dont
  <https://blog.communityone.io/best-fun-discord-bots/>, non relus en entier).
- **Activités qui marchent** (Poker Night 2 à 8 joueurs, Sketch Heads 2 à 16, Gartic Phone 3 à 14,
  Know What I Meme 3 à 8, Watch Together) : manches courtes (60 à 90 s), jouables sans compétence,
  gros effet de groupe (<https://peakbot.pro/blog/discord-activities-apps-guide-2026>, secondaire).
  La source primaire est la page officielle de patterns d'Activité (§3.3), qui recommande 3 à 8
  joueurs, le mode spectateur et l'invitation au bon moment.
- **Réduire le bruit** : réponses éphémères (réservées aux interactions), édition d'un message
  unique, regroupement en fil ou en flux quotidien, `SUPPRESS_NOTIFICATIONS` posé à la création du
  message (le drapeau existe dans `message.flags` ; à l'édition, seuls `SUPPRESS_EMBEDS` et
  `IS_COMPONENTS_V2` sont modifiables) ; aucun guide officiel de design de bot n'a été trouvé.

---

## 4. Principes de design

### 4.1 Système visuel Dragon Ball

Source unique : `packages/ui` (voir `design-system.md`). Les valeurs viennent de
`packages/ui/src/styles.css` ; le bot lit les couleurs par `@aphrody/shenron-config/site-theme`
(`THEME_COLOR_VARS`) et, à l'exécution, `GET /api/v1/site/theme` (TTL 10 min), afin de suivre
`/admin/design`. Repli statique (pas de hex en ligne dans les commandes) :

| Rôle           | Jeton site         | Valeur                | Usage bot                                   |
| -------------- | ------------------ | --------------------- | ------------------------------------------- |
| Fond           | `--dbz-bg`         | `#0a0a0a`             | Fond de carte                               |
| Surface        | `--dbz-card`       | `#141410`             | Panneaux                                    |
| Bordure        | `--dbz-border`     | `#2a2a26`             | Filets                                      |
| Accent marque  | `--dbz-orange`     | `#e78220`             | Barre d'accent des Containers « marque »    |
| Or             | `primary` (DESIGN) | `#ffb200`             | Titres, rang 1, zéni                        |
| Jaune de titre | `--dbz-yellow`     | `#fefd03`             | Étincelles, Super Saiyan                    |
| Rouge          | `--dbz-red`        | `#f10c3b`             | Erreur, sanction                            |
| Vert Shenron   | `--dbz-green`      | `#2e9b41`             | Succès, Namek                               |
| Ki             | `--dbz-ki`         | `#4ba8ff`             | Information, jauges                         |
| Encre / papier | `--dbz-encre/os`   | `#131b08` / `#efe9d8` | Contours épais et fond « manga » des cartes |

Règle des couleurs d'accent des Containers : marque (orange), succès (vert), erreur (rouge),
information (ki), plus la couleur de la race ou du palier du membre pour les cartes personnelles.
Les quatre palettes de `embeds.ts` sont dépréciées puis supprimées à la fin des lots de commandes.

### 4.2 Grammaire des réponses V2

Un module `apps/bot/src/ui/` (nouveau, lot L0) fournit des fabriques typées ; aucune commande
n'appelle directement les builders discord.js.

- `panel({ accent, title, lines, media, actions })` : un `ContainerBuilder` avec en-tête
  (Section : titre plus Thumbnail), 1 à 3 lignes de texte courtes, 0 ou 1 média (image canvas),
  Separator, 1 rangée d'actions au plus. Chaque ligne est une clé de dictionnaire.
- `notice(kind, key, vars)` : confirmations et erreurs d'une ligne, toujours éphémères,
  sans Container pour l'erreur simple (Text Display seul).
- `pager({ pages, state })` : pagination V2 maison (boutons précédent / suivant et sélecteur de page,
  `custom_id` compact, expiration traitée par `safe-interaction.ts`) ; remplace
  `@discordx/pagination`.
- `confirm(key, onYes)` : seulement pour les actions destructrices ; sinon action directe avec
  bouton « Annuler » pendant 10 s (mise à jour du message).
- `share(button)` : bouton « Partager » qui republie la vue **publique** (variante sans données
  sensibles) par `channel.send` ; une vue éphémère n'est jamais copiée telle quelle.
- `validate(payload)` : test et garde d'exécution (40 composants au plus, aucun `content` ni
  `embeds`, `custom_id` de 100 caractères au plus, labels de 80 au plus) ; une erreur de payload
  coûte une réponse entière.
- Réponses différées : `deferReply({ flags: Ephemeral })` puis
  `editReply({ flags: MessageFlags.IsComponentsV2, components })` (l'état éphémère vient de
  l'accusé de réception ; le drapeau V2 ne peut être posé que par cette modification, cf. §3.1) ;
  réponse directe : `reply({ flags: IsComponentsV2 | Ephemeral, components })` ;
  `allowedMentions: { parse: [] }` par défaut ; `SUPPRESS_NOTIFICATIONS` à la création de tout
  message qui sera ensuite édité (flux, classement vivant, raid).

### 4.3 Règles de réduction du bruit

1. Retour personnel (profil, solde, boutique, aide, erreur) : éphémère. Retour social (scan d'un
   ami, résultat de duel, victoire de quiz) : public mais bref (un message, une image ou une ligne).
2. Une vue qui change (boutique, plateau, raid, classement, tournoi) est **un message édité**,
   jamais renvoyé ; pas de suppression-renvoi.
3. Saisie : boutons, sélecteurs et modales, jamais de texte tapé dans un salon pour jouer.
4. Annonces d'événements : flux unique par salon et par jour (§5.5), mention sans notification ;
   notification réelle seulement pour un palier majeur ou une sanction.
5. Les actions de modération passent par menus contextuels et modales ; l'annonce publique reste
   le format compact déjà existant (`sanctionLogEmbed`), le détail va au journal staff.
6. Le garde `CommandsChannelOnly` ne subsiste que pour les jeux publics ; les commandes
   éphémères sont utilisables partout.

### 4.4 Cartes canvas

- Format : 1280 x 720 (16:9) maximum, WebP par `canvas.encode("webp")` ou `sharp`, moins de 300 Ko ;
  une carte par réponse, jamais une carte plus un texte qui répète la même information.
- Style Toriyama (voir `design-system.md` §2) : trait d'encre épais, aplats sans dégradé, ombres
  portées dures (4 px), cases koma-wari, trames de points ; les formes viennent de
  `@aphrody/shenron-ui/toriyama-svg` (rasterisées par `loadImage` sur SVG, à confirmer par un test
  de rendu), pas de nouveaux dessins à main levée.
- Polices : Google Sans Flex (interface), Saiyan Sans (titres), Teko (chiffres), DBS Scouter
  (relevés) ; repli emoji et CJK déjà couvert.
- Les cartes publiques sont servies **par URL** (`/api/public/profile/:id/card.png?v=<hash>`) et
  référencées dans un Media Gallery : pas de pièce jointe, cache CDN Discord, rendu partagé avec le
  site. Les cartes privées (solde détaillé) restent des pièces jointes `attachment://`.
- Tests : dimensions et poids bornés, rendu de référence par hachage perceptuel, sans dépendre des
  polices système (suite `canvas-render.test.ts` existante à étendre).

---

## 5. Fiches par commande

Format : problème → refonte → effort. Les noms cibles sont les identifiants anglais ; le français
(et le japonais) deviennent des localisations. Les commandes d'un même lot sont groupées.

### 5.1 Nommage cible (D3)

| Actuel                                             | Cible (EN)                                  | Localisation fr | Remarque                               |
| -------------------------------------------------- | ------------------------------------------- | --------------- | -------------------------------------- |
| `/profil`                                          | `/profile`                                  | `profil`        | `member` (était `membre`)              |
| `/top`                                             | `/top`                                      | `classement`    | métrique et période en sélecteurs      |
| `/solde`, `/inventaire`, `/eprofil`                | `/wallet` (et onglets de `/shop`)           | `solde`         | fusion (§5.2)                          |
| `/planete`, `/succes`, `/niveau`, `/voc`           | `/planet`, `/achievements`, `/xp`, `/voice` | noms actuels    | `/xp` est un groupe staff              |
| `/pfc`, `/morpion`, `/pendu`, `/bingo`             | `/play` (concentrateur)                     | `jouer`         | `rps`, `tictactoe`, `hangman`, `bingo` |
| options `mode`, `mise`, `adversaire`, `difficulte` | `mode`, `stake`, `opponent`, `difficulty`   | libellés fr     | valeurs `easy                          | normal                        | hard`, `bot | player` |
| `/canon jour                                       | citations                                   | sujets`         | `daily`, `quotes`, `topics`            | `jour`, `citations`, `sujets` |             |

Test de garde (comme `apps/site/tests/english-routes.test.ts`) : aucune commande ni option
française dans les identifiants du bot, et toutes les chaînes localisées présentes en `fr`, `en`, `ja`.

### 5.2 Profil, niveaux, économie (lots L2 et L3)

| Commande                                      | Problème                                                                                          | Refonte proposée                                                                                                                                                                                                                                                                | Effort   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `/profile`                                    | Public, image plus embed qui répète l'image ; 5 champs ; barre ▰▱ en double                       | Éphémère par défaut (option `public`) ; Container : Media Gallery (carte par URL), 3 lignes (niveau et rang, zéni, fusion), boutons Boutique, Équiper, Voir sur le site (lien `/profile/<id>`), Partager ; la barre de progression reste dans l'image                           | 1,5 j    |
| `/top`                                        | Image plus liste texte identique, pagination legacy                                               | Un Container : Media Gallery (podium et 10 lignes), sélecteur métrique (XP, zéni) et période (général, mois : l'API gère `period=month`), pager V2 ; variante vivante : un message « Classement » épinglé dans le salon dédié, édité toutes les 10 min (SUPPRESS_NOTIFICATIONS) | 2,5 j    |
| `/boosts`                                     | Mur de texte de 12 lignes                                                                         | Panneau éphémère : multiplicateur actuel en gros, 3 facteurs (rôle ou booster, race, nuit ou groupe), une phrase « pourquoi pas de gain en vocal » ; détails dans un sélecteur                                                                                                  | 1 j      |
| `/scan`                                       | Embed plus PNG ; pas de clic droit                                                                | Menu contextuel « Scanner » (USER) plus commande ; carte seule dans un Media Gallery, une ligne de texte                                                                                                                                                                        | 0,75 j   |
| `/race`                                       | Bon principe, texte codé en dur                                                                   | Container avec Section (race actuelle plus Thumbnail), 6 boutons ; bonus de race en 2 lignes ; localisation                                                                                                                                                                     | 0,75 j   |
| `/wallet`                                     | Double `/profil` ; public                                                                         | Éphémère : solde, 7 derniers jours (courbe canvas), puits de dépense suggérés ; lien vers la boutique                                                                                                                                                                           | 1 j      |
| `/shop`                                       | Huit points d'entrée (`/shop`, `/buy`, `/shop-panel`, `/shop-item`, `/eprofil`, `/inventaire list | equip                                                                                                                                                                                                                                                                           | dequip`) | Une commande éphémère à onglets (Boutique, Mes objets, Personnaliser) : sélecteur de rayon, **planche de 4 aperçus rendue en une image**, sélecteur d'objet, bouton Acheter (confirmation sur place, pas de message public), bouton « Équiper maintenant » avec prévisualisation de la carte avant d'équiper ; autocomplétion partout ; noms d'objets à la place des clés | 5 j |
| `/fusion`, `/defusion`                        | Flux bouton accepter ou refuser correct                                                           | Carte de fusion existante (`FusionService`), message unique édité, expiration claire, localisation                                                                                                                                                                              | 1,5 j    |
| `/zeni`, `/custom` (admin)                    | Textes en dur                                                                                     | Éphémère, localisés, ajout d'un journal V2 compact                                                                                                                                                                                                                              | 0,5 j    |
| Annonces de niveau, succès, quête quotidienne | `content: <@id>` plus embed à chaque palier                                                       | Flux unique « Sanctuaire » (§5.5) ; palier majeur : message V2 dédié avec mention, au plus un par palier de race                                                                                                                                                                | 2 j      |

Total L2 : 8,5 j (6,5 j de commandes, 2 j pour le flux d'annonces du §5.5). Total L3 : 8 j
(boutique, fusion, solde, admin).

### 5.3 Savoir : wiki, canon, databooks, épisodes, manga (lot L4)

| Commande                        | Problème                                                 | Refonte proposée                                                                                                                                                                                                                                                                                                                                                           | Effort |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `/wiki`                         | Pagination « Précédent / Suivant » entre transformations | Container : Section (nom en lexique ja/fr/en, race, Thumbnail), 4 lignes de faits sourcés, **sélecteur de transformations** (une page par choix), bouton Fiche complète ; noms issus du lexique unique `packages/lexicon`                                                                                                                                                  | 1,5 j  |
| `/races`, `/planet`             | Listes en embed                                          | Container avec listes paginées V2, autocomplétion, lien vers la page du site                                                                                                                                                                                                                                                                                               | 1,5 j  |
| `/ask`                          | 100 % extraits ; boutons staff affichés à tous           | Réponse courte sourcée (même moteur que `/api/public/rag/chat`, persona Whis, `generateAnswer` de `lib/rag-answer.ts` appelé en processus, repli sur `hybridSearch` local), citations [1], [2] en boutons de lien, boutons « utile / pas utile » pour tous ; entraînement RAG déplacé dans un bouton « Revue staff » qui ouvre un panneau éphémère contrôlé par permission | 3 j    |
| `/canon verifier`               | Cinq sous-commandes                                      | Carte verdict (accent selon CANON, SEMI-CANON, NON-CANON), une phrase, sources en boutons ; `daily`, `quotes`, `topics` en sous-commandes légères ou en sélecteur du panneau ; `daily` aussi publié par le cron existant dans le flux                                                                                                                                      | 2 j    |
| `/databooks`                    | Embeds ; pas de lecteur                                  | Media Gallery des planches (images du site), transcription dans un Text Display repliable (premières lignes plus lien), bouton « Ouvrir dans le lecteur » (`DatabookReader`) ; recherche plein texte en autocomplétion                                                                                                                                                     | 2 j    |
| Menu épisodes (`ForumEpisodes`) | Éphémère, bon modèle                                     | Carte épisode V2 : image (frame qualifiée), titre, synopsis, boutons Regarder (lecteur du site), Reprendre (lien profond), Suivant                                                                                                                                                                                                                                         | 1,5 j  |
| **Nouveau** `/episode`          | Absent                                                   | Recherche par titre, numéro, saga ; réutilise `episode-resolver.ts` ; réponse éphémère                                                                                                                                                                                                                                                                                     | 1 j    |
| **Nouveau** `/manga`            | Absent                                                   | Planche d'un tome (`/api/public/manga/page/:series/:volume/:page`) dans un Media Gallery, navigation par pager, bouton « Lire en plein écran » vers le lecteur manga du site ; respecte les invariants éditoriaux (manga et scans prioritaires)                                                                                                                            | 1,5 j  |
| `/scanlate` (staff)             | Correct                                                  | V2, boutons Approuver et Rejeter, lien Shenron Studio (`/studio`)                                                                                                                                                                                                                                                                                                          | 0,5 j  |

Total L4 : 14,5 j, répartis en L4a (`/wiki`, `/races`, `/planet`, `/ask`, `/canon` : 8 j) et L4b
(`/databooks`, menu épisodes, `/episode`, `/manga`, `/scanlate` : 6,5 j).

### 5.4 Jeux existants (lot L6)

Un concentrateur `/play` (éphémère) liste les jeux avec leur plafond du jour restant, la série du
défi du jour, et lance le jeu ; les raccourcis `/quiz`, `/duel`, `/raid`, `/hunt`, `/daily`,
`/gravity` existent pour les nouveaux jeux.

| Jeu          | Problème                                                  | Refonte proposée                                                                                                                                                                                                                                                                                         | Effort |
| ------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Pendu        | Lettres tapées dans le salon, plateau supprimé et renvoyé | Un message édité ; deux sélecteurs de lettres (A à M, N à Z : 26 boutons ne tiennent pas dans la limite de 40 composants avec le reste de la carte) ; saisie du mot entier par modale (Text Input) ; plateau canvas existant (`game-cards.ts`) conservé et recoloré ; le journal de session est conservé | 1,5 j  |
| Bingo        | Nombres tapés dans le salon                               | Même mécanique : boutons plus modale numérique ; indice « plus haut / plus bas » dans le même message                                                                                                                                                                                                    | 1 j    |
| Morpion      | 12 embeds, bon moteur                                     | V2, un seul message, grille 3 x 3 de boutons (déjà), avatars des deux joueurs en Thumbnail, fin de partie avec ligne gagnante surlignée                                                                                                                                                                  | 1 j    |
| PFC          | Choix en éphémère mais messages publics multiples         | Remplacé par le **Duel de Ki** (§6, jeu G4) ; PFC reste un mode rapide                                                                                                                                                                                                                                   | inclus |
| Socle commun | Quatre sessions parallèles réécrites                      | `services/games/runtime` : une machine à états de partie (créée, en cours, réglée) qui édite un message unique, journal de session et séquestre existants repris tels quels, budget quotidien unique (G8)                                                                                                | 2,5 j  |

Total L6 : 6 j.

### 5.5 Annonces et flux (lot L2, sous-lot)

Nouveau `LevelAnnounceService` (fichier neuf, sans toucher `LevelService`) : `handleLevelUp`
publie ses événements dans une file ; un seul message V2 « Flux du Sanctuaire » par salon est édité
au plus une fois par minute (SUPPRESS_NOTIFICATIONS), 10 lignes courtes (niveau, succès,
quête, victoire de raid), figé et remplacé chaque jour. `vocal_tempo_created/destroyed` et
`sleepcall_start/end` sont désactivés par défaut (le salon vocal est déjà visible) ou fondus dans
le flux. Les gabarits d'événements existants (`message_templates`) restent éditables depuis le
tableau de bord ; le flux est leur nouveau rendu.

### 5.6 Staff et communauté (lot L5)

| Commande / groupe                                                                      | Problème                                      | Refonte proposée                                                                                                                                                                                                                                                                                                  | Effort |
| -------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Modération (19 commandes, `/jail`)                                                     | Une commande par sanction ; 71 embeds         | Menu contextuel USER « Modérer » et MESSAGE « Signaler » ; modale (Radio Group sanction, Select durée, Text Input motif) ; confirmation éphémère ; journal staff V2 avec numéro de cas ; annonce publique compacte inchangée ; commandes textuelles conservées en alias. Limite : 15 commandes USER et 15 MESSAGE | 4 j    |
| `/ticket-panel`, `/close`, `/ticket`                                                   | Embeds                                        | Panneau V2, en-tête de ticket avec bouton « Prendre en charge », transcription à la fermeture, formulaire par modale                                                                                                                                                                                              | 2 j    |
| `/voc`                                                                                 | Trois actions sans interface                  | Panneau de salon vocal temporaire (V2) posté dans le chat textuel du vocal : verrouiller, limite, renommer, expulser par User Select, bouton **Lancer l'Arène** (Activité)                                                                                                                                        | 2 j    |
| `/giveaway`                                                                            | 7 options, annonce de gagnant en plus         | Création par modale ; carte unique avec compte à rebours `<t:…:R>` ; le gagnant est écrit dans la même carte                                                                                                                                                                                                      | 1,5 j  |
| `/invitations`, `/inviteur`                                                            | Deux commandes                                | `/invites` éphémère                                                                                                                                                                                                                                                                                               | 0,5 j  |
| `/help`                                                                                | Catégories saisies à la main                  | Généré depuis `client.applicationCommands` (la même source que `/api/public/commands`) ; recherche par autocomplétion ; V2 ; localisé                                                                                                                                                                             | 1,5 j  |
| `/config`, `/tiktok`, `/admin`, `/train`, `/succes`, `/report`, `/goal`, `/ids`, `/xp` | Beaucoup d'embeds ; le site couvre une partie | Éphémères, V2, panneau de configuration par catégorie, modales ; à retirer seulement après parité du tableau de bord web (décision propriétaire)                                                                                                                                                                  | 2,5 j  |

Total L5 : 14 j (L5a modération 4 j, L5b reste 10 j).

---

## 6. Nouveaux jeux

Sept jeux, tous jouables sans taper dans le salon, tous bornés par un **budget quotidien unique**
(G8). Les gains en zéni passent par une extension de `GameRewardService` (`grantFixed`, clé
d'idempotence). Aucun jeu ne verse d'XP multiplié par les rôles.

### G1. Quiz Budokai (`/quiz`, lot L7a)

- **Mécanique** : manches de 5 à 10 questions, 15 s, 4 réponses en boutons ; trois modes : _Quiz du
  jour_ (5 questions, une fois par jour, série), _Salon_ (un hôte lance, jusqu'à 25 joueurs, un message
  à scores vivants), _Activité_ (même moteur en plein écran, §7). Catégories : personnages, techniques,
  transformations, sagas et tomes, citations des databooks.
- **Contenu** : banque `quiz_questions` générée à partir des tables du wiki (personnage ↔ race,
  planète, technique ↔ propriétaire, saga ↔ tomes) et des databooks, chaque question portant sa
  source (lien de fiche). Manga, databooks et déclarations de Toriyama priment ; Fandom est interdit.
  Noms par le lexique unique (ja, fr, en).
- **Gains** : quiz du jour 10 zéni par bonne réponse (au plus 50) plus 5 par jour de série (au plus 100) ; salon : podium 60, 40, 20 ; titre cosmétique de saison.
- **Anti-abus** : horloge serveur uniquement, une réponse par joueur et par question, temps minimal
  plausible (800 ms), aucune question revue en moins de 30 jours par membre, ligne unique
  `daily_claims(user_id, day, game)`, comptes de moins de 7 jours ou de niveau 1 exclus des gains.
- **Effort** : moteur et banque 4 j, commande et interface 2 j (6 j).

### G2. Raid mondial (`/raid`, lot L7b)

- **Mécanique** : un boss par semaine (Cell, Freezer, Majin Buu, Broly, Jiren…) à points de vie
  partagés ; bouton Attaquer (3 charges, une toutes les 30 min) ; dégâts bornés entre 50 et 150 selon
  une puissance logarithmique du niveau et de la race (pas de multiplicateur de rôle) ; un message V2
  épinglé, édité au plus toutes les 30 s (barre de points de vie en canvas, 5 meilleurs contributeurs).
- **Gains** : à la victoire, 100 à 400 zéni selon la part de dégâts (plafond), titre cosmétique
  « Vainqueur de <boss> », bonus du dernier coup tiré au sort.
- **Anti-abus** : charges stockées en base (aucun contournement par clics rapides), versement
  idempotent `raid_payouts(raid_id, user_id)`, comptes de moins de 7 jours exclus.
- **Effort** : 4 j.

### G3. Chasse aux Dragon Balls (`/hunt`, lot L7c)

- **Mécanique** : événement mensuel. Sept Dragon Balls sont attachées à des messages récents tirés au
  hasard (un indice discret, aucun message de plus) ; `/radar` (une fois par heure, éphémère) montre
  une mini-carte canvas des « signaux » par salon ; le bouton Ramasser est un bouton de la carte
  d'indice (premier arrivé). Sept boules réunies déclenchent l'invocation de Shenron : sondage natif
  (10 réponses au plus) pour choisir un vœu parmi des vœux **non économiques** (salon thématique de
  24 h, emoji ou sticker du mois, couleur de rôle, thème de la journée).
- **Gains** : badge « Chasseur » plus 200 zéni par boule trouvée (au plus 2 par membre par événement).
- **Anti-abus** : emplacements non prédictibles, comptes de plus de 7 jours, limite par membre.
- **Effort** : 5 j.

### G4. Duel de Ki (`/duel`) et Tournoi du Budokai (`/budokai`, lot L7d)

- **Duel** : au meilleur de 3 manches, choix secrets et simultanés (boutons éphémères) : Charger
  (+1 ki), Attaquer (coûte 1 ki), Kamehameha (coûte 3 ki), Garder, Téléporter (esquive l'attaque,
  perd contre Charger). Plus profond que pierre-feuille-ciseaux, même mécanique de révélation
  simultanée. Un canvas par manche, un message édité. Mise facultative (séquestre existant).
- **Tournoi** : hebdomadaire, 8 ou 16 inscrits par bouton, droit d'entrée de 50 zéni versé à la
  cagnotte, manches asynchrones sur 24 h ou en direct dans l'Arène, tableau en image éditée ;
  cagnotte intégralement redistribuée (aucun zéni créé), titre exclusif au vainqueur.
- **Anti-abus** : plafond par paire (existant), niveau minimal, aucun duel contre soi, collusion
  détectée par `pairKey`.
- **Effort** : duel 4 j, tournoi 4 j (8 j avec le socle partagé).

### G5. Planche du jour (`/daily panel`, lot L7e)

- **Mécanique** : un détail d'une planche publiée (recadrage par `sharp` d'une page de
  `/api/public/manga/page/...`) ; trois essais pour trouver le tome (autocomplétion), l'image s'élargit
  à chaque erreur ; résultat partageable sans spoiler (une ligne). Même défi sur le site (même série).
- **Gains** : 25 zéni par réussite, série.
- **Anti-abus** : un défi par jour, calcul de la planche côté serveur, graine = jour.
- **Effort** : 3 j.

### G6. Mot du jour (`/daily word`, lot L7e)

- **Mécanique** : devinette à la Wordle (5 lettres, vocabulaire Dragon Ball : personnages, techniques,
  lieux, via le lexique) ; saisie par modale, grille affichée en éphémère, partage d'une grille d'emojis
  sans lettres. Avantage : format connu, viral, quasi sans coût d'infrastructure.
- **Gains** : 25 zéni, série.
- **Effort** : 3 j.

### G7. Salle de gravité (`/gravity`, lot L7f)

- **Mécanique** : l'utilisateur choisit une gravité (x10 à x100, déverrouillée par niveau) et une durée
  (1, 4 ou 8 h) ; le résultat est prêt à l'échéance et se lit via `/gravity` (option : message privé
  consenti). Chance de réussite selon niveau et gravité ; échec = repos de 2 h. Récompense :
  « points d'entraînement » (monnaie cosmétique pour titres et auras), pas d'XP.
- **Anti-abus** : une session à la fois, chronologie en base, aucune conversion en zéni.
- **Effort** : 3 j.

### G8. Garde-fous économiques communs

- `games.daily_zeni_budget` (défaut 600) : somme de tous les gains de jeux par membre sur 24 h,
  comptée dans `action_logs` (`kind: "game"`, déjà utilisé par `rewardedWinsLastDay`).
- Chaque jeu a un interrupteur `features.games.<nom>` (kill switch) et une clé d'idempotence.
- Les jeux ne créent pas de multiplicateur et n'en lisent aucun ; l'XP de jeu est interdite par défaut.
- Surveillance : `InflationService` reçoit le débit moyen de la faucille « jeux » ; alerte si le
  versement quotidien dépasse un seuil du stock de zéni.
- Les rôles de palier restent cosmétiques : le multiplicateur d'XP se calcule d'après le niveau et la
  race stockés, pas d'après la présence du rôle (correction de la cause racine de l'incident du
  2026-10-22).

---

## 7. Activité Discord « Arène Shenron »

### 7.1 Choix du jeu

| Option                                                                | Joueurs         | Effort | Verdict                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quiz Budokai** (G1)                                                 | 1 à 25          | M      | **Jeu 1** : jouable seul, meilleur à 3-8 (principe Solo-Plus), spectateurs gratuits, état serveur trivial, contenu déjà dans le wiki                                                                                 |
| **Duel Dragon Pixel** (PvP 1 contre 1)                                | 2 + spectateurs | L      | **Jeu 2** : `DragonPixelEngine` (`packages/engine/src/game.ts`) est un moteur 1 contre 1 déterministe image par image (`tick(p1Input, p2Input)`, `getRenderPacket()`), testé ; solo possible contre un bot d'entrées |
| Mode histoire / vagues de `/games/dragon-pixel` (`engine.ts` du site) | 1               | XL     | Écarté : moteur à un joueur contre vagues, tire `Math.random()` dans l'IA, non conçu pour le PvP                                                                                                                     |
| Immersion DBXV2 / données CPK                                         | n/a             | n/a    | **Exclu** : accès réservé au staff (`docs/products/dbxv2-immersion.md`, `dbxv2-public-absence.test.ts`) ; l'Activité n'embarque aucune donnée du jeu                                                                 |
| Co-visionnage d'épisodes                                              | jusqu'à 25      | L      | Phase 3 possible ; dépend des droits des médias, non traité ici                                                                                                                                                      |

### 7.2 Architecture

```
Client Discord (iframe https://<APPLICATION_ID>.discordsays.com)
  |  postMessage SDK : authorize / authenticate, instanceId, participants, partage
  |  fetch /.proxy/api/*   wss://<id>.discordsays.com/.proxy/ws
  v
Discord proxy (mappage du portail :  "/"  ->  activity.dragonballfr.com)
  v
apps/activity  (Bun.serve, unité systemd shenron-activity gérée par Infra)
  |  GET  /            index.html (no-store) + /assets/<hash>.js|css (immutable)
  |  POST /api/token   échange du code OAuth, GET /users/@me, session HMAC courte
  |  GET  /ws          WebSocket, salon = instanceId, pub/sub natif Bun
  |  GET  /api/health
  +--> API du bot     : /api/activity/{verify,profile,settle}  (HMAC de service)
  |                     verify appelle client.application.fetchActivityInstance(instanceId)
  |                     (l'Activité ne détient jamais le jeton du bot)
  +--> contenu public : /api/public/wiki/*, /api/public/rag/*, /api/public/manga/*
```

Principes :

- **Un seul état de vérité côté serveur.** Le client n'envoie que des intentions (réponse choisie,
  entrées de combat) ; chronomètres, scores, résultats et gains sont calculés par le serveur.
- **L'instance est vérifiée.** À l'ouverture du WebSocket, le serveur demande au bot (appel signé
  `/api/activity/verify`, qui lit `GET /applications/{app}/activity-instances/{instance}`) que
  l'utilisateur figure dans `users[]` de l'instance (cache de 30 s), puis refuse toute autre
  instance. Le jeton du bot reste dans le processus du bot.
- **Récompenses créditées par le bot**, jamais par l'Activité : la fin de manche appelle
  `POST /api/activity/settle` ; le bot applique plafonds et budget quotidien et renvoie ce qui a été
  réellement versé (affiché à l'écran). Clé d'idempotence `activity:<instanceId>:<roundId>:<userId>`.
- **Un seul message dans le salon** : le bot poste (ou laisse Discord poster) une carte de salon
  et l'édite avec le podium à la fin ; aucune notification.
- **Pas d'hôte Next.** Le HTML de l'Activité doit être la racine `/` de l'hôte mappé et ses assets
  relatifs ; `apps/site` émet globalement `X-Frame-Options: SAMEORIGIN` et
  `frame-ancestors 'self'` (`next.config.ts`, lignes 449-463), ce qui bloquerait l'iframe. Un hôte
  dédié `activity.dragonballfr.com`, sans ces deux en-têtes, évite le problème (à confirmer par le
  spike du jour 1, la documentation ne décrit pas le traitement des en-têtes par le proxy).
- **Mock hors Discord.** Le SDK ne fait pas son handshake hors client Discord : le client expose un
  `FakeDiscordSdk` (activé seulement par `?mock=1` en développement, exclu du bundle de production)
  pour les tests navigateur à 1280 et 390 px avec Aphrody Web.

### 7.3 Plan par fichiers

| Chemin (nouveau sauf mention)                                  | Rôle                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/activity/package.json`, `src/protocol.ts`            | Messages client et serveur en union discriminée zod v4, version du protocole, limites de taille                                                                                                              |
| `packages/activity/src/rooms/room.ts`                          | Machine à états de salon (lobby, en cours, résultats), horloge injectée, expulsion des inactifs                                                                                                              |
| `packages/activity/src/games/quiz/*`                           | Règles, sélection, notation, anti-triche ; **partagées** avec `/quiz` du bot et le site (un moteur, trois surfaces)                                                                                          |
| `packages/activity/src/games/duel/*`                           | Session de duel au-dessus de `DragonPixelEngine` : tampon d'entrées, retard d'entrée de 4 images, hachage d'état toutes les 60 images, bot d'entrées                                                         |
| `packages/activity/src/i18n/{fr,en,ja}.json`                   | Libellés de l'Activité (aucun texte codé en dur)                                                                                                                                                             |
| `apps/activity/src/server.ts`, `auth/{oauth,session}.ts`       | `Bun.serve`, échange de code, session HMAC (jeton porteur gardé en mémoire, pas de cookie)                                                                                                                   |
| `apps/activity/src/ws/hub.ts`                                  | WebSocket : `maxPayloadLength` 4 Ko, `idleTimeout`, limiteur par connexion, diffusion par `server.publish("room:<instanceId>")`                                                                              |
| `apps/activity/src/ports/{discord,bot,content}.ts`             | Ports sortants injectables (tests sans réseau)                                                                                                                                                               |
| `apps/activity/client/{index.html,main.tsx,sdk.ts,...}`        | Client React 19 ; `sdk.ts` isole `@discord/embedded-app-sdk` ; écrans Lobby, Quiz, Duel, Résultats                                                                                                           |
| `apps/activity/scripts/build.ts`                               | `Bun.build` d'une entrée HTML, `@aphrody/bun-plugin-tailwind`, noms hachés, sortie `dist/activity/`                                                                                                          |
| `apps/activity/deploy/`                                        | Exemples d'unité systemd et de bloc de proxy inverse (WebSocket) ; l'application appartient à Infra                                                                                                          |
| `apps/bot/src/api/activity.ts`                                 | Routes `/api/activity/verify`, `/api/activity/profile` et `/api/activity/settle` (nouveau fichier ; une ligne de montage dans `server.ts`)                                                                   |
| `packages/api/src/contract/activity.ts`                        | Contrat zod des routes de service et entrée OpenAPI (`bun packages/api/scripts/openapi.ts`)                                                                                                                  |
| `apps/bot/src/commands/games/Arena.ts`                         | `/arena` et gestionnaire `isPrimaryEntryPointCommand()` (phase 2, `handler: 1`) : `launchActivity()` plus carte de salon V2                                                                                  |
| `apps/site/src/app/games/page.tsx`, `messages/{fr,en,ja}.json` | Carte « Arène Shenron » sur `/games` (sans texte codé en dur)                                                                                                                                                |
| `docs/operations/ENV.md`                                       | Nouvelles variables : `SHENRON_ACTIVITY_SECRET`, `SHENRON_ACTIVITY_PORT`, `SHENRON_ACTIVITY_PUBLIC_URL` (réutilise `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_PUBLIC_KEY` ; pas de jeton de bot) |

Autorisation entre services : `SHENRON_ACTIVITY_SECRET` est un secret **distinct** de
`API_USER_SECRET` ; la signature couvre `ts` et l'octet exact du corps (HMAC-SHA256), tolérance de
2 minutes, clé d'idempotence en base. L'en-tête `x-acting-*` ne convient pas ici : il authentifie un
seul utilisateur et n'a pas de nonce.

Duel (jeu 2, phase 2) : verrouillage par retard d'entrée (quatre images, environ 67 ms à 60 images
par seconde). Chaque client simule `DragonPixelEngine` localement avec les entrées échangées par le
serveur ; **le serveur simule aussi** et tranche le résultat. Les seules sources aléatoires du moteur
sont les particules (cosmétiques) ; elles ne comptent pas dans le hachage de synchronisation. Le
rendu se fait sur Canvas 2D à partir de `getRenderPacket()` et de l'atlas de sprites de
`@aphrody/shenron-engine`.

### 7.4 Interface et expérience

- Salle d'attente : liste des participants (pseudo et avatar de guilde par `guilds.members.read`
  récupérés côté serveur), orateur actif en halo (événements `SPEAKING_START` / `SPEAKING_STOP`), bouton
  Inviter (`openInviteDialog`, seulement avec la permission), mode spectateur pour les arrivées tardives,
  bot adversaire quand un seul joueur est présent.
- Mobile : variables de zones sûres, verrou d'orientation paysage pour le duel
  (`setOrientationLockState`), baisse de cadence selon `THERMAL_STATE_UPDATE`,
  `encourageHardwareAcceleration()` juste après `ready()`.
- Partage : `openShareMomentDialog` avec une capture du podium (route d'attachement de l'API), lien
  `shareLink` avec `custom_id` pour « défier » (lecture de `discordSdk.customId` au démarrage).
- Accessibilité : cibles tactiles de 44 px, contraste des jetons du site, réduction des mouvements
  respectée, langue lue par `userSettingsGetLocale()`.

### 7.5 Étapes du portail développeur qui exigent le propriétaire

1. **Vérifier l'application** (identité du propriétaire de l'équipe, onglet App Verification) puis
   activer **Discovery** (Discovery → Discovery Status). Sans cela, l'Activité est limitée à l'équipe
   de développement et, selon l'article d'aide cité au §3.3, aux serveurs de moins de 25 membres.
   Le délai d'instruction est inconnu : c'est le chemin critique du lancement public.
2. Activities → Settings : **Enable Activities**, cocher web et bureau, iOS et Android, renseigner le
   nombre maximal de participants.
3. Activities → URL Mappings : `/` → `activity.dragonballfr.com` (cible sans protocole, dossier) ;
   aucun autre mappage tant que les assets sont servis par le même hôte.
4. OAuth2 : redirect URI espace réservé `https://127.0.0.1` ; portées demandées `identify` et
   `guilds.members.read` (pas `guilds`, pas `email`).
5. Activities → Art Assets : fond de grille 16:9 (1024 px au moins), couverture (16:9 et 13:11),
   tuile, aperçu vidéo 640 x 360 mp4 de moins de 10 s et 1 Mo. Illustrations du dépôt (style Toriyama)
   à faire valider.
6. Commande Entry Point : phase 1, conserver « Launch » (`handler: 2`) ; phase 2, la modifier en
   `handler: 1` (`PATCH /applications/{id}/commands/{command_id}`) une fois `Arena.ts` déployé.
7. Infra : DNS `activity.dragonballfr.com`, TLS, unité systemd, proxy inverse avec WebSocket, **sans**
   `X-Frame-Options` ni `frame-ancestors` restrictif (hôte propre à l'Activité).
8. Équipe de test : ajouter les testeurs à l'équipe du portail (amis Discord requis). Développement
   sur une application séparée avec un tunnel `cloudflared` (cf. `docs/operations/cloudflare-cli.md`).
9. Clé publique de l'application (déjà `DISCORD_PUBLIC_KEY`) pour la vérification facultative
   des en-têtes du proxy ; contrôle d'âge : confirmer que la classification de l'Activité n'impose
   pas de restriction.

### 7.6 Jalons de l'Activité

| Jalon | Lots (§11) | Contenu                                                                                         | Sortie vérifiable                                                                         |
| ----- | ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| J0    | A0         | Spike d'un jour : page « bonjour » via tunnel, mappage `/`, WebSocket, en-têtes, `authenticate` | Preuve par le client Discord réel (capture et journal) ; décision finale sur l'hôte       |
| J1    | A1         | `packages/activity` (protocole, salons, quiz), sans interface                                   | Tests de salons avec horloge simulée ; WebSocket de bout en bout sur un port éphémère     |
| J2    | A2, A3     | Serveur, client et quiz multi-joueurs, vérification et règlement des gains par le bot           | Deux comptes dans un vocal, un podium édité dans le salon, gains plafonnés visibles       |
| J3    | A3         | Entry Point `APP_HANDLER`, carte de salon, liens de partage, fiche de l'Activité                | Lancement depuis `/arena`, depuis le panneau du vocal et depuis le lanceur d'applications |
| J4    | A4         | Duel : retard d'entrée, serveur arbitre, bot d'entrées                                          | Parties de 5 min sans désynchronisation (hachage), test à 150 ms de latence simulée       |

---

## 8. Connexions monorepo

| De, vers                    | Mécanisme existant à réutiliser                                                                               | Ajout proposé                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot vers site               | Liens `siteLink()` de `wiki-embeds.ts`, pages `/profile/[id]`, `/leaderboard`, `/shop`, `/wiki/*`, `/games/*` | Chaque carte V2 a un bouton « Voir sur le site » ; table de liens centralisée dans `ui/links.ts`                                                                                                          |
| Site vers bot               | Proxy signé `/api/bot-user/*` (`x-acting-*`)                                                                  | Défis du jour (planche, mot, quiz) jouables sur le site avec la même série ; route `/api/games/daily/*`                                                                                                   |
| Bot vers API publique       | `/api/public/{wiki,rag,lexicon,manga,news,stats,personas}`, `/api/v1/site/theme`                              | `/ask` réutilise en processus le moteur de `/api/public/rag/chat` (`lib/rag-answer.ts`) avec repli sur `/api/public/rag/*` de `@aphrody/shenron-api` ; palette du bot lue depuis `GET /api/v1/site/theme` |
| Bot vers MCP                | Outils `dragonball_bot_*` et `dragonball_admin_bot_command_execute` déjà exposés                              | Étendre `/api/public/commands` (catégories, localisations) pour que `/commands` du site, `/help` et le MCP partagent une seule liste                                                                      |
| Bot vers wiki et lexique    | `packages/lexicon`, `/api/public/lexicon`                                                                     | Noms de personnages, techniques et lieux en ja, fr, en dans tous les embeds, V2, cartes et questions de quiz                                                                                              |
| Quiz : bot, Activité, site  | Tables du wiki, databooks                                                                                     | Un moteur de règles dans `packages/activity` ; trois surfaces : message Discord, Activité, page `/games/quiz`                                                                                             |
| Dragon Pixel                | `@aphrody/shenron-engine` (`DragonPixelEngine`), `/games/dragon-pixel`                                        | Bouton « Défier sur Discord » sur la page ; `/duel` peut ouvrir l'Activité en mode duel (`LAUNCH_ACTIVITY` plus `custom_id`)                                                                              |
| Lecteurs manga et databooks | `/api/public/manga/*`, `DatabookReader`, `@aphrody/m3-reader/source`                                          | `/manga` et `/databooks` ouvrent le lecteur à la page exacte ; `Scanlate` renvoie vers Shenron Studio (`/studio`)                                                                                         |
| Épisodes                    | `EpisodesService`, `episode-resolver.ts`, forum d'épisodes                                                    | `/episode` et carte épisode V2 avec bouton Regarder (lecteur du site) ; reprise de lecture par lien profond                                                                                               |
| Aperçus de liens            | Pages du site                                                                                                 | `discord:component-embed` (3 000 octets) sur wiki, épisodes, tomes, profils, classements ; carte V2 sans bot ; test de rendu par le débogueur d'embeds Discord                                            |
| Authentification            | `packages/auth` (`acting-user`, Better Auth Discord), OAuth du bot                                            | L'Activité s'authentifie avec la même application Discord ; identifiant Discord = clé de l'économie du bot, aucune table d'identité de plus                                                               |
| Cartes canvas               | `/api/public/profile/:id/card.png`, `scan.png`, `/api/canvas/*` (admin)                                       | Cartes de boutique, de duel, de raid et de planche du jour exposées de la même façon (cache et signature de version)                                                                                      |
| Observabilité               | `InteractionLog`, `StatsService`, `/api/stats/*`, `InflationService`                                          | Compteur de messages du bot par salon, métriques de jeux (parties, gains, plafonds atteints) dans `/api/public/stats`                                                                                     |

---

## 9. Bibliothèques

### 9.1 À adopter ou conserver

| Nom                                           | Version                  | Raison                                                                                                                     | Bun                                                         | Licence            |
| --------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| `discord.js`                                  | 14.27.0 (inchangée)      | V2, modales enrichies, `launchActivity`, `fetchActivityInstance`, entry point                                              | en production                                               | Apache-2.0         |
| `discordx`                                    | 11.13.3 (inchangée)      | Décorateurs et localisations ; ignore proprement les commandes d'entrée ; dernière publication en 2025-12                  | en production                                               | Apache-2.0         |
| `@aphrody/discord-kit`                        | 0.1.3 (exacte)           | Intents, caches, REST ; **proposer en amont** les fabriques V2 génériques plutôt que les copier (CLAUDE.md)                | en production                                               | selon Aphrody      |
| `@napi-rs/canvas`                             | 1.0.9 vers 1.0.12        | Rendu des cartes ; 1.0.12 éligible (3 jours), vérifier `canvas-smoke.ts` puis `canvas-render.test.ts`; 1.0.13 trop récente | en production, binaire compilé géré par `canvas-binding.ts` | MIT                |
| `sharp`                                       | 0.35.5                   | Recadrage, WebP                                                                                                            | en production                                               | Apache-2.0         |
| `@discord/embedded-app-sdk`                   | 2.5.0 (client seulement) | SDK officiel ; 171 jours d'âge ; dépend de `zod` 3, `uuid`, `eventemitter3` (isolés par le linker)                         | bundlé côté navigateur, pas côté Bun                        | MIT                |
| `react`, `react-dom`                          | catalogue (^19.3.0)      | Client de l'Activité                                                                                                       | `Bun.build`                                                 | MIT                |
| `@aphrody/bun-plugin-tailwind`, `tailwindcss` | catalogue                | CSS du client sans Vite                                                                                                    | natif Aphrody                                               | selon Aphrody, MIT |
| `Bun.serve` WebSocket                         | natif                    | Salons par pub/sub, remplace Colyseus, socket.io et PartyKit                                                               | natif                                                       | n/a                |
| WebCrypto Ed25519                             | natif                    | Vérification facultative des en-têtes du proxy sans `tweetnacl` ; à qualifier                                              | natif                                                       | n/a                |
| `zod` 4.6.5                                   | catalogue                | Protocole de l'Activité et contrat des routes de service                                                                   | en production                                               | MIT                |

### 9.2 À évaluer par un spike d'un jour (ne pas adopter avant)

- `@takumi-rs/core` 2.17.1 (MIT ou Apache-2.0, Rust, JSX vers image) : cohérent avec la préférence
  Rust du dépôt, mais non qualifié sous Bun et publié il y a 3 jours.
- `satori` 0.63.2 (MPL-2.0) : mise en page flexbox pour cartes denses ; copyleft de fichier, acceptable
  tel quel sans modification ; non qualifié sous Bun.

### 9.3 À éviter

| Nom                                                | Raison                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skia-canvas` 4.0.0                                | Second binaire Skia en plus de `@napi-rs/canvas`, aucun gain, qualification Bun absente                                                                       |
| `@resvg/resvg-js`, `resvg-wasm` 2.6.2              | Aucune publication depuis 2024-03-26, MPL-2.0 ; utiliser `loadImage` sur SVG de `@napi-rs/canvas` ou `sharp`                                                  |
| `@vercel/og`                                       | Lié à Next et à Node 22, MPL-2.0                                                                                                                              |
| Puppeteer, Playwright pour les cartes              | Navigateur complet, lourd et fragile pour un bot                                                                                                              |
| Colyseus 0.18, PartyKit, boardgame.io, PlayroomKit | Node >= 22.x sans support Bun documenté (Colyseus), modèle hébergé (PartyKit, PlayroomKit, licence non déclarée), paquet abandonné depuis 2022 (boardgame.io) |
| Vite                                               | Règle du dépôt : `Bun.build` ; l'exemple officiel utilise Vite par commodité, pas par exigence                                                                |
| `@discordx/pagination` (à terme)                   | Incompatible V2 ; conservé le temps de la migration puis retiré                                                                                               |
| Phaser, Kaplay, Excalibur                          | Inutiles : le moteur de combat existe et se rend en Canvas 2D                                                                                                 |

---

## 10. Serveur « Dragon Ball FR » : améliorations

Propositions que le bot peut outiller ; chaque changement de structure du serveur reste une
décision du propriétaire.

1. **Structure par usage** : accueil (règles, annonces, onboarding), discussion, savoir (wiki, manga,
   databooks, forum d'épisodes déjà posté par le bot), jeux (commandes, quiz, raid, chasse, classement
   vivant), vocaux (hub vocal temporaire plus Arène), staff. Nouvelles clés `channel.games`,
   `channel.quiz`, `channel.raid`, `channel.hunt`, `channel.leaderboard` dans `guild_settings`.
2. **Onboarding natif** (Server Guide) : question « Quelle race ? » qui pose le rôle de race, question
   « Quels sujets ? » qui donne l'accès aux salons ; le bot aligne alors les rôles de palier (déjà
   `syncRaceLevelRoles`).
3. **AutoMod natif** : règles d'invitations Discord externes et de spam de mentions, ce qui retire
   du chemin chaud de `MessageXP` le contrôle d'invitations par regex (la lecture du contenu des
   messages n'est plus nécessaire pour cela).
4. **Rôles cosmétiques** : les multiplicateurs d'XP se calculent depuis le niveau et la race en base,
   les rôles de palier ne servent qu'à l'affichage (G8).
5. **Événements planifiés** Discord pour le raid hebdomadaire, le tournoi du Budokai, la chasse
   mensuelle et les soirées épisode ; rappel natif sans message du bot.
6. **Sondages natifs** pour le vœu de Shenron et les votes de saga du mois (remplacent les messages
   de vote maison).
7. **Emojis et stickers de serveur** thématiques (7 Dragon Balls, rangs, zéni) hébergés comme
   **emojis d'application** (jusqu'à 2 000), réutilisés dans tous les boutons.
8. **Soundboard du serveur** : quelques sons (rugissement de Shenron, etc.) téléversés par les
   administrateurs, sous réserve de droits.
9. **Journaux** : les huit salons de journaux (audit, économie, messages, sanctions, tickets, niveaux,
   arrivées et départs) restent des embeds ou passent en V2 sans urgence ; ils sont staff seulement.

---

## 11. Lots de livraison

Règles : un lot ne touche que ses chemins ; lire `git status` et `.coord/claims/*.json` avant
d'écrire ; `git commit --only -- <chemins>` ; jamais `git add -A`. Au 2026-10-23, 29 fichiers de
`apps/bot` sont modifiés par d'autres agents (dont `LevelService.ts`, `CardService.ts`,
`EconomyService.ts`, `MessageXP.ts`, `Level.ts`, `Shop.ts`, `locales/*.json`, `scripts/build/bot.ts`)
et plus de quinze sont non suivis : un lot qui doit modifier un de ces fichiers attend leur commit
ou passe par un nouveau fichier. **Migrations SQLite du bot** : numérotation linéaire (dernière
`0023_schema_parity.sql`) et journal partagé ; chaque lot réserve un bloc de numéros (0030 à 0039
pour le quiz, 0040 à 0049 pour le raid, 0050 à 0059 pour la chasse, 0060 à 0069 pour le duel,
0070 à 0079 pour les défis du jour, 0080 à 0089 pour la gravité) et un intégrateur fusionne le
journal. Aucun `db:push`.

| Lot | Titre                                     | Chemins possédés (disjoints)                                                                                                                                     | Dépend de               | Effort |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------ |
| A0  | Spike Activité                            | `apps/activity/spike/**` (jetable)                                                                                                                               | propriétaire (portail)  | 1 j    |
| L0  | Socle UI V2 et i18n                       | `apps/bot/src/ui/**`, `apps/bot/src/locales/**` (après commit des autres), `apps/bot/tests/ui-*.test.ts`                                                         | rien                    | 4 j    |
| L1  | Rendu canvas et cartes                    | `apps/bot/src/render/**`, `canvas-kit.ts`, `canvas-fonts.ts`, `game-cards.ts`, `tests/canvas-*.test.ts` ; `CardService.ts`, `LeaderboardService.ts` après commit | rien                    | 5 j    |
| L2  | Profil, niveaux, top, scan, race, flux    | `commands/level/**`, `commands/race/**`, `commands/fun/Scan.ts`, `services/LevelAnnounceService.ts` (neuf)                                                       | L0, L1                  | 8,5 j  |
| L3  | Économie et boutique                      | `commands/economy/**`                                                                                                                                            | L0, L1                  | 8 j    |
| L4a | Wiki, canon, ask                          | `commands/wiki/{Wiki,Ask,Canon}.ts`, `lib/wiki-embeds.ts`                                                                                                        | L0                      | 8 j    |
| L4b | Databooks, épisodes, manga, scanlate      | `commands/wiki/{Databooks,ForumEpisodes,Scanlate}.ts`, `commands/media/**` (neuf), `lib/episode-*.ts`                                                            | L0                      | 6,5 j  |
| L5a | Modération                                | `commands/moderation/**`, `lib/sanction-*.ts`                                                                                                                    | L0                      | 4 j    |
| L5b | Tickets, vocal, giveaway, aide, config    | `commands/{ticket,vocal,giveaway,utility,admin}/**`                                                                                                              | L0                      | 10 j   |
| L6  | Socle des jeux et jeux existants          | `commands/games/{Pendu,Bingo,Morpion,Pfc,Play}.ts`, `services/games/runtime/**`, `services/GameRewardService.ts` (extension `grantFixed`)                        | L0, L1                  | 6 j    |
| L7a | Quiz Budokai                              | `commands/games/quiz/**`, `services/games/quiz/**`, migrations 0030-0039                                                                                         | L0, L6, A1              | 6 j    |
| L7b | Raid mondial                              | `commands/games/raid/**`, `services/games/raid/**`, migrations 0040-0049                                                                                         | L0, L6                  | 4 j    |
| L7c | Chasse aux Dragon Balls                   | `commands/games/hunt/**`, `services/games/hunt/**`, migrations 0050-0059                                                                                         | L0, L6                  | 5 j    |
| L7d | Duel de Ki et Tournoi                     | `commands/games/duel/**`, `services/games/duel-ki/**`, migrations 0060-0069                                                                                      | L0, L6                  | 8 j    |
| L7e | Planche et Mot du jour                    | `commands/games/daily/**`, `services/games/daily/**`, migrations 0070-0079, `apps/site/src/app/games/daily/**`                                                   | L0, L6                  | 6 j    |
| L7f | Salle de gravité                          | `commands/games/gravity/**`, `services/games/gravity/**`, migrations 0080-0089                                                                                   | L0, L6                  | 3 j    |
| A1  | Protocole, salons et règles du quiz       | `packages/activity/**`                                                                                                                                           | rien                    | 4 j    |
| A2  | Serveur et client de l'Activité, quiz     | `apps/activity/**`                                                                                                                                               | A0, A1                  | 8 j    |
| A3  | Règlement par le bot et Entry Point       | `apps/bot/src/api/activity.ts`, `commands/games/Arena.ts`, `packages/api/src/contract/activity.ts`, une ligne de montage dans `api/server.ts`                    | A1                      | 3 j    |
| A4  | Duel en Activité                          | `packages/activity/src/games/duel/**`, `apps/activity/client/Duel*.tsx`                                                                                          | A2, `DragonPixelEngine` | 8 j    |
| S1  | Site : jeux, liens, aperçus de liens      | `apps/site/src/app/games/**` (hors dragon-pixel), `apps/site/messages/{fr,en,ja}.json` (clés `bot.*`, `arena.*`), pages avec `discord:component-embed`           | L0 (liens)              | 4 j    |
| V1  | Serveur Discord : clés de salons, scripts | `apps/bot/src/db/seed-channels.ts` (neuf), `docs/operations/**` (procédure)                                                                                      | propriétaire            | 3 j    |

Total : 123 j-agent. Avec 4 à 6 agents en parallèle, le calendrier (environ 5 semaines) est dominé par
le chemin critique L0 → L1 → L6 → L7d (4 + 5 + 6 + 8, soit 19 j, car L6 attend le rendu de L1) et par
A0 → A2 → A4 (1 + 8 + 8 = 17 j), plus le délai de vérification de l'application, qui dépend du
propriétaire et de Discord.

Vagues proposées :

1. **Vague 1** (jours 1 à 5) : A0, L0, L1, A1, S1 (liens et aperçus), V1.
2. **Vague 2** (jours 5 à 14, environ 62 j-agent) : L2, L3, L4a, L4b, L5a, L5b, L6, A2, A3.
3. **Vague 3** (jours 12 à 24, environ 40 j-agent) : L7a à L7f, A4, finitions et suppression des anciens identifiants.

Portes de chaque lot : `bun fmt <chemins>`, `bun run lint`, `bun check` du paquet, `bun test --isolate`
des fichiers concernés (depuis `apps/bot`), garde d'identifiants anglais, parité des dictionnaires
fr, en, ja. Pour l'Activité : tests de salons (horloge simulée), test d'intégration WebSocket sur port
éphémère, test d'absence de `X-Frame-Options`, contrôle navigateur à 1280 et 390 px avec le mock du SDK
(`naturalWidth > 0`, absence de débordement), puis un essai dans le vrai client Discord. Après chaque
lot de commandes : `bun --filter @aphrody/shenron-bot gen:entries` (barrel `_entries.ts`) et
`bun packages/api/scripts/openapi.ts --check` si le contrat change.

---

## 12. Risques et décisions du propriétaire

### 12.1 Décisions à prendre

1. Lancer la **vérification de l'application** et **Discovery** (identité du propriétaire). Sans elles,
   l'Activité reste inutilisable sur le serveur de 6 400 membres.
2. Valider l'hôte `activity.dragonballfr.com` (action Infra) et la création de `apps/activity` dans le
   graphe (alternative : l'héberger dans `apps/server`, au prix d'un couplage avec le binaire de bureau).
3. Valider la table de renommage (§5.1) : les noms anglais deviennent canoniques, les noms français
   restent visibles aux clients en français.
4. Décider du sort de `/gay` et `/raciste` (proposition : retrait au profit d'un `/aura` thématique).
5. Valider les plafonds (budget quotidien de 600 zéni, aucun gain d'XP de jeu) et le principe d'un
   flux d'annonces unique à la place des messages par événement.
6. Retirer les commandes de configuration redondantes avec le tableau de bord seulement après parité
   (liste au §5.6).
7. Installation par utilisateur : non retenue pour l'instant (le bot quitte toute guilde non admise et
   enregistre des commandes de guilde) ; à rouvrir si l'on veut `/ask` et `/wiki` hors du serveur.

### 12.2 Risques

| Risque                                                                       | Effet                                | Parade                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Application non vérifiée (limite de 25 membres)                              | Activité inutilisable en production  | Démarrer la vérification dès le jour 1 ; livrer le reste sans attendre                                         |
| En-têtes de l'hôte (cadre, CSP) ou comportement du proxy imprévus            | Iframe vide, WebSocket refusée       | Spike A0 avant tout développement de l'Activité                                                                |
| Drapeau V2 irréversible, 40 composants, texte cumulé non documenté           | Message rejeté ou ancien format figé | `validate()` et tests de gabarits ; un message ne bascule jamais d'un format à l'autre                         |
| Travail concurrent sur les fichiers du bot                                   | Conflits, perte de travail           | Revendications `.coord/claims`, nouveaux fichiers plutôt que modifications, `git commit --only`                |
| Inflation d'XP ou de zéni par les nouveaux jeux                              | Récidive de l'incident du 2026-10-22 | Budget unique, interrupteurs, idempotence, aucun multiplicateur, alerte `InflationService`                     |
| Renommage des commandes                                                      | Habitudes perdues, caches de clients | Localisation française identique aux noms actuels ; communication via `/help` ; pas de suppression brutale     |
| Latence du duel à travers le proxy (Cloudflare Workers)                      | Combat saccadé                       | Retard d'entrée de 4 images, serveur arbitre, mode spectateur, jeu 1 (quiz) livré d'abord                      |
| Droits des illustrations et des scans dans l'Activité et les cartes          | Contestation éditoriale              | Mêmes sources et mêmes règles que le site (manga et scans prioritaires, Fandom interdit) ; aucun contenu DBXV2 |
| Limites de débit sur les éditions fréquentes (flux, raid, classement vivant) | 429 sur les messages édités          | Éditions limitées à une par 30 à 60 s par message, file unique, respect de `Retry-After`                       |
| Exposition des données personnelles dans les cartes publiques par URL        | Fuite de données de profil           | Cartes publiques limitées aux champs déjà publics de `/api/public/user/:id` ; vues privées en pièces jointes   |

---

## 13. Sources et limites de la recherche

### 13.1 Sources primaires lues (2026-10-23)

- Dépôt <https://github.com/discord/discord-api-docs> (lecture des fichiers sources `developers/...`) :
  `components/{overview,reference,using-message-components,using-modal-components}`,
  `activities/{overview,how-activities-work,building-an-activity,design-patterns}`,
  `activities/development-guides/{local-development,networking,multiplayer-experience,user-actions,
  production-readiness,mobile,layout,assets-and-metadata,growth-and-referrals}`,
  `developer-tools/embedded-app-sdk`, `interactions/{application-commands,receiving-and-responding}`,
  `resources/{poll,soundboard,emoji,message}`, `topics/rate-limits`,
  `link-previews/component-embeds`, `discovery/{overview,enabling-discovery}`, `change-log`.
  Équivalents publiés : <https://docs.discord.com/developers/components/reference>,
  <https://docs.discord.com/developers/activities/building-an-activity>,
  <https://docs.discord.com/developers/developer-tools/embedded-app-sdk>, etc.
- SDK : <https://github.com/discord/embedded-app-sdk> (v2.5.0, 2026-05-05, MIT) et exemples
  <https://github.com/discord/embedded-app-sdk-examples> (`discord-activity-starter` : Vite et Express).
- discord.js : notes de version 14.19.0, 14.23.0, 14.24.0, 14.26.0, 14.27.0 sur
  <https://github.com/discordjs/discord.js/releases> ; typings locaux 14.27.0.
- discordx via Context7 (<https://discordx.js.org>) et lecture du code installé (11.13.3).
- Registre npm (versions et dates de publication) interrogé le 2026-10-23.
- Dépôt local : `apps/bot`, `apps/site`, `packages/{api,auth,config,engine,ui}`, `docs/`.

### 13.2 Sources secondaires et réserves

- Articles de vendeurs de bots, à lire avec prudence :
  <https://peakbot.pro/blog/best-discord-economy-bots-2026>,
  <https://peakbot.pro/blog/discord-activities-apps-guide-2026>,
  <https://blog.communityone.io/best-fun-discord-bots/> (résumé de recherche uniquement).
- <https://support-dev.discord.com/hc/hi-in/articles/21204493235991-How-Can-My-Friends-Play-My-Activity> :
  contenu connu **uniquement par l'extrait d'un résultat de recherche** (HTTP 403 à l'ouverture) ; la limite de 25
  membres est à confirmer dans le portail (App Verification, Discovery Status).
- Colyseus : <https://github.com/colyseus/colyseus> (page non spécifique à la version 0.18) ;
  exigence de Node >= 22.x lue dans le registre npm.

### 13.3 Non vérifié

- Le guide <https://discordjs.guide> n'a pas pu être chargé (erreur de connexion) ; les capacités de
  discord.js reposent sur les notes de version et les typings installés.
- Le mappage d'URL avec un chemin dans la cible, le traitement des en-têtes de cadre par le proxy et
  la longueur cumulée de texte d'un message V2 ne sont pas décrits dans la documentation lue.
- `loadImage` sur SVG avec `@napi-rs/canvas`, `satori` et `@takumi-rs/core` sous Bun : non testés.
- Le catalogue public d'Activités populaires n'a pas de source primaire (la page « Trending Games »
  de Discord n'a pas été consultée).
- Aucun test, build ni appel réseau vers Discord n'a été exécuté pour ce document ; aucune modification
  de code ni commit.
