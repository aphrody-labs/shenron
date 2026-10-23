<!-- SPDX-License-Identifier: Apache-2.0 -->

# @aphrody/shenron-activity-app

Serveur et client de l'Activité Discord « Arène Shenron » (lot A2 de `docs/products/bot-discord-refonte.md`,
§3.3, §7). Application privée du monorepo. Les règles (protocole, salons par `instance_id`, Quiz
Budokai, reçus signés) viennent de `@aphrody/shenron-activity` et ne sont pas dupliquées ici.

```
Client Discord (iframe https://<APPLICATION_ID>.discordsays.com)
  |  SDK : ready -> authorize -> POST /api/token -> authenticate ; hello { token, instanceId }
  v
Proxy Discord ("/" -> activity.dragonballfr.com)  ->  apps/activity (Bun.serve)
  GET  /                 index.html (no-store), fichiers hachés (immutable), CSP sans X-Frame-Options
  GET  /api/config       { clientId } (public)
  POST /api/token        code OAuth -> jeton (le secret reste ici)
  GET  /ws               WebSocket : jeton vérifié (GET /users/@me, cache 60 s) -> salon de l'instance
  GET  /health           état (client, oauth, settlement, salons, sockets, reçus)
  fin de manche --> reçu signé (HMAC) --> POST {SHENRON_BOT_API_URL}/api/activity/settle (bot, lot A3)
                                          file bornée en mémoire si le bot répond 404 ou 5xx
```

## Commandes

```sh
bun run --filter @aphrody/shenron-activity-app dev        # client de dev + serveur + faux bot, http://127.0.0.1:5013/?mock=1
bun run --filter @aphrody/shenron-activity-app build      # dist/client (production, sans faux SDK)
bun run --filter @aphrody/shenron-activity-app start      # bun src/main.ts, variables : docs/operations/ENV.md
bun run --filter @aphrody/shenron-activity-app test       # bun test (le test navigateur est *.live.test.ts, exclu)
bun run --filter @aphrody/shenron-activity-app typecheck
bun run --filter @aphrody/shenron-activity-app compile    # binaire unique, voir ci-dessous
bun apps/activity/scripts/browser-check.ts                # Chrome réel, 1280 et 390 px, captures dans dist/shots
```

## Mode développement hors Discord (`?mock=1`)

`bun run dev` construit le client avec un faux SDK (`client/fake-sdk.ts`) et démarre le serveur avec
des identités de développement (`SHENRON_ACTIVITY_DEV_AUTH=1`, boucle locale uniquement, refusé en
production) et un faux bot qui vérifie les reçus comme le vrai (`scripts/fake-bot.ts`). Le faux SDK
rejoue `ready`, `authorize` et `authenticate`, puis des adversaires simulés (de vraies connexions,
`client/mock-bots.ts`) rejoignent le salon.

| Paramètre      | Effet                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| `mock=1`       | active le faux SDK (absent du bundle de production : le build échoue sinon) |
| `user=1..8`    | le personnage joué par la fenêtre (ouvrir plusieurs fenêtres)               |
| `bots=0..7`    | adversaires simulés (3 par défaut)                                          |
| `fast=1`       | les adversaires répondent en moins d'une seconde                            |
| `lang=fr       | en                                                                          | ja` | langue annoncée par le faux SDK (`userSettingsGetLocale`) |
| `instance=...` | salon à rejoindre (`mock-instance` par défaut)                              |

## Binaire unique

`bun run compile` construit le client de production, puis embarque ses fichiers dans l'exécutable
(`bun build --compile`, imports `with { type: "file" }` générés dans `dist/compile/entry.ts`) :
`dist/bin/shenron-activity[.exe]`, rien d'autre à livrer. `--target linux-x64` pour la production,
`--outfile` pour le chemin. Le binaire lit les mêmes variables que `bun src/main.ts`.

## Fichiers

| Chemin                                  | Rôle                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/server.ts`, `src/config.ts`        | `Bun.serve` (routes, WebSocket, fichiers) ; lecture de l'environnement                |
| `src/auth/{discord,dev}.ts`             | échange de code, vérification des jetons (cache court) ; identités de développement   |
| `src/ws/{hub,hello}.ts`                 | sockets : salut, salons par instance, minuteur unique sur `nextDeadline()`            |
| `src/settle/settler.ts`                 | reçus signés, file bornée, nouveaux essais                                            |
| `src/http/{security,assets,limiter}.ts` | en-têtes (CSP), fichiers (gzip, traversée refusée), limiteur de `/api/token`          |
| `client/`                               | React 19 : `use-game.ts` (démarrage), `state.ts` (réducteur pur), `screens/`, `i18n/` |
| `scripts/`                              | `build`, `dev`, `compile`, `browser-check`, `fake-bot`, `tokens`                      |
| `deploy/`                               | exemples d'unité systemd et de proxy inverse (l'hébergement appartient à l'Infra)     |

## Mise en ligne : ce qui reste au propriétaire et à l'Infra

Voir `docs/products/bot-discord-refonte.md` §7.5. En résumé : vérifier l'application et activer
Discovery (chemin critique), activer les Activités (web, bureau, iOS, Android), mappage d'URL
`/` -> `activity.dragonballfr.com`, redirect URI espace réservé `https://127.0.0.1`, portées `identify`
et `guilds.members.read`, visuels de la fiche ; Infra : DNS, TLS, unité systemd et proxy inverse avec
WebSocket et sans `X-Frame-Options` (`deploy/`), variables de `docs/operations/ENV.md`
(`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SHENRON_ACTIVITY_SECRET`, `SHENRON_ACTIVITY_TOKEN`,
`SHENRON_BOT_API_URL`), puis un essai dans le vrai client Discord (les contrôles ici ne le remplacent
pas : la CSP posée par le proxy de Discord n'est pas documentée).

## Limites connues

- L'appartenance à l'instance n'est pas vérifiée côté bot (la route `/verify` du §7.2 n'existe pas) :
  le jeton Discord prouve l'identité, pas la présence dans l'Activité. `ActivityHub` accepte un port
  `verifyMembership` prévu pour ce contrôle.
- Les files de reçus ne survivent pas à un redémarrage (voir `docs/operations/ENV.md`).
- Les sources des questions de type page ne sont montrées qu'en texte : un lien sortant passe par
  `openExternalLink` du SDK, non câblé.
