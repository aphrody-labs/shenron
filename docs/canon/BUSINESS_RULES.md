# Règles métier du canon (extraction du 2026-11-19)

Fichier généré par la boucle d'extraction `code-modernization:modernize-extract-rules` sur `apps/site/src/lib/canon-*.ts` et les fichiers qui les prolongent (3 tours, arrêt au plafond de tours avant épuisement : la queue n'est pas exhaustive). Chaque règle a une citation `fichier:lignes` vérifiée par un arbitre indépendant ; 1 règle rejetée. Les règles sont décrites en anglais comme extraites ; la forme Étant donné, Quand, Alors est celle du code lu, pas une spécification validée par le propriétaire.

Lecture de la priorité : le panneau P0 applique une grille financière et réglementaire qui ne s'applique pas à un wiki de fans ; 4 règles sont restées P0 et 90 portent une question pour un expert (champ « À confirmer »). Une règle P1 ou P2 ci-dessous reste une règle de comportement observable du verdict de canon.

Bilan : 181 règles confirmées, 56 objets de données (voir [DATA_OBJECTS.md](DATA_OBJECTS.md)), 0 signalement d'injection dans les sources lues.

## `apps/bot/scripts/ingest/seed-canon.ts` (2)

### Reference data seed is insert-if-absent by slug and never updates

P2 · Lifecycle · confiance Medium · `apps/bot/scripts/ingest/seed-canon.ts:119-352, 444-480`

The seed script adds races, sagas and games only when their slug does not already exist and never corrects an existing row, so edits to the seed data do not reach a populated database.

- Given: A database already holding the saga 'moro' with an older description
- When: seed-canon runs
- Then: No row is updated. Only missing slugs are inserted and the log prints counts such as '+0 races, +1 sagas, +0 games'. Existing saga ids are still reused to build the slug-to-id map. Each saga is numbered per series code with an orderIdx (DB 1-7, DBZ 1-7, DBGT 1-4, DBS 1-6, DBS_MANGA 7, 8 and 10, DBS_MOVIE 9, DB_DAIMA 1).
- Parameters: series codes DB, DBZ, DBGT, DBS, DBS_MANGA, DBS_MOVIE, DB_DAIMA

### Seed of races, sagas and games is insert-if-absent

P1 · Lifecycle · confiance Medium · `apps/bot/scripts/ingest/seed-canon.ts:444-480`

The reference seed adds races, sagas and games that do not exist yet (matched by slug) and never updates or deletes existing rows, so rerunning it is safe.

- Given: Seed lists of 14 races, 28 sagas and 10 games and a database that already has some of them by slug
- When: seed-canon runs
- Then: Each row is inserted only when no row with the same slug exists; existing rows are left untouched and their id is reused for the saga id map; games get publisher 'Bandai Namco Entertainment'; the script prints counts of inserted rows
- Parameters: series codes DB, DBZ, DBGT, DBS, DBS_MANGA, DBS_MOVIE, DB_DAIMA; slug is the identity key
- Edge cases: Corrections to the seed text never reach existing rows ; Check-then-insert is not atomic, so two concurrent runs could conflict unless slug is unique in the schema ; The Super Hero saga is tagged DBS_MOVIE with order 9 inside the DBS manga numbering sequence

## `apps/bot/src/commands/wiki/Canon.ts` (5)

### Bot /canon command access and input guards

P1 · Validation · confiance High · `apps/bot/src/commands/wiki/Canon.ts:203-262,380-413,452-500`

All /canon commands are guild-only, restricted to the commands channel and gated by the wiki feature flag; /canon jour is admin-only; free-text inputs have length bounds.

- Given: A user runs /canon verifier or /canon citations
- When: The command is validated
- Then: Guards GuildOnly, CommandsChannelOnly and FeatureEnabled('features.wiki') apply to the whole group; verifier affirmation must be 2-400 chars (trimmed before use; titles over 100 chars from autocomplete are clipped to 100 and treated as free text); citations term must be 2-100 chars and provenance is limited to shenron or databooks (12 results); no verdict -> 'arbitre injoignable', no doctrine -> 'doctrine injoignable', zero citations -> 'Aucune preuve ne mentionne « terme »'. /canon jour is AdminOnly and ephemeral: action 'publier' forces a post (ignores hour and enabled flag), otherwise shows state; failure reasons map to messages no_channel, fetch_failed, no_entry, error
- Parameters: affirmation 2-400; terme 2-100; citations page size 12; settings canon.daily_enabled default false, canon.daily_hour default 18 (UTC), canon.rotation_index default 0, canon.channel; autocomplete result max 25
- Edge cases: Citations term is cut to 200 chars by the service but the command limit is 100 ; provenance accepts any string from the API side; only the two slash choices are offered

### /canon sujets listing: tier filter and paging

P2 · Policy · confiance High · `apps/bot/src/commands/wiki/Canon.ts:317-378`

Ruled topics can be listed all together or for one of the five tiers, six per page.

- Given: Doctrine with N entries, optional tier choice
- When: /canon sujets [rang] runs
- Then: Entries are filtered by exact tier; zero entries returns 'Aucun sujet tranché pour ce rang.'; otherwise pages of 6 entries are sent, each with tier emoji, score bar (width 8) and verdict clipped to 200 chars
- Parameters: page size 6; verdict clip 200; description 4096
- Edge cases: rang values are a closed list of five tier ids ; Doctrine unreachable returns a transient message, not an empty list

### Discord canon embed evidence limits and French-first text

P2 · Policy · confiance High · `apps/bot/src/commands/wiki/Canon.ts:41-46, 100-175, 342-347, 394-396, 415-445; apps/bot/src/services/CanonService.ts:253-261`

The bot shows at most 2 references, 3 plates, 4 wiki sheets and 4 suggestions per verdict, prefers the French translation over the original, and lists subjects 6 per page with a 25-item autocomplete.

- Given: A verdict with 5 references, 5 plates, 6 sheets and 6 suggestions
- When: The /canon verifier embed is built
- Then: 2 references (textFr when present, else text), 3 plates (check mark when verified), 4 sheets and 4 suggestions are shown. The original text is shown separately only when a translation exists and lang is not 'fr'. The /canon citations provenance filter offers only 'shenron' and 'databooks', not 'manga' or 'manuel'. /canon sujets pages 6 entries at a time and replies 'Aucun sujet tranché pour ce rang.' when the filter is empty. Autocomplete matches titles by case-insensitive substring and returns at most 25.
- Parameters: refs 2; plates 3; sheets 4; suggestions 4; per page 6; autocomplete 25; question 2-400 chars; citations term 2-100 chars; 12 citations per query

### Verdict embed: unknown or troll verdicts are never presented as ranked

P1 · Policy · confiance High · `apps/bot/src/commands/wiki/Canon.ts:62-189`

When the doctrine has no ruling (fallback) or the question is a troll, the Discord embed is grey, shows no authority bar, no tier definition and no doctrinal sources, and says nothing is classified.

- Given: A verdict with origine 'fallback' or nature 'troll' (nature absent on older APIs: fallback implies 'question', else 'verdict')
- When: The embed is built
- Then: Colour 0x9ca3af, title icon is 🚫 (troll) or ⚪ (unknown); authority bar '(score/100)' hidden; tier definition and sources fields omitted; footer reads 'Hors des sources : rien n'est classé' (troll) or 'Hors doctrine : aucune extrapolation' (fallback); origins starting with entry: read 'Sujet tranché par la doctrine', heuristic: read 'Application de la règle générale'. Evidence caps: max 2 references (textFr preferred), 3 plates (✓ if verified), 4 wiki sheets, 4 suggestions, 5 matched keywords in footer; suggestions titled 'Sujets tranchés qui existent, eux' for trolls
- Parameters: grey 0x9ca3af; embed description 4096, field 1024, quote 950, reference 850 chars; progress bar width 10
- Edge cases: Invalid or missing colour string falls back to the tier's default colour (couleurHex) ; The first plate image becomes the thumbnail, otherwise the first sheet image; sheet image becomes the large image only when there are no plates

### Which canon verdicts are presented as established or scored differs between Discord, web and plugin

P1 · Policy · confiance Medium · `apps/bot/src/commands/wiki/Canon.ts:66-105, 170-182; apps/site/src/app/wiki/canon/page.tsx:381-383, 440-441; scripts/plugin/src/canon.ts:34-43, 155-163`

The Discord command and the offline plugin hide the authority score for fallback answers, but the web page prints a score for any answer whose nature is verdict, including an unmatched assertion answered by the fallback.

- Given: An assertion that matches no entry or family and does not read as a question (fallback tier EXTENSION_OFFICIELLE, score 50)
- When: It is shown on Discord, in the plugin and on the website
- Then: Discord hides the score, definition and sources (origin 'fallback' or troll) and labels it 'Hors doctrine : aucune extrapolation'; the plugin says status 'non etabli' and 'Score 50 (repli, ne fonde rien)'; the website prints 'A verifier dans le corpus - 50 / 100' because nature is 'verdict'. Only entry: origins are 'etabli'; heuristic origins are 'non etabli (rang presume)'.
- Parameters: Discord limits: 2 references, 3 plates, 4 related pages, 4 suggestions; question 2-400 chars; /canon sujets pages of 6; citations search 2-100 chars, 12 results; web search box max 300 chars

## `apps/bot/src/services/CanonService.ts` (5)

### Bot canon client: question cap, doctrine cache, degradation

P2 · Policy · confiance High · `apps/bot/src/services/CanonService.ts:153-157, 194-263`

The bot asks the site for verdicts with a 400-character cap, caches the doctrine for 5 minutes with one request in flight, serves the stale copy when the site is down, and autocompletes topics by title substring up to 25.

- Given: The bot canon service
- When: A user asks a question or autocompletes a subject
- Then: Empty question returns null with no call; question trimmed to 400; request timeout 8 s; non-OK or network failure returns null (stale doctrine is kept if present); sujets filters entries whose lowercased title contains the typed text, max 25.
- Parameters: TIMEOUT 8 s, doctrine TTL 5 min, autocomplete max 25, question cap 400

### Daily canon embed content and tier colour fallback

P2 · Policy · confiance High · `apps/bot/src/services/CanonService.ts:159-179, 332-372`

The daily embed shows the tier colour from the doctrine (falling back to a fixed colour per tier when the stored hex is invalid), the live verdict or stored verdict, the first author reference preferring its French text, and the authority score out of 100.

- Given: A selected entry, the doctrine tiers and the live verdict
- When: The embed is built
- Then: Colour = tier hex (6 hex digits, optional #) else default: CANON_ABSOLU 0x22c55e, CANON_SUPERVISE 0x84cc16, EXTENSION_OFFICIELLE 0xf59e0b, NON_CANON_DERIVE 0xf97316, APOCRYPHE_FANON 0xef4444; description = live verdict else entry verdict (cut 2000); explanation field cut 1024; first reference shown with its French text if present (cut 900); footer 'Autorite <score>/100'.
- Parameters: Default colours per tier; field caps 256/1024/2000/900

### Daily canon post: schedule, activation and once-per-day guard

P1 · Lifecycle · confiance High · `apps/bot/src/services/CanonService.ts:23-27, 262-300`

The Discord bot posts one canon topic a day to a configured channel, only when the feature is enabled, a channel exists, the UTC hour has reached the configured hour, and nothing was posted yet that UTC day.

- Given: The bot cron tick with setting canon.daily_enabled (default false), canon.daily_hour (default 18), canon.last_posted_day
- When: tick runs
- Then: Not enabled -> disabled; no client or channel not found/sendable -> no_channel; UTC hour < daily_hour -> not_yet; last_posted_day equals today's UTC date -> already_posted. runOnce (admin command) skips the enabled, hour and already-posted checks but still needs a channel.
- Parameters: canon.daily_enabled=false, canon.daily_hour=18 (UTC), canon.channel snowflake, canon.last_posted_day
- Edge cases: The hour comparison is only a lower bound, so a post can be made at any later UTC hour once enabled, depending on cron frequency ; A forced run still advances the rotation and sets last_posted_day, so it blocks the next scheduled post that day

### Canon of the day forced publish and failure semantics

P1 · Lifecycle · confiance High · `apps/bot/src/services/CanonService.ts:265-330; apps/bot/src/commands/wiki/Canon.ts:452-499; apps/bot/src/events/CanonWatch.ts:26-39; apps/bot/src/services/SettingsService.ts:1314-1353`

The admin 'publish now' command bypasses the enabled flag, the hour and the once-a-day guard, but still advances the rotation and stamps today as posted, which blocks the scheduled post for the rest of that UTC day. A failed send changes no state, so the cron retries every 15 minutes.

- Given: canon.daily_enabled is true, canon.daily_hour is 18, canon.last_posted_day is '2026-11-18'
- When: An admin runs /canon jour publier at 10:00 UTC on 2026-11-19, or the 15-minute cron ticks
- Then: The forced run posts entry index N, sets rotation_index to (N+1) mod entries and last_posted_day to '2026-11-19'. The 18:00 scheduled tick then returns 'already_posted'. If the channel is not configured or cannot send, the result is 'no_channel' regardless of force. If the doctrine fetch fails the result is 'fetch_failed', and with zero entries 'no_entry'. If Discord rejects the send the result is 'error' and neither the cursor nor the day is written, so the next tick tries the same entry. The scheduled path posts at any tick at or after the configured hour, while the forced path ignores the hour. The cron is registered once on clientReady every 15 min, and if registration throws it is only logged and no daily post ever runs.
- Parameters: cron interval 15 min; canon.daily_hour default 18 (0-23, UTC); canon.daily_enabled default false; rotation_index default 0; last_posted_day default ''
- Edge cases: Reordering the doctrine entries changes which topic the saved index points to ; The scheduled run requires a channel before checking the hour, so an unset channel returns 'no_channel' instead of 'not_yet' ; /canon jour with 'etat' or no action only reports the settings and publishes nothing

### Daily canon rotation cursor

P1 · Lifecycle · confiance High · `apps/bot/src/services/CanonService.ts:304-329`

The daily topic is chosen by a deterministic cursor over the doctrine entries; the cursor advances only after the message was actually sent.

- Given: canon.rotation_index (default 0) and the doctrine entries list from the live site
- When: A daily post is published
- Then: If the doctrine cannot be fetched -> fetch_failed; zero entries -> no_entry; index = rotation_index modulo entries length; the verdict for the entry title is asked from /api/canon; after a successful send, rotation_index = (index+1) mod length and last_posted_day = today UTC; if Discord rejects the send, neither is updated and the result is error.
- Parameters: rotation_index default 0; doctrine cache TTL 5 minutes (forced fresh for the daily post)
- Edge cases: The cursor tracks the index, not the entry id: reordering or adding entries in the admin editor shifts which topic is next and may repeat or skip topics ; If the verdict call fails the post still goes out using the entry's stored verdict text

## `apps/bot/src/services/EconomyService.ts` (1)

### Shop purchase guard and atomic debit

P1 · Validation · confiance Medium · `apps/bot/src/services/EconomyService.ts:380-426`

A shop item can only be bought if it exists, is enabled, is not already owned and the buyer's balance covers the (indexed) price; debit and hand-over happen in one transaction.

- Given: Item enabled, price 5,000, buyer balance 4,000
- When: The buyer attempts the purchase
- Then: Refused with 'Solde insuffisant (4 000 / 5 000 zénis)'. Missing or disabled item: 'Objet introuvable'. Already owned: 'Déjà possédé'. On success inventory row inserted, zeni decremented only where zeni >= price, a SHOP_PURCHASE ledger entry records price and basePrice; if the guarded debit affects no row the inventory insert is rolled back
- Parameters: transaction behaviour immediate; price = priceOf(item.price)
- Edge cases: Double click: unique inventory insert makes the second attempt return owned before any debit ; Price may change between the balance read and the transaction; the transaction debits the price computed before it

## `apps/bot/src/services/InflationService.ts` (4)

### Daily inflation snapshot lifecycle

P1 · Lifecycle · confiance Medium · `apps/bot/src/services/InflationService.ts:1-11,85-128`

Each UTC day one snapshot row is written; the reference supply is frozen at the first snapshot after inflation is enabled; while disabled the index stays at 1 but history keeps filling; an empty economy writes nothing.

- Given: economy.inflation.enabled false, then true; supply 5,000,000 at first enabled snapshot
- When: snapshot() runs
- Then: If supply <= 0 return null and write nothing. If enabled and reference_supply <= 0, reference_supply is stored as 5,000,000. Index = computeIndex(...) with previous = latest row whose day is not today (else 1); if disabled index = 1. Row is upserted by day (re-running the same day overwrites) and the price cache is cleared
- Parameters: economy.inflation.enabled default false; reference_supply default 0; elasticity 0.5; max_daily_change 0.02; ceiling 2.96
- Edge cases: Re-enabling after a disable does not reset an existing reference_supply ; If the DB is restored with zero supply no spurious point resets the index to 1.0 ; Reference supply is an integer setting; supply is rounded by getInt

### Effective shop price and price cache

P1 · Calculation · confiance Medium · `apps/bot/src/services/InflationService.ts:130-144; apps/bot/src/api/server.ts:1805-1825`

Shoppers pay the base price while inflation is off, otherwise the base price indexed with the latest stored index (cached 5 minutes).

- Given: Inflation enabled, latest index 1.037, item base price 5,000
- When: priceOf(5000) is called
- Then: 5,200 (indexedPrice); when disabled or index = 1 the base price 5,000 is returned unchanged. The index is cached for 5 minutes (cleared by snapshot); the public shop JSON is also cached 5 minutes
- Parameters: index cache 5 * 60,000 ms; public shop cache 5 * 60,000 ms; invalid stored index falls back to 1
- Edge cases: Display price (site) and debit price (bot) both come from priceOf, but the public shop payload may be up to 5 minutes stale

### Inflation snapshot lifecycle: disabled mode, frozen reference supply, frozen accounts excluded, one row per day

P1 · Lifecycle · confiance Medium · `apps/bot/src/services/InflationService.ts:64-144`

A daily snapshot always records the money supply, but the index only moves when inflation is enabled; the reference supply is frozen at the first snapshot after activation, frozen accounts do not count, and an empty economy writes nothing.

- Given: Setting economy.inflation.enabled is false and users hold 5,000,000 zeni in unfrozen accounts
- When: The daily snapshot runs
- Then: A row (day, supply 5,000,000, index 1, enabled 0) is upserted so the curve fills up, and prices stay at base. On the first snapshot after enabling, reference_supply is set to that day's supply, so the index measures drift from activation day, not from bot creation.
- Parameters: settings: economy.inflation.enabled (false), reference_supply (0), elasticity (0.5), max_daily_change (0.02), ceiling (2.96); index cache TTL 5 minutes; history window 60 rows; 7-day change uses history.at(-8) or the first row
- Edge cases: Supply sums only accounts where zeni_frozen is 0 (a frozen account once held 99.96% of supply and pushed the index +2% a day) ; Supply <= 0: snapshot skipped, no row, so a restored empty database cannot reset the index to 1.0 ; Rerunning the snapshot on the same day recomputes from the last row of a different day (idempotent upsert) ; While disabled, currentIndex returns 1 regardless of stored history ; Index cache is dropped on each snapshot but otherwise served for 5 minutes

### Money supply excludes frozen accounts

P1 · Calculation · confiance Medium · `apps/bot/src/services/InflationService.ts:64-74`

Only zeni in non-frozen accounts count as circulating money for inflation.

- Given: Users where one frozen account holds 999,999,948,999 zeni and other users hold the rest
- When: moneySupply() is computed
- Then: SUM(zeni) over users where COALESCE(zeni_frozen,0) = 0; the frozen balance is excluded so it cannot push the index toward its ceiling
- Parameters: none (frozen flag)
- Edge cases: NULL frozen flag counts as not frozen ; Unfreezing a large account would instantly add its balance to the supply, causing a jump limited only by the max daily change

## `apps/site/scripts/_shenron-corpus.ts` (1)

### Keyword extraction caps for citations and wiki lexicon filter

P1 · Calculation · confiance High · `apps/site/scripts/_shenron-corpus.ts:329-352; apps/site/scripts/canon-ingest.ts:92-123`

Each citation gets at most 8 own keywords (known wiki entity names first, then subject words longer than 3 characters outside stopwords), plus an English-French bridge up to a total of 12.

- Given: A citation subject, text and the lexicon of visible wiki entities
- When: motsCles runs
- Then: Lexicon = names of visible characters, planets, races and techniques (techniques need a Japanese name) of length >= 4, no digits, excluding the list king, north, west, east, south, great, grand, monde, terre, dieu, dieux, demon, time, name, kaio, namek, sorted longest first. Entity names found as whole words come first (max 8), then subject words (length > 3, not a stopword) until 8; bridge translations are appended until 12 total.
- Parameters: cap 8 own keys, cap 12 with bridge, min name length 4, 16 excluded generic names

## `apps/site/scripts/canon-align.ts` (4)

### Canon alignment script: what production takes from the repository

P1 · Policy · confiance High · `apps/site/scripts/canon-align.ts:38-123`

The alignment tool overwrites production tiers, doctrine rules and admitted/forbidden sources with the repository versions, replaces reviewed topic entries by id, keeps production-only topics, and sends only manual visible citations.

- Given: Production doctrine (via GET) and the repository default doctrine
- When: construireCorpsAlignement builds the PUT body
- Then: tiers, doctrine, sourcesAdmises and sourcesInterdites are copied whole from the repo; each prod entry is replaced by the repo entry with the same id (optionally restricted by --entrees), repo-only entries are appended, prod-only entries kept; references sent are only provenance 'manuel' with visible !== false, stripped of visible/updatedAt; rules, power scaling, fallback and welcome texts stay as in production. Default is dry run; --write required to save.
- Parameters: Reviewed entry ids: c16-fils-gero, daima, fillers-anime-garlic-paikuhan, gregory-kaio, piccolo-favori, broly-dbz-1993, goku-saiyan-kakarotto

### Doctrine alignment body construction

P1 · Policy · confiance Medium · `apps/site/scripts/canon-align.ts:43-84`

Aligning production with the repository doctrine replaces tiers, doctrine rules, admitted and forbidden sources and the chosen topic entries with the repository's, keeps production-only topics and keeps only visible manual citations.

- Given: Production CanonConfig and repository DEFAULT_CANON_CONFIG, optionally restricted by --entrees ids
- When: The alignment body is built
- Then: Production entries are replaced by repository entries of the same id (all, or only the restricted ids); repository entries missing from production are appended; production-only entries are kept. tiers, doctrine, sourcesAdmises, sourcesInterdites are copied wholesale; references = production manual citations with visible !== false, with visible and updatedAt stripped; the result goes through resolveCanonConfig. Reviewed ids: c16-fils-gero, daima, fillers-anime-garlic-paikuhan, gregory-kaio, piccolo-favori, broly-dbz-1993, goku-saiyan-kakarotto.
- Parameters: 7 reviewed entry ids; manual provenance string 'manuel'
- Edge cases: Hidden manual citations are dropped from the body ; Heuristics, power scaling, fallback and welcome texts stay production's

### Alignment acceptance checks and write guard

P1 · Validation · confiance Medium · `apps/site/scripts/canon-align.ts:86-154, 282-309`

Production doctrine is only written if the body passes the editorial checklist and the site already has the citation-preservation fix; a no-diff run writes nothing.

- Given: A built alignment body and the production GET response
- When: Run with --write
- Then: Checks must all pass: c16-fils-gero sources do not mention 'Super Exciting Guide'; daima verdict equals the repository's; sources of fillers-anime-garlic-paikuhan and gregory-kaio identical to the repository; piccolo-favori sources do not include toriyama-interviews.md; piccolo-favori, broly-dbz-1993, goku-saiyan-kakarotto toriyamaQuote.source starts with 'Paraphrase, pas une citation littérale — '; tiers/doctrine/sourcesAdmises/sourcesInterdites equal the repository's; a forbidden-sources item mentions Fandom without a condition word (sauf, hors, except, à condition, si) and no admitted source mentions Fandom. The fix is considered deployed if there are no ingested citations or at least one carries a string updatedAt. Otherwise exit 1 and write nothing. Zero diff lines = 'already aligned', no write. After PUT production is re-read and re-checked.
- Parameters: paraphrase prefix 'Paraphrase, pas une citation littérale — '; diff text truncation 160 chars; exit codes 0/1/2
- Edge cases: Missing admin token exits 2 (credential read from environment, never printed) ; Default mode is a dry run

### Alignment verification points and write refusal

P1 · Validation · confiance High · `apps/site/scripts/canon-align.ts:91-173, 266-309`

Before saving, the body must satisfy editorial review checks (no Super Exciting Guide on C16, paraphrase prefix on three author quotes, Fandom forbidden without exception, etc.), and writing is refused against a site lacking the citation-preserving save fix.

- Given: A built alignment body and the production snapshot
- When: The script runs in dry-run or --write mode
- Then: Checks: c16-fils-gero sources contain no 'super exciting guide'; daima verdict equals the repository verdict; fillers-anime-garlic-paikuhan and gregory-kaio sources equal the repository's; piccolo-favori sources exclude 'toriyama-interviews.md'; toriyamaQuote.source of piccolo-favori, broly-dbz-1993 and goku-saiyan-kakarotto starts with 'Paraphrase, pas une citation litterale - '; tiers, doctrine, admitted and forbidden sources identical to the repo; a forbidden-source line mentions Fandom with no exception wording (sauf, hors, except, a condition, si) and no admitted source mentions Fandom. If any check fails nothing is saved (exit 1). Writing also requires that ingested citations carry updatedAt in the GET (otherwise exit 1) and a non-empty diff; after the PUT production is re-read and re-verified.
- Parameters: Paraphrase prefix text; exit codes 0/1/2

## `apps/site/scripts/canon-ingest.ts` (16)

### Plate text cleaning and clean truncation

P1 · Calculation · confiance High · `apps/site/scripts/canon-ingest.ts:125-149`

Plate text has markdown headings stripped, bullets turned into middle dots, repeated blank lines collapsed and is capped at 1200 characters; long author statements are cut at a sentence end when one lies past the half-way mark.

- Given: Raw plate text with '## Title', '- item' lines and blank-line runs, or a statement longer than the cap
- When: A plate or shenron statement is converted into a citation
- Then: Plates: leading #{1,6} removed, '- ' or '* ' becomes '· ', trailing whitespace trimmed, consecutive blank lines collapsed to one, sliced to 1200 chars then trimmed. Statements (cap 1800): if text <= cap keep; else cut at cap and, if the last '. ', '! ' or '? ' lies beyond 50% of cap, end after that punctuation + ' …', otherwise trimEnd + ' …'.
- Parameters: plate cap 1200; statement cap 1800; sentence-boundary threshold 0.5 x cap
- Edge cases: Sentence terminators without a following space (end-of-text '.') are not considered as cut points ; Plate slice(0,1200) is a hard cut with no ellipsis

### Shenron statement corpus ingestion filters and de-duplication

P1 · Validation · confiance High · `apps/site/scripts/canon-ingest.ts:125-234`

Author statements are taken from local corpus documents (never fan-wiki mirrors), capped in length, required to mention a known wiki entity or title word, de-duplicated by text prefix, and given a stable suffixed id.

- Given: Markdown documents of the local .shenron memory corpus
- When: collecteShenron runs
- Then: Skip any file whose name matches REFUSE (fan-wiki mirror guard); text cut to 1800 chars at a sentence end if that falls after 50 percent of the cut, else with ellipsis; skip extracts with zero keywords; skip extracts whose first 120 normalised characters were already seen; year = extract year else document year; source string capped 300, subject 300; duplicate subject ids get -2, -3 suffixes; a reviewed French translation is attached only if its length is at least 60 percent of the original text length.
- Parameters: text cap 1800; sentence-boundary threshold 0.5; dedupe prefix 120 chars; translation ratio 0.6; subject/source cap 300
- Edge cases: Missing corpus directory returns an empty list, which makes every shenron citation 'vanished' and hides them on the next pass ; Duplicate-id suffixes depend on collection order, so reordering documents can reassign ids

### Content hash and translation preservation on upsert

P1 · Calculation · confiance High · `apps/site/scripts/canon-ingest.ts:151-165, 541-557`

A SHA-1 over subject, text, French text, source, year, href and keywords decides whether a citation changed; a hand-set translation survives only while the source text is unchanged.

- Given: A citation with an existing row
- When: It is upserted
- Then: hash = sha1 of [subject,text,textFr,source,year,href,keywords joined by '|'] joined with spaces. On conflict text_fr = incoming textFr if present, else the existing text_fr only when the stored text equals the incoming text, otherwise null; visible is never written on conflict.
- Parameters: hash algorithm SHA-1 hex
- Edge cases: document and lang changes are not part of the hash, so a change to only those fields is not detected as modified ; Field boundaries are a single space, so concatenation collisions are theoretically possible

### Author statement ingestion from local corpus

P1 · Validation · confiance Medium · `apps/site/scripts/canon-ingest.ts:169-233`

Toriyama statements from the local .shenron corpus are ingested only from files not matching the fan-wiki refusal guard, deduplicated on their first 120 normalized characters, and only if they yield keywords.

- Given: Markdown documents in the corpus memory directory matched by DOCUMENTS patterns
- When: The 'shenron' pass runs
- Then: A file whose name matches REFUSÉ is skipped. Each extract is truncated to 1800 chars, requires >=1 keyword, and is dropped if its first 120 normalized chars were already seen. Source label: doc.source if no precision; the precision alone if it starts with the first word of doc.source; else 'doc.source — precision' (max 300 chars). Subject max 300 chars; year = extract year else document year. Id = slug of subject (fallback reference-N); second and later duplicates get suffix -2, -3. If the corpus directory is absent the source is skipped with a warning and returns zero citations.
- Parameters: statement cap 1800; dedupe fingerprint 120 normalized chars; source cap 300; subject cap 300; REFUSÉ pattern defined in scripts/_shenron-corpus (not read)
- Edge cases: Corpus not found returns [] which then causes all previously ingested shenron citations to be marked disappeared (hidden) by the plan ; Fingerprint dedupe keeps the first occurrence in document order, not the best

### Reviewed French translation reattachment

P1 · Validation · confiance High · `apps/site/scripts/canon-ingest.ts:220-231`

A versioned French translation is attached to an ingested citation by id (else by the first 120 normalized chars of the source text), but only if it is at least 60% as long as the source text.

- Given: inventaires/canon-citations-fr.json entries {id,text,textFr}
- When: Shenron citations are collected
- Then: textFr = translation by id, else by text fingerprint; accepted only if length(textFr)/max(length(text),1) >= 0.6, otherwise no translation is attached.
- Parameters: minimum length ratio 0.6; fingerprint 120 chars
- Edge cases: Missing or invalid JSON file silently yields no translations ; A legitimately concise French rendering under 60% of the source length is rejected

### Databook plate ingestion eligibility

P1 · Validation · confiance Medium · `apps/site/scripts/canon-ingest.ts:235-274`

Only plates of visible databooks whose French translation is at least 120 characters, has a numeric plate number, carries no certain translation defect and yields at least one keyword become canon citations.

- Given: A databook plate row from bot.db_databooks (visible databook, pages[] jsonb)
- When: The 'databooks' ingestion pass runs
- Then: The plate is kept only if text_fr is non-empty AND length(text_fr) >= 120 AND number is finite AND defautCertain(text_fr, text) is null AND motsCles(subject, cleaned translation, lexicon) is non-empty. Id is planche-{databookId}-{number}; subject '{title} — planche {n}'; keywords are drawn from the FRENCH translation; lang is 'ja' if a source transcription exists else 'fr'; text is the source transcription (else the translation); textFr is set only when a transcription exists; source gets suffix ' (transcription relue)' when verifiee is true; href /wiki/databooks/{id}#planche-{n}.
- Parameters: min translation length 120 chars; plate text cap 1200 chars (see cleaning rule); provenance 'databooks'
- Edge cases: A plate with text_fr of 119 chars is never ingested ; A plate with an unreinjected masking token (zeta/yuni + 3 digits absent from the source) or a translation identical to Japanese source is excluded and stays hidden even if a writer re-deposits it ; A plate with no keyword match against the wiki lexicon is silently skipped ; verifiee defaults to false when absent

### Databook plate admission to the evidence corpus

P1 · Validation · confiance Medium · `apps/site/scripts/canon-ingest.ts:235-274; apps/site/src/lib/databooks-audit-traductions.ts:152-163, 299-327`

A databook plate becomes canon evidence only if its databook is visible, it has a French translation of at least 120 characters, the translation has no certain defect, and at least one keyword matches the wiki lexicon.

- Given: A plate in bot.db_databooks.pages with text_fr
- When: collecteDatabooks builds references
- Then: Skip unless d.visible and text_fr non-empty and length >= 120; skip if the plate number is not finite; skip if defautCertain() (an unreinjected masking token, or a French text identical to a Japanese/Asian source); skip if motsCles returns zero keys. Otherwise id = planche-<databookId>-<number>, source suffixed ' (transcription relue)' when verifiee is true, lang 'ja' when an original text exists else 'fr', text truncated to 1200 chars. A plate that later becomes defective is hidden by the vanished-citation rule.
- Parameters: min translation length 120; plate text cap 1200; keyword extraction runs on the translation
- Edge cases: A French-to-French copy with OCR noise is only a certain defect if the source is Asian; otherwise it is a weighted signal and still admitted by this gate ; Plates with no keyword match are dropped even if long

### Manga volume and chapter evidence generation with year estimation

P1 · Calculation · confiance Medium · `apps/site/scripts/canon-ingest.ts:276-421`

Every visible manga volume (DB original 42 plus DBS) and every titled chapter of the DBFC and DBS series becomes a citation with fixed navigation keywords and curated landmark keywords; missing publication years are estimated by formula.

- Given: Visible rows of bot.db_manga_volumes and bot.db_manga_chapters (chapters need a non-empty title and series DBFC or DBS)
- When: collecteManga runs
- Then: Volume keys: 'tome N', 'volume N', 'vol N', 'vol. N' plus series label. Chapter keys: 'chapitre N', 'ch N', 'ch. N', 'chapitre N manga' plus landmark keys for hard-coded chapters (e.g. DB 1, 195, 317, 450, 519; DBS 6, 19, 42, 66, 87, 88, 103). Year: from published_at when present; otherwise DB chapters <= 194 give 1984 + floor(n/40), DB chapters > 194 give 1989 + floor((n-195)/50), DBS gives 2015 + floor(n/12). Example: DB chapter 195 without date gives 1989; DBS chapter 103 gives 2023.
- Parameters: 23 DB landmark chapters, 8 DBS landmark chapters; year formulas 40-chapter, 50-chapter and 12-chapter steps
- Edge cases: Volume year has no estimate fallback, so a volume without published_at has no year ; Provenance is 'manga' and the ref API filter whitelists it, but the manga provenance does not appear in the original doc header list of sources

### Manga volume and chapter citation generation

P1 · Calculation · confiance Medium · `apps/site/scripts/canon-ingest.ts:276-426`

Each visible manga volume and each titled chapter becomes a citation with generated lookup keywords, series naming, and a year taken from publication date or estimated from the chapter number.

- Given: Visible rows of bot.db_manga_volumes and bot.db_manga_chapters (chapters only series DBFC or DBS with non-empty title)
- When: The 'manga' pass runs
- Then: Series 'DB' -> 'Dragon Ball', anything else -> 'Dragon Ball Super'. Volume keywords: 'tome N','volume N','vol N','vol. N', 'manga dragon ball[ super]' plus lexicon keywords from the title. Chapter keywords: 'chapitre N','ch N','ch. N','chapitre N manga', series keyword, hard-coded landmark keywords (REPERES_CANON for DB chapters 1,195,...,519; REPERES_DBS for DBS chapters 6,7,19,42,66,87,88,103) and title keywords. Year: from published_at (epoch seconds) when present; otherwise for DB chapters <=194: 1984 + floor(n/40), for DB >=195: 1989 + floor((n-195)/50); for DBS: 2015 + floor(n/12). Id manga-vol-{series}-{n} / manga-chap-{db|dbs}-{n}. Language 'ja' if title_ja exists else 'fr'. Text is the Japanese title else the French title else the subject.
- Parameters: year estimation constants 1984, 40, 1989, 50, 2015, 12; landmark keyword tables hard-coded (e.g. chapter 195 raditz/scouter; 317 super saiyan; 519 uub/fin du manga original)
- Edge cases: Volume title fallback chain: title, title_ja, 'Tome N' ; Chapters with empty title are excluded entirely ; published_at of 0/null triggers the estimate

### Citation lifecycle on ingestion: new, changed, unchanged, restored, editorial removal respected, vanished

P1 · Lifecycle · confiance Medium · `apps/site/scripts/canon-ingest.ts:425-511`

Each ingestion pass classifies every evidence citation: new rows are inserted visible, changed rows are rewritten without touching visibility, a row hidden by the pipeline comes back when it reappears at its source, a row hidden by an editor stays hidden, and a visible row that vanished from its source is hidden (never deleted).

- Given: Existing canon_references rows for one provenance, plus the freshly collected references with content hashes
- When: planifierIngestion runs for a pass
- Then: id absent from the table -> nouvelles (insert visible=true); same id with different hash -> modifiees; same hash -> inchangees; row not visible and last wiki_revisions visibility entry is NOT 'visible=false' -> aRetablir (set visible=true); row not visible and last revision says visible=false -> retraitsRespectes (stays hidden); visible row whose id is absent from the new collection -> disparues (set visible=false). Duplicate ids in one collection are processed once. Example: manga-chap-db-195 hidden by an admin edit and still in the source stays hidden; planche-12-3 deleted from the databook JSON is hidden on the next pass.
- Parameters: Editorial-removal test = latest wiki_revisions row (tableName='canon_references', rowId=id, after has 'visible') with after.visible=false; default false if no revision
- Edge cases: A row hidden with no revision history (e.g. direct DB edit) is treated as pipeline-hidden and gets restored ; Restoration re-checks the editorial guard inside the UPDATE, so an editor removal between read and write is not undone ; A row whose source also disappears AND was editor-hidden is not in disparues (already invisible) ; Hiding only applies per provenance: ecrire loads existing rows filtered by provenance

### Ingestion visibility lifecycle plan

P1 · Lifecycle · confiance Medium · `apps/site/scripts/canon-ingest.ts:430-510, 541-575`

Each ingestion pass inserts new citations as visible, rewrites changed ones without touching visibility, hides ones that vanished from the source, restores only ones the pass itself hid, and never undoes an editor's removal.

- Given: Existing canon_references rows for a provenance (id, hash, visible, latest wiki_revisions visibility entry) and freshly collected refs
- When: ecrire() plans and applies a pass
- Then: Not in table -> inserted visible=true. In table with different hash -> rewritten (visible untouched); same hash -> unchanged (seen_at refreshed). Hidden and last visibility revision is not an explicit hide -> restored to visible (guard re-evaluated inside the UPDATE so a concurrent editor hide is not undone). Hidden with editorial removal -> left hidden ('kept'). Visible in table but absent from source -> set visible=false. Duplicate ids within one batch are counted once.
- Parameters: statuses: inserted, updated, unchanged, hidden, restored, kept
- Edge cases: Absent from source never deletes a row ; Editorial retrait = latest wiki_revisions row for the citation with an 'after.visible' key, equal to false ; Simulation mode returns the plan counts without any write ; A source collection that returns nothing (e.g. missing corpus) hides every previously visible citation of that provenance

### Ingestion pass scheduling and run audit

P2 · Policy · confiance High · `apps/site/scripts/canon-ingest.ts:44-53, 614-670`

The corpus is re-ingested every 15 minutes by default, never more often than every 60 seconds, each source pass leaving an audit row and a failure in one source not stopping the others.

- Given: The --boucle flag with an optional --intervalle
- When: The service loop runs
- Then: Interval = max(60, Number(--intervalle) or 900) seconds. Sources in order shenron, databooks, manga (or one via --source). Each pass records start/finish, inserted, updated, unchanged, hidden counts or a truncated (2000 chars) error in canon_ingest_runs; then any legacy blob citations are migrated.
- Parameters: default interval 900 s; floor 60 s; error text cap 2000
- Edge cases: Non-numeric --intervalle falls back to 900 ; --source value is cast without validation: an unknown source runs collecteManga

### Ingestion run journal and pass cadence

P2 · Policy · confiance High · `apps/site/scripts/canon-ingest.ts:52, 614-671; apps/site/src/db/migrations/0014_canon_tables.sql:44-56`

Each source (shenron, databooks, manga) is ingested in sequence per pass and logged in canon_ingest_runs with counters or an error; the service loop repeats every 900 seconds with a floor of 60.

- Given: The ingestion service running in loop mode
- When: A pass starts
- Then: A run row is opened per source, finished_at set on completion with inserted/updated/unchanged/hidden counts, or error (cut at 2000 chars) on failure without stopping other sources; interval = max(60, configured or 900) seconds; after sources, legacy blob citations that are not 'manuel' are removed from the CanonConfig blob and their translations copied to rows whose text_fr is empty.
- Parameters: default interval 900 s, minimum 60 s, error cap 2000 chars
- Edge cases: A failed source pass leaves existing citations untouched (no hiding) ; The blob migration runs after every pass and is a no-op when no non-manual refs remain

### Ingestion upsert preserves visibility and hand-made translations unless source text changes

P1 · Lifecycle · confiance Medium · `apps/site/scripts/canon-ingest.ts:540-575`

Rewriting a changed citation never overwrites its visible flag, and a French translation already on the row survives only while the source text is unchanged.

- Given: A citation row already in canon_references with a manual or versioned text_fr
- When: The ingestion upserts a new or modified citation
- Then: visible is written only on insert (true); on conflict text_fr = incoming text_fr if present, otherwise kept only when stored text equals incoming text, else NULL; seen_at and updated_at are set to now; unchanged rows only get seen_at refreshed; hash is stored.
- Parameters: Hash = SHA-1 of subject, text, textFr, source, year, href, keywords joined; separator is a space
- Edge cases: Hash joins fields with a plain space, so field boundaries are ambiguous (two different tuples can collide in theory) ; Hash excludes document and lang, so a change only in those fields counts as unchanged and is never written

### Legacy blob citation migration

P1 · Lifecycle · confiance High · `apps/site/scripts/canon-ingest.ts:577-612`

Non-manual citations still stored inside the doctrine document are removed from it, and their hand-made French translations are carried to the table row.

- Given: CanonConfig 'default' row whose references contain provenance other than 'manuel'
- When: A pass ends (not in simulation)
- Then: For each legacy citation with textFr, set canon_references.text_fr only where it is currently null; then rewrite the document's references to only the manual ones, stamped updatedBy 'canon-ingest'.
- Parameters: updatedBy label 'canon-ingest'
- Edge cases: Existing non-null text_fr in the table wins over the blob ; Manual citations are never touched

### Wiki lexicon for keyword extraction

P1 · Validation · confiance High · `apps/site/scripts/canon-ingest.ts:91-123`

Keywords for citations are matched against names of visible wiki characters, planets, races and Japanese-named techniques, excluding short, numeric and generic names.

- Given: Visible rows in db_characters, db_planets, db_races, and db_techniques (technique needs name_ja)
- When: The ingestion builds its matching lexicon
- Then: Keep distinct trimmed names with length >= 4, containing no digit, whose normalized form is not in the exclusion set {king, north, west, east, south, great, grand, monde, terre, dieu, dieux, demon, time, name, kaio, namek}; sorted by decreasing length.
- Parameters: min name length 4; exclusion list of 16 generic words
- Edge cases: Names with digits (e.g. 'C17') are never keywords ; 'kaio' and 'namek' are excluded even though they are core Dragon Ball terms

## `apps/site/src/app/admin/canon/CanonEditor.tsx` (6)

### Power-scaling editor inputs fall back to hardcoded values on empty or zero

P1 · Validation · confiance Medium · `apps/site/src/app/admin/canon/CanonEditor.tsx:1187-1216, 1280-1290; apps/site/src/lib/canon-engine.ts:2909-2930`

Clearing the Kiri-to-BP rate or the planet-destruction floor in the editor silently resets it to 50,000 or 200, whereas clearing a transformation multiplier sets it to 0.

- Given: An admin empties or types 0 in the power-scaling fields
- When: The change handler runs
- Then: kiriToBpRate becomes 50000 and planetDestructionKiriFloor becomes 200 on empty or 0. A multiplier field becomes 0 on empty or non-numeric input. On the server only kiriToBpRate and the floor are validated (finite and > 0, else default). The multipliers, officialBps and tiers arrays are accepted as any array with no per-item checks, so a 0 multiplier is stored.
- Parameters: kiriToBpRate 50000; planetDestructionKiriFloor 200; multiplier fallback 0

### Admin canon editor input normalisation and new-topic defaults

P1 · Validation · confiance Medium · `apps/site/src/app/admin/canon/CanonEditor.tsx:216-232,377-393`

Keywords typed as a comma list are trimmed, de-duplicated and stripped of empties; a new topic starts as absolute canon with score 100 and a blank id.

- Given: Keyword field text ' broly, paragus, broly ,, '
- When: The field changes
- Then: keywords = ['broly','paragus']. Adding a topic prepends { id:'', title:'', category:'lore', tier:'CANON_ABSOLU', score:100, keywords:[], verdict:'', explanation:'', sources:[] }
- Parameters: default tier CANON_ABSOLU; default score 100; default category lore
- Edge cases: Editor does not itself block saving a blank id or empty verdict; rejection must come from the server sanitiser (canon-engine.ts) ; De-duplication is case-sensitive ('Broly' and 'broly' both kept)

### Admin canon editor baseline lifecycle (loaded, dirty, conflict, saved)

P1 · Lifecycle · confiance Medium · `apps/site/src/app/admin/canon/CanonEditor.tsx:266-352, 354-371, 476-476`

The editor only lets an admin save while it holds a current version token and has unsaved edits. If the server copy changes while edits are pending, or the server answers 409/428, the token is dropped and saving is blocked until the admin reloads the saved version.

- Given: An admin editing the canon doctrine, with baseline token 'expected' loaded from the server
- When: A. The server snapshot changes while the form is dirty. B. A save returns HTTP 409 or 428. C. A save succeeds. D. The admin clicks reload.
- Then: A and B set expected to null and show the conflict message, and save is disabled (button needs expected and modifie and not busy). With no baseline, an explicit save attempt shows 'baselineMissing' without any request. C stores the returned config and new token and clears the dirty flag. D reloads the config and token with no-store, and a failed reload also nulls the token. If the server snapshot changes while the form is clean, the editor silently adopts the new copy. Closing the tab while dirty triggers a browser beforeunload warning.
- Parameters: HTTP 409 = conflict, 428 = baseline required
- Edge cases: After a conflict the admin's unsaved edits stay on screen but cannot be saved until reloaded, so they are lost on reload ; A network error keeps the token and the dirty state, so the save can be retried

### Admin canon editor save gating and conflict handling

P1 · Validation · confiance Medium · `apps/site/src/app/admin/canon/CanonEditor.tsx:266-371,473-477`

The doctrine can only be saved from a loaded snapshot with pending edits; a conflict clears the baseline so the editor must reload before saving again.

- Given: Editor loaded with version token expected = V1 and local edits
- When: Save is clicked
- Then: Save button is disabled when saving, reloading, no baseline token, or no modification; with no baseline a 'baselineMissing' message is shown and no request is sent; PUT /api/canon-config sends {config, expected}; on 409 or 428 the baseline is cleared (must reload) and a conflict message (409) or generic failure is shown; on success config and token are replaced and the dirty flag cleared. If a newer server version arrives while edits are pending the baseline is cleared and a conflict message is shown instead of overwriting local edits
- Parameters: status codes 409 (conflict), 428 (precondition required)
- Edge cases: Reloading clears the dirty flag and discards edits ; Reset to repository defaults only marks the editor dirty, nothing is saved until Save ; A beforeunload warning is registered while edits are unsaved ; If the reload response lacks config or a string expected token, the baseline is cleared

### Editor behaviour diverges from engine: heuristic order text, prepend vs append, numeric coercion

P1 · Policy · confiance High · `apps/site/src/app/admin/canon/CanonEditor.tsx:377-391, 854, 860-870, 1196, 1214; apps/site/src/lib/canon-engine.ts:2549-2618`

The admin editor tells editors that the first matching heuristic wins, but the engine picks the best (longest) match; new topics are inserted at the top of the table and new heuristics at the bottom, and empty numeric fields silently revert to defaults.

- Given: An editor adds a topic and a heuristic
- When: The document is saved and a tie occurs on match score
- Then: The new topic is first in table order so it wins ties; the new heuristic is last so it loses ties; the heuristic text 'La premiere qui s'apparie gagne' is wrong, because the engine sums matched keyword lengths and only ties go to the first. New topic defaults: CANON_ABSOLU, score 100; new heuristic: EXTENSION_OFFICIELLE, score 50 (tier default 70). Kiri rate empty or 0 becomes 50,000 and the floor becomes 200.
- Parameters: editor defaults: entry tier CANON_ABSOLU score 100; heuristic tier EXTENSION_OFFICIELLE score 50; kiri 50,000; floor 200

### New topic entry draft is dropped on save until it has a title and keywords

P1 · Validation · confiance Medium · `apps/site/src/app/admin/canon/CanonEditor.tsx:377-393; apps/site/src/lib/canon-engine.ts:2781-2813, 2941-2942`

A blank topic added in the editor starts as absolute canon with score 100, but the server discards any entry without a title or at least one keyword, so an unfinished draft disappears after saving.

- Given: An admin clicks 'add entry' and saves without filling title or keywords
- When: The PUT is normalised by resolveCanonConfig
- Then: The editor seeds the entry as tier CANON_ABSOLU, category 'lore', score 100, empty keywords. The server skips entries with an empty title or no keywords, and returns the document without it. When an entry is kept but its tier is invalid it silently becomes EXTENSION_OFFICIELLE, and a missing score takes the tier default (otherwise 50). A duplicate id gets a '-2' suffix appended (a, a-2, a-2-2). An explicitly empty entries array is respected as 'delete all', while a missing array restores the shipped table.
- Parameters: editor defaults tier CANON_ABSOLU / score 100; server defaults tier EXTENSION_OFFICIELLE / score from tier or 50; MAX_ENTREES 2000; keywords max 40 x 80 chars

## `apps/site/src/app/api/admin/ai/route.ts` (1)

### Admin IA actions: save_canon, required inputs and unknown action

P1 · Validation · confiance High · `apps/site/src/app/api/admin/ai/route.ts:85-116,152-158,174-249`

The cockpit POST dispatches on an action name; each action rejects missing mandatory input with 400 and unknown actions are rejected; save_canon requires a config object and forwards the optimistic-concurrency token.

- Given: POST /api/admin/ai with an action
- When: test_prompt has blank query; ocr_probe has blank image; add_gold_case lacks a question or any expected keyword; update_feedback has a non-positive-integer id or bad status; save_canon config is missing/array; send_lab_message is blank; create_goal lacks title; complete_goal id not a positive safe integer; action is unrecognised
- Then: 400 with a specific message and no side effect; save_canon passes body.expected to saveCanonConfig and revalidates /wiki/canon and /admin/ai; create_goal defaults description to the title; complete_goal defaults notes to 'Complété via Cockpit Admin IA'
- Parameters: positive id = safe integer > 0; ocr language default 'ja'
- Edge cases: Gold-case expected keywords are trimmed and empties dropped before the emptiness check ; test_prompt canon analysis failure yields canon:null instead of failing the probe ; canonPreuves errors are swallowed to null

## `apps/site/src/app/api/canon-config/route.ts` (4)

### Admin canon-config write gate and body limits

P1 · Validation · confiance Medium · `apps/site/src/app/api/canon-config/route.ts:19-75`

Reading or writing the doctrine requires an admin user or admin token; writes reject oversized bodies, non-object bodies and missing config, attribute the edit to the editor id, then purge the public canon page.

- Given: A PUT /api/canon-config request
- When: The caller is not admin/token, body is over 16 MiB by content-length, is not a JSON object, or lacks an object 'config'
- Then: 403 for non-admin; 400 for oversize, invalid JSON, non-object (array, string, number) or missing config; otherwise saveCanonConfig(config, editorId = discordId or user id or 'token-admin', expected) and the /wiki/canon page cache is revalidated; typed write errors return their own status, other failures 503.
- Parameters: max body 16 MiB (16*1024*1024); fallback editor id 'token-admin'
- Edge cases: The size check trusts the content-length header; a missing header is treated as 0 ; Token callers are all recorded under the same generic editor id

### Canon config PUT: size ceiling and body shape validation

P1 · Validation · confiance Medium · `apps/site/src/app/api/canon-config/route.ts:22-61`

A doctrine save is refused before parsing if the declared body exceeds 16 MiB, and the body must be a JSON object holding a config object; arrays, scalars and malformed JSON are 400s so a bad PUT cannot overwrite the edited doctrine with defaults.

- Given: A PUT /api/canon-config by an authorised caller
- When: content-length > 16,777,216, body is not JSON, body is an array/string/number, or body.config is missing/non-object/array
- Then: Respond 400 (Document trop volumineux / JSON body requis / doctrine must be a JSON object / Configuration document required) and nothing is saved
- Parameters: MAX_CORPS=16*1024*1024 bytes
- Edge cases: Size is checked only against the content-length header; a chunked body without the header skips the check ; NaN content-length is ignored

### Canon config access: admin session or API token; audit identity fallback chain

P1 · Policy · confiance Medium · `apps/site/src/app/api/canon-config/route.ts:25-27,38-41,62-66; apps/site/src/lib/admin-guard.ts:31-52`

Reading the canon config requires an admin session (staff Discord or roleAdmin) or a valid bearer token; writing requires the user's roleAdmin to be true or a valid bearer token, and the editor identity recorded is Discord id, else user id, else 'token-admin'.

- Given: A request to /api/canon-config
- When: Caller has no admin session and no valid token
- Then: 403 Forbidden; on a successful write the audit identity is me.discordId, else me.user.id, else the literal 'token-admin'
- Parameters: audit fallback 'token-admin'
- Edge cases: GET uses isCurrentUserAdmin (includes staff Discord) while PUT requires user.roleAdmin===true: a staff member who passes GET can be refused on PUT ; A valid token overrides a missing session ; All token callers share the same audit name

### Canon config save also purges the cached wiki page; read failures return 503

P1 · Lifecycle · confiance High · `apps/site/src/app/api/canon-config/route.ts:25-36,67-74`

After a successful doctrine save /wiki/canon is revalidated; typed write errors keep their own HTTP status; any other failure is a 503.

- Given: A successful saveCanonConfig
- When: PUT completes
- Then: revalidatePath('/wiki/canon') runs and { ok:true, ...saved } is returned; a CanonConfigWriteError returns its own status and message; other errors return 503 'Canon configuration unavailable'
- Parameters: revalidated path /wiki/canon (admin AI route also /admin/ai)
- Edge cases: GET failure also 503, not 500

## `apps/site/src/app/api/canon/references/route.ts` (1)

### Canon references API filter, visibility and paging

P1 · Validation · confiance Medium · `apps/site/src/app/api/canon/references/route.ts:27-98`

The public references endpoint lists only visible citations, filtered by a whitelisted provenance and an optional text search, with bounded paging.

- Given: GET /api/canon/references with q, provenance, limit, offset
- When: The request is handled
- Then: Only rows with visible=true; provenance filter applies only if in {shenron, databooks, manuel, manga}, else ignored and echoed as null; q trimmed to 200 chars and matched case-insensitively against subject, text, French text and keywords; limit clamped to 1-100 (default 20, non-numeric gives 20); offset min 0; ordering: translated rows first, then year descending (nulls last), then id; total is counted separately from the page.
- Parameters: limit 1..100 default 20; q cap 200; cache s-maxage 300 s

## `apps/site/src/app/api/canon/route.ts` (6)

### Canon API continuity filter is a closed whitelist

P1 · Validation · confiance High · `apps/site/src/app/api/canon/route.ts:107-112`

Only six continuity values are honoured; any other value is silently ignored.

- Given: A canon question with a continuity query parameter
- When: continuity is original_manga, super, anime, gt, daima or unspecified
- Then: It is passed to the evidence search; for any other value (e.g. 'gtt') it is dropped (undefined) and the search is unfiltered, with no error
- Parameters: continuities=[original_manga, super, anime, gt, daima, unspecified]
- Edge cases: Case-sensitive match: 'GT' is dropped ; Value is cast to the type only after includes() check

### Canon verdict question counter (memory of the arbiter)

P1 · Lifecycle · confiance High · `apps/site/src/app/api/canon/route.ts:19-21, 45-61, 117`

Each canon question asked through the public API is recorded once per normalised question with a counter, its latest tier, score and origin; counting never blocks the answer.

- Given: A GET /api/canon with a non-empty q
- When: The verdict is computed
- Then: id = slug of the question truncated to 80 chars (fallback 'question'); question text stored cut at 400; insert asked_count=1, or on conflict asked_count + 1 with tier, score, origine overwritten by the latest verdict and last_asked_at = now; failure is logged and ignored (fire and forget).
- Parameters: question cap 400, id cap 80
- Edge cases: Different questions with the same slug share a counter ; Troll and empty-nature questions are still counted ; Questions are counted even when the response is served from CDN cache only if the origin is hit (s-maxage 300 s)

### Canon API question input bounding and empty-question mode switch

P1 · Validation · confiance High · `apps/site/src/app/api/canon/route.ts:45-105`

The public canon API trims the question, caps it at 400 characters, and treats an empty question as a request for the doctrine overview instead of a verdict.

- Given: A GET /api/canon request
- When: q is absent, blank, or longer than 400 characters
- Then: Blank q returns the doctrine overview (intro, tiers, entries, heuristics, reference counts by provenance) and no verdict is computed or counted; a q of 450 chars is truncated to the first 400 before analysis
- Parameters: QUESTION_MAX=400
- Edge cases: Truncation is silent, no error is returned ; Whitespace-only q counts as empty ; The home form enforces minLength 2 client-side but the API has no minimum

### Every asked canon question is counted, deduplicated by slug, and failure never blocks the answer

P1 · Lifecycle · confiance High · `apps/site/src/app/api/canon/route.ts:47-61,117`

Each verdict question is recorded in canon_verdicts keyed by its slug (first 80 chars); repeats increment a counter and refresh tier, score and origin, and a DB failure is swallowed.

- Given: A non-empty question 'Is Broly canon?' answered with tier T, score S
- When: The same slug is asked again
- Then: asked_count increments by 1, tier/score/origine/last_asked_at are overwritten with the latest verdict; the counter write is fire-and-forget and never fails the response
- Parameters: slug length 80; stored question length 400; fallback id 'question'
- Edge cases: Different phrasings that slugify identically merge into one row ; Empty slug falls back to id 'question' ; Troll/refused questions are counted too since counting is unconditional

### Public canon API input handling and evidence assessment mode

P1 · Validation · confiance High · `apps/site/src/app/api/canon/route.ts:63-116`

The public canon endpoint trims and truncates the question to 400 chars, accepts only six known continuities, and opts into the AI evidence decision only with assessEvidence=1, which disables caching.

- Given: A GET /api/canon request
- When: q is empty, or continuity or assessEvidence are present
- Then: Empty q returns the doctrine overview (tiers, doctrine, sources, entries, heuristics, reference counts by provenance); continuity must be one of original_manga, super, anime, gt, daima, unspecified else ignored (undefined); assessEvidence must equal '1' to call the evidence decision, and then Cache-Control is no-store; otherwise public s-maxage=300 with stale-while-revalidate=3600.
- Parameters: QUESTION_MAX 400; continuities list of 6; CDN cache 300 s + 3600 s SWR

### Canon API evidence assessment is opt-in and defeats caching

P1 · Policy · confiance High · `apps/site/src/app/api/canon/route.ts:64-71,114-116`

The AI evidence assessment only runs when assessEvidence is exactly 1, and such responses are never cached, while normal verdicts are publicly cached.

- Given: A GET /api/canon?q=... request
- When: assessEvidence=1 versus any other value
- Then: With '1': canonEvidenceDecision is called and Cache-Control is no-store; otherwise no AI call and Cache-Control is 'public, s-maxage=300, stale-while-revalidate=3600'
- Parameters: s-maxage=300 s; stale-while-revalidate=3600 s
- Edge cases: assessEvidence=true or =2 is treated as off

## `apps/site/src/app/games/canon/page.tsx` (2)

### Canon game chapter selection and engine reset triggers

P2 · Lifecycle · confiance High · `apps/site/src/app/games/canon/page.tsx:18-30; apps/site/src/components/games/CanonGameView.tsx:99-127, 245-248`

The game opens on chapter 6 unless a valid ?chapter= is given, an unknown chapter falls back to the first one, and changing chapter, render mode or sound setting throws away the current fight and returns to the intro state.

- Given: A visitor opens /games/canon?chapter=abc, or toggles sound mid-fight
- When: The page parses the query and the engine effect re-runs
- Then: A non-numeric chapter becomes chapter 6. A numeric id not in the manifest resolves to manifest.chapters[0]. Any change to currentChapter, renderMode or soundEnabled builds a fresh engine and sets matchState to 'intro'. Example: toggling sound at 40% enemy HP restarts the fight from the intro dialogue.
- Parameters: default chapter 6
- Edge cases: A chapter id of 0 or negative resolves to the first chapter rather than being rejected ; Chapter id is not clamped on the page, only on lookup

### Canon game bootstrap, chapter selection and starting stats

P2 · Lifecycle · confiance Medium · `apps/site/src/app/games/canon/page.tsx:22-30; apps/site/src/components/games/CanonGameView.tsx:67-100,516-525,619-640; packages/engine/src/games/canon-game-engine.ts:107-165,486-492`

The game starts on chapter 6 by default, falls back to the first chapter if the id is unknown, and every fight begins with fixed vitals; the next-chapter button appears only while the current id is below the chapter count.

- Given: URL ?chapter=abc, ?chapter=12, or no parameter
- When: The page loads
- Then: No parameter or non-numeric -> chapter 6; parseInt otherwise; unknown id -> first manifest chapter. Player starts hp/maxHp 100, ki 100 (max 700), x -280; enemy hp = boss_hp or 150, ki 100 (max 700), x +280; beam clash energy starts 50/50; match starts in 'intro'. Victory shows the Next Chapter button only if currentChapterId < manifest.chapters.length; any chapter can be chosen from the carousel without unlocking; reaching 0 hp ends the match in 'defeat', enemy 0 hp by beam clash triggers victory + dramatic finish
- Parameters: default chapter 6; player hp 100; default enemy hp 150; ki 100 start, 700 max; start x -280/280
- Edge cases: parseInt('12abc') = 12 ; Next-chapter logic assumes chapter ids are contiguous 1..N and ordered ; No progression or save is stored

## `apps/site/src/app/wiki/canon/page.tsx` (2)

### Public canon page question is not length-bounded

P1 · Validation · confiance Medium · `apps/site/src/app/wiki/canon/page.tsx:51-56, 81-86; apps/site/src/components/wiki/CanonExplorer.tsx:32-50; apps/site/src/lib/canon-preuves.ts:274-296`

The 300-character limit on the question exists only in the search box, so a hand-built URL with a very long ?q= goes unbounded into the verdict engine and the corpus search.

- Given: A request to /wiki/canon?q= followed by a 5,000-character string
- When: The page reads q, trims it and calls canonPreuves
- Then: The only checks are trim and the browser-side maxLength 300 on the input. The full string reaches analyzeCanon and two lexical RAG searches. The API route and the bot cap input (API bounds it, bot slices to 400), so the web page is the only surface without a server-side cap.
- Parameters: UI maxLength 300; bot cap 400

### Public canon page: score shown only for real verdicts

P1 · Policy · confiance High · `apps/site/src/app/wiki/canon/page.tsx:51-79,86-98,168-191,378-445`

The public page and its screen-reader announcement show an authority score only when the ruling is a real verdict; troll and open-question answers show the tier label without a score.

- Given: A question q (trimmed from ?q=) and a result whose nature is verdict, question or troll
- When: The result section renders
- Then: nature = 'verdict': announces and prints '<tier> · <score> / 100'; otherwise no '0 / 100' is printed and suggestions use the 'nearby topics' wording instead of 'see also'; empty q shows the explainer instead of calling the engine; announcement states 0, 1 or many pieces of evidence = plates + sheets; a question containing 'daima' (case-insensitive) adds a link to the 'Super Saiyan 4 GT' comparison
- Parameters: page always rendered on demand (force-dynamic); manga plates/scenes cache 600 s, limit 6 each
- Edge cases: Failure of manga plate search or episode scene search is logged and isolated, the other list still renders; if both empty the block is omitted ; Header illustration chosen by case-insensitive exact match on the question against the example shortcuts

## `apps/site/src/components/home/HomeCanonArbitre.tsx` (1)

### Home canon block visibility and subject listing

P2 · Policy · confiance High · `apps/site/src/components/home/HomeCanonArbitre.tsx:30-34,61-69,106-111`

The home canon block is hidden when disabled in configuration; it shows the first N doctrine entries only when N is positive; the placeholder is the doctrine's trimmed placeholder or the home config's; the home search input requires 2 to 400 characters.

- Given: Home config enabled=true, sujets=3 and a doctrine with 10 entries
- When: The home page renders
- Then: Only the first 3 entries are listed; sujets<=0 lists none; enabled=false renders nothing; an entry whose tier is unknown shows the raw tier id and a muted colour
- Parameters: input minLength=2, maxLength=400; sujets count from config
- Edge cases: The client minimum of 2 is not enforced by the API

## `apps/site/src/components/wiki/CanonExplorer.tsx` (1)

### Canon explorer search form guard

P2 · Validation · confiance High · `apps/site/src/components/wiki/CanonExplorer.tsx:13-58,84-101`

The search needs a non-blank question of at most 300 characters; the work filter only narrows the example shortcuts.

- Given: User types ' ' or a question longer than 300 chars
- When: The form is submitted
- Then: Blank (after trim) submits nothing and the button is disabled; input maxLength 300; valid value navigates to /wiki/canon?q=<trimmed, URL-encoded>. Work filter values: all, DBZ, GT, DBS, DAIMA filter the example list only. Ctrl/Meta/Shift/Alt-click on an example opens normally
- Parameters: maxLength 300; works DBZ, GT, DBS, DAIMA
- Edge cases: The web form caps at 300 but the API and bot accept 400, so a 301-400 char question can only come from the bot or API ; The active example is highlighted by case-insensitive equality with the current query

## `apps/site/src/lib/canon-config.ts` (13)

### Public doctrine read fallback

P1 · Policy · confiance High · `apps/site/src/lib/canon-config.ts:122-153`

The public canon page always answers. If the database fails, it serves the doctrine shipped in the repository. Admin reads are strict.

- Given: The database is unavailable, the table is missing, or the document is invalid
- When: A public read is made
- Then: The default doctrine (empty references) is returned. The admin snapshot throws instead, so defaults are never presented as editable. Only visible references are read from the table and merged with manual ones.
- Parameters: none
- Edge cases: Invalid document: non-object or array data ; Default references are empty; the corpus is loaded from the table

### Public canon page never fails: fall back to shipped doctrine

P1 · Policy · confiance High · `apps/site/src/lib/canon-config.ts:128-166`

Public readers get the shipped default doctrine if the database is down or the document is invalid. Admin reads never silently serve defaults.

- Given: A read of the canon configuration
- When: The database fails or the document is invalid
- Then: Public getCanonConfig returns the default doctrine, and getCanonReferences returns an empty list. The strict admin read getCanonConfigSnapshot throws, and also throws on a non-object or array data document, so failures cannot become editable defaults. Only visible references are read.
- Parameters: memoised per request
- Edge cases: A missing row in the admin read yields the defaults with a snapshot of null

### Public doctrine read never fails

P1 · Policy · confiance High · `apps/site/src/lib/canon-config.ts:128-166`

Public readers fall back to the shipped default doctrine (or no references) when the database is unavailable; admin reads must fail instead of exposing defaults for editing.

- Given: Database error or invalid document
- When: getCanonConfig / getCanonReferences run versus getCanonConfigSnapshot
- Then: Public: default doctrine or []; admin snapshot: throws 'Invalid canon configuration document' for a non-object document
- Parameters: none
- Edge cases: Missing row in admin read yields default config with snapshot of null

### Ingested citation edits (translation and visibility) are explicit and version-guarded

P0 · Lifecycle · confiance High · `apps/site/src/lib/canon-config.ts:158-203, 217-273`

An editor can change an ingested citation's translation or hide or restore it, but only through an explicit gesture and only if the row is unchanged since it was read. A citation missing from the payload is never hidden.

- Given: Ingested references (provenance not 'manuel') returned by the editor and the current table rows
- When: planifierGestesCitations runs
- Then: Manual or duplicate ids are skipped. A citation absent from the table is skipped. If neither translation (null equal to absent) nor visibility has changed, nothing happens. If the version is missing or differs from the row's SHA-256 version, it is a conflict (409 overall). Otherwise a gesture is issued with the exact updated_at text. The UPDATE succeeds only if updated_at::text equals the read value. The revision row has action 'visibility' if visible was set, else 'update', and carries before and after snapshots with the label truncated to 200 characters.
- Parameters: label max 200; version = sha256 of the stable JSON of the row without createdAt, seenAt, updatedAt
- Edge cases: Omitting a citation is never a removal request ; The hash uses the exact PostgreSQL text timestamp (microseconds), not a JS Date ; When both translation and visibility change, the revision action is 'visibility'

### Ingested citation edits: explicit gestures only, version-checked

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-config.ts:197-236, 279-314, 370-389`

An editor can retranslate, hide or restore an ingested citation only through an explicit change carrying the row version it read. Omitting a citation never hides it.

- Given: Ingested (non-manual) references returned by the editor
- When: The save plan is computed
- Then: Skip manual or duplicate-id requests and ids absent from the table. Skip requests with no change in textFr or visibility. A change with a missing or different version is a conflict ('citation version missing or changed since read'). Otherwise create a gesture. Apply each gesture only if the row's updated_at::text still equals the version read, and write a wiki_revisions row (action 'visibility' if visibility changed, else 'update') in the same transaction. Any conflict throws 409 and rolls the whole save back.
- Parameters: revision label = subject truncated to 200 chars; table name canon_references; error 409
- Edge cases: A hidden citation without a trace is impossible, since the revision is written in the same transaction ; A clear of the translation is textFr=null

### Optimistic concurrency on citation edits

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-config.ts:208-236; apps/site/src/lib/canon-config.ts:279-295; apps/site/src/lib/canon-config.ts:370-389`

A citation edit is accepted only if the editor holds the exact row version they read; otherwise the whole save is rejected with a conflict.

- Given: A citation whose stored version hash differs from the submitted version (or none was sent)
- When: saveCanonConfig processes ingested references
- Then: The gesture becomes a conflict; the row update also requires updated_at text equality; any conflict throws CanonConfigWriteError 409 'One or more references changed since they were read' and the transaction rolls back
- Parameters: version = sha256 of stable JSON of the row excluding createdAt/seenAt/updatedAt; HTTP 409
- Edge cases: No-op edits (same translation, same visibility) are skipped without a version check

### Audit trail for canon changes

P0 · Policy · confiance High · `apps/site/src/lib/canon-config.ts:238-314; apps/site/src/lib/canon-config.ts:391-402`

Every translation change, hide/restore and doctrine change writes a revision row in the same transaction with the actor identity, so a removal cannot occur without a trace.

- Given: A successful citation gesture or doctrine change
- When: The transaction commits
- Then: wiki_revisions gets a row: citations use action 'visibility' if visible was set, else 'update', label = subject truncated to 200; doctrine uses table 'CanonConfig' only when the JSON actually differs; actor is token automation identity, else API token actor, else session user, else caller id
- Parameters: label max 200 chars; tableName 'canon_references' / 'CanonConfig'
- Edge cases: A token request is attributed to the automation identity, never the owner account

### Doctrine changes are audited with the editor identity

P1 · Policy · confiance High · `apps/site/src/lib/canon-config.ts:249-270, 391-402`

Every real change to the doctrine writes a revision recording before, after and who saved it. Token-driven automation is recorded under its own identity.

- Given: A successful save
- When: The stored data differs (stable-JSON comparison) from the previous data
- Then: Insert a wiki_revisions row (table CanonConfig, row default, action update, label 'Canon doctrine') with before/after and the editor. Author priority: automation identity, then the API token actor when by equals the token session id, then the business user, then the raw by id. It is never the OWNER_ID account the token is attached to.
- Parameters: singleton id='default'
- Edge cases: Saving an identical document writes no revision ; If the session cannot be resolved, the editor falls back to the by id or null

### Saving canon doctrine requires a current snapshot (optimistic concurrency)

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-config.ts:317-366`

An admin save is refused unless the editor proves it saw the latest version of the doctrine, so concurrent edits never silently overwrite each other.

- Given: A canon configuration save request
- When: expected is not a 64-character lowercase hex SHA-256 string
- Then: Throw CanonConfigWriteError status 428 (snapshot required). If the stored snapshot hash (data + exact updated_at) differs from expected, throw 409 'changed since read'. If the conditional update or insert-on-conflict-do-nothing affects other than 1 row, throw 409 'changed during save'. The whole operation runs in one transaction. New updatedAt = max(now, previous + 1 ms).
- Parameters: expected format ^[a-f0-9]{64}$; error codes 428/409
- Edge cases: The row is matched on updated_at::text equality and on the data payload, never on a JS Date, to avoid losing PostgreSQL microseconds ; The first save, with no row yet, is allowed with the snapshot of a null row

### Doctrine singleton save guard

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-config.ts:317-366`

The doctrine document can be saved only with a current 64-hex snapshot token; a stale or missing token is refused.

- Given: An admin PUT with expected snapshot
- When: saveCanonConfig runs
- Then: A missing/non-sha256 token is rejected with 428 'A current configuration snapshot is required'; a snapshot that differs from the current row yields 409 'Configuration changed since it was read'; the new updatedAt is max(now, previous+1 ms)
- Parameters: HTTP 428 and 409; token regex ^[a-f0-9]{64}$; singleton id 'default'
- Edge cases: First insert uses onConflictDoNothing; a concurrent insert yields 409 'changed during save'

### Optimistic-concurrency save of the canon doctrine

P0 · Lifecycle · confiance Medium · `apps/site/src/lib/canon-config.ts:317-410 (saveCanonConfig), with helpers at :51-94 (stableJson, configurationSnapshot) and :249-270 (auteurDeLaRequete)`

Saving the doctrine requires the exact snapshot hash that was read. Any intervening change rejects the save, and each change leaves a revision.

- Given: An admin editor that read a doctrine snapshot
- When: saveCanonConfig is called
- Then: A missing or non-64-hex 'expected' value gives 428. If the current snapshot hash (sha256 of the stable JSON of data and the exact updatedAt text) differs, 409. A mismatch during the update, or a failed insert race, gives 409. Only manually entered references (provenance 'manuel', visible not false) are persisted in the blob. updatedAt = max(now, previous + 1 ms). A wiki_revisions row (table 'CanonConfig', action 'update') is written in the same transaction only if the data differs. The author comes from the automation identity, then the API token actor, then the user.
- Parameters: expected regex /^[a-f0-9]{64}$/; status codes 428/409; singleton id 'default'
- Edge cases: Ingested references are never stored in the blob ; A manual reference with visible:false is removed from the document ; Reference conflicts abort the whole transaction with 409

### Only manual citations are stored in the doctrine blob

P1 · Policy · confiance High · `apps/site/src/lib/canon-config.ts:326-334; apps/site/src/lib/canon-config.ts:141-146`

The stored document keeps only hand-typed citations; ingested ones live in the table and are merged on read; a manual citation marked invisible is removed outright.

- Given: A save containing manual and ingested references, one manual with visible:false
- When: The document is persisted
- Then: Only provenance 'manuel' and visible!==false are stored; visible/updatedAt/version are stripped; the reader appends table references
- Parameters: Provenance values: shenron, databooks, manga, manuel

### Citation visibility state (visible / hidden)

P1 · Lifecycle · confiance Medium · `apps/site/src/lib/canon-config.ts:97-126; apps/site/src/lib/canon-config.ts:182-236`

An ingested citation is public only while visible=true; hiding or restoring is an explicit editor gesture, never inferred from absence.

- Given: canon_references rows with visible true/false and an editor save request
- When: The public reader runs or the editor submits references
- Then: Reads return only visible=true rows; a citation omitted from the request is never touched; visible:false hides it, visible:true restores; manual citations are skipped by the planner
- Parameters: Gestures: translation change (textFr) and visibility change
- Edge cases: Duplicate ids in a request are processed once ; Unknown ids are ignored

## `apps/site/src/lib/canon-engine.ts` (44)

### Kiri unit facts and implied conversion conflict

P1 · Policy · confiance Low · `apps/site/src/lib/canon-engine.ts:1089-1109, 1553, 2039, 2909-2920; apps/site/src/app/wiki/canon/page.tsx:314-323`

The doctrine rules that Babidi's Kiri unit is canon (Yakon 800 Kiri, Goku SSJ2 3,000 Kiri, planet destruction at 200-300 Kiri) while the fan conversion 1 Kiri = 50,000 BP has no official source but is still displayed.

- Given: kiriToBpRate 50,000 and planetDestructionKiriFloor 200
- When: The conversion is applied to the canon figures
- Then: Yakon = 800 x 50,000 = 40,000,000 BP and Goku SSJ2 = 3,000 x 50,000 = 150,000,000 BP, which equals the Super Saiyan 1 reading, whereas the multiplier table puts SSJ2 at x100 of base (300,000,000 on the 3,000,000 base).
- Parameters: kiriToBpRate 50,000 (must be a positive finite number, else default); planetDestructionKiriFloor 200 (positive finite, else default); entry tier CANON_ABSOLU score 100

### Super Saiyan fusion power ruling (Potara versus Metamoru)

P2 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:1110-1158, 1599-1617`

For questions comparing Vegetto and Gogeta the arbiter rules that Potara is superior in the manga (no equalisation, no time limit for mortals) and that the Super Exciting Guide formalises a multiplication formula, at tier EXTENSION_OFFICIELLE with score 75.

- Given: The question 'Vegetto est-il plus fort que Gogeta ?'
- When: The best matching entry is resolved
- Then: The entry 'fusion-potara-vs-metamol-puissance' is returned, tier Extension officielle, score 75, with sources Manga tome 42 ch. 504, Super Exciting Guide (2009) and Daizenshuu 7.
- Parameters: tier EXTENSION_OFFICIELLE; score 75 (tier default is 70); about 30 keyword phrasings including 'potala' misspellings

### Scouter abandonment and Namek figures are seeded as rulings with different authority

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:1255-1310`

The seed doctrine rules the 150,000,000 Namek figure as Daizenshuu-level (Extension, 75) and the end of scouter numbers as Toriyama's deliberate decision (Canon absolu, 100).

- Given: Questions 'puissance de Goku sur Namek' and 'pourquoi plus de chiffres scouter'
- When: The arbiter resolves them
- Then: The first returns tier EXTENSION_OFFICIELLE score 75 (Goku SSJ1 150,000,000 vs Freezer 120,000,000, Kaio-ken x20 60,000,000, base 3,000,000); the second returns CANON_ABSOLU score 100 with a Toriyama quotation dated 1995.
- Edge cases: The 1995 quotation is attributed to 'Daizenshuu 6 & entretiens Akira Toriyama', a combined, non-page-specific source, which the doctrine's own forbidden-source list (undated or unsourced quotations) would not accept for a new entry

### Power scaling configuration constants

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:1549-1553, 2904-2930`

The power-scaling panel uses a fan conversion rate and a planet-destruction floor. Both must be positive finite numbers, and the rate is explicitly non-canonical.

- Given: A power-scaling configuration
- When: The document is resolved
- Then: A non-positive or non-finite kiriToBpRate or planetDestructionKiriFloor is replaced by its default. The defaults are kiriToBpRate=50000 and planetDestructionKiriFloor=200, enabled=true. The default Super Saiyan multiplier is 50, Super Saiyan 2 is 100, Oozaru is 10 and Kaio-ken is 2.
- Parameters: kiriToBpRate=50000; planetDestructionKiriFloor=200; SSJ x50; SSJ2 x100; Oozaru x10; Kaio-ken x2 (base)
- Edge cases: The editor UI falls back to 50000 or 200 on any falsy input (CanonEditor.tsx:1196,1214) ; Kaio-ken is labelled 'x2 to x20' but stored with multiplier 2

### Transformation multiplier chain and fusion rows stored with multiplier 0

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:1554-1617; apps/site/src/app/wiki/canon/page.tsx:280-291; apps/site/src/app/admin/canon/CanonEditor.tsx:1234, 1286`

SSJ2 and SSJ3 multipliers are stored as absolute factors of the base form (100 = 2 x 50, 400 = 4 x 100), while the two fusion rows carry multiplier 0 as a placeholder because fusion is additive or multiplicative of two fighters.

- Given: The default multiplier table
- When: The public canon page lists the multipliers
- Then: Oozaru x10 (CANON_ABSOLU), Kaio-ken x2 (labelled x2 to x20, CANON_ABSOLU), SSJ1 x50 (CANON_ABSOLU), SSJ2 x100 and SSJ3 x400 (EXTENSION_OFFICIELLE, from the 2009 Super Exciting Guide), and the Metamoru (additive after equalising to the weaker fighter) and Potara (A x B, no equalisation) fusion rows are shown with a factor of 0.
- Parameters: fusion rows multiplier 0; editor new-row default multiplier 1; editor coerces an empty or invalid factor to 0

### Official battle-power reading table (scouter era)

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:1618-1991`

The doctrine ships 40 official battle-power readings from the Saiyan and Namek sagas, each tagged scouter or not and graded CANON_ABSOLU (manga chapter) or EXTENSION_OFFICIELLE (Daizenshuu 7).

- Given: The default power scaling configuration
- When: A character page or the canon page reads officialBps
- Then: Readings include farmer 5, Goku heavy clothes 334, Piccolo Makankosappo 1,440, Raditz 1,500, Nappa 4,000, Vegeta 18,000, Nail 42,000, Ginyu 120,000, Freezer form 1 530,000, Freezer form 2 1,000,000, Goku post-regeneration 3,000,000, Freezer 100% 120,000,000 and Goku Super Saiyan 150,000,000. Readings from Freezer's final form on and every Daizenshuu-only figure with a scouter value of false are marked as not scouter-readable; manga-chapter readings are CANON_ABSOLU, book-only ones EXTENSION_OFFICIELLE.
- Parameters: 40 rows; fields: character, optional characterId (Goku = 1), saga, state, bp, scouter, source, canonTier
- Edge cases: Raditz is stored as 1,500 while its source label reads 'Daizenshuu 7 (1200 Manga)' ; Vegeta Oozaru (x10, 180,000) is graded EXTENSION_OFFICIELLE although the Oozaru multiplier row is CANON_ABSOLU for the same manga chapter 233 ; Names are free text, so character matching downstream is by string/characterId

### Power scaling configuration and fan kiri-to-BP conversion

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:176-215, 1549-1617 (defaults and multipliers), 1618-1990 (officialBps), 2911-2920 (resolver); apps/site/src/app/wiki/canon/page.tsx:266-322; apps/site/messages/fr.json:1118`

The page displays power multipliers, official battle-power values and a fan-made conversion rate from kiri to battle power. It is flagged as non-canonical.

- Given: Default powerScaling config
- When: The canon page renders
- Then: Kiri to BP rate is 50000 and the planet-destruction kiri floor is 200, shown only when the rate is above 0. The multipliers are Oozaru x10, Kaio-ken x2 (the note says up to x20), SSJ1 x50 (3,000,000 to 150,000,000 BP), SSJ2 x100 (2 x SSJ1), SSJ3 x400 (4 x SSJ2), and fusions with multiplier 0 as a placeholder. Official BP examples: farmer 5, Raditz 1500, Freezer 100% 120,000,000, Goku SSJ1 150,000,000. 200 kiri x 50000 = 10,000,000 BP.
- Parameters: kiriToBpRate 50000; planetDestructionKiriFloor 200; resolver accepts only finite numbers > 0
- Edge cases: A value that is not finite or is <= 0 falls back to the default ; The code does not compute with these values; they are display only ; The Kaio-ken multiplier is stored as 2 while its note claims x2 to x20 ; Fusion multiplier 0 is a placeholder, not a real factor

### Five-step cosmic power ladder

P2 · Policy · confiance Low · `apps/site/src/lib/canon-engine.ts:1992-2042`

Power is described in five named tiers from Elite Human to Cosmic/Gods, with the boundary between tiers given by what the character can destroy rather than a coded number.

- Given: The default power tiers
- When: A tier is displayed
- Then: Tier 1 human/martial (farmer 5, Roshi 139), tier 2 moon destroyer (Piccolo 1,440, Raditz 1,500, Saibaiman 1,200), tier 3 planetary (Vegeta 18,000 to Nail 42,000), tier 4 stellar/galactic emperor (Ginyu 120,000 to Goku SSJ1 150,000,000), tier 5 cosmic measured in Kiri (Gohan SSJ2, SSJ3, Buu, Vegetto, Beerus, Whis).
- Parameters: tierNumber 1-5, no numeric thresholds in code
- Edge cases: The moon is described as destroyed at about 140-300 BP, yet tier 2 examples sit at 1,200-1,500 and Roshi (139) is in tier 1 ; Tier membership is not computed from a number, so a numeric reading has no deterministic tier

### Heuristic phrasing families: seeded tiers, scores and the 'filler chapter' mis-ruling

P1 · Policy · confiance High · `apps/site/src/lib/canon-engine.ts:2049-2149, 2605-2618`

Six fallback families map phrasings to a likely tier and a fixed score; the family with the longest matched keywords wins, which makes 'chapitre' beat 'filler'.

- Given: Families: manga-original (CANON_ABSOLU 100; chapitre, tome 1, 42 tomes...), production-toei (NON_CANON_DERIVE 20; filler, oav, toei), jeux-video (15), supervision-officielle (EXTENSION_OFFICIELLE 85), fanon-general (0), rumeur (0)
- When: A user asks 'ce chapitre filler' and no topic entry matches
- Then: manga-original scores 'chapitre' = 8, production-toei scores 'filler' = 6, so the answer is Canon absolu 100 for derivative content.
- Parameters: scores 100/20/15/85/0/0; supervision-officielle score 85 differs from the tier default 70; keyword 'doujinshi' appears in two families (fanon-general first on a tie)

### Keyword matching requires whole words, with one tolerated plural s

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2211-2254`

Keywords match only as whole words, after lowercasing and accent stripping. A single trailing 's' is tolerated, and Japanese keywords match anywhere.

- Given: A normalised input text and a keyword
- When: The keyword is searched
- Then: A hit needs the keyword edges not to touch a letter or digit. One trailing 's' is allowed. Edges next to CJK characters, and CJK keywords themselves, always count as boundaries. An empty keyword never matches.
- Parameters: NFKC then lowercase, strip U+0300-U+036F, recompose to NFC to keep the dakuten (が does not become か). Plural tolerance = one 's'.
- Edge cases: 'GT' does not match inside 'magtruc' ; 'planete' matches 'planetes' ; Only the first boundary-valid occurrence is needed

### Whole-word keyword matching with a single-s plural

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2211-2265`

A keyword matches only as a whole word. One trailing 's' is tolerated, and CJK keywords match as substrings.

- Given: Normalised text (NFKC, lower case, accents stripped, dakuten kept) and a keyword
- When: A match is tested
- Then: The match fails if the character before the keyword is a non-CJK letter or digit. After the keyword one 's' may be skipped, and the next character must then not be a non-CJK letter or digit. Example: 'planete' matches 'planetes', 'GT' does not match 'magtruc', 'oav' does not match 'xoavy'. CJK keywords match on any substring occurrence.
- Parameters: plural tolerance: exactly one 's'; combining marks U+0300-U+036F removed
- Edge cases: Pure ASCII input only gets lower-cased ; The first occurrence that fails the boundary does not block a later one ; Empty keywords never match

### Reference relevance ranking with keyword rarity

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2267-2336`

Author statements are ranked by the length of their matched keywords weighted by rarity, so a precise keyword beats a common one. At most 3 are shown, with one per subject.

- Given: A visible reference corpus with keywords, and the keywords the verdict recognised
- When: referencesPour is called
- Then: For each matched keyword the weight adds len(kw) x 1/log2(2 + freq(kw)), where freq is the number of references sharing that keyword (default 1). If the keyword is among the verdict's recognised subject words, a further len(kw) is added. A reference qualifies only if weight > 0 and at least one matched keyword is longer than 3 characters. Sorting is by weight descending, then by shorter text first. Duplicate normalised subjects are dropped, keeping the best, and the result is capped at 3. Example: 'broly' (5 chars, freq 6) weighs 5/log2(8) = 1.67, plus 5 if it is a subject word, giving 6.67.
- Parameters: max results 3; solid keyword length > 3; rarity = 1/log2(2+freq); subject-word bonus = keyword length
- Edge cases: References with visible === false are skipped ; Frequencies are memoised per corpus array in a WeakMap ; Subject-deduplication ignores references with an empty subject, which are never treated as duplicates

### Author references: relevance weighting and selection

P1 · Calculation · confiance High · `apps/site/src/lib/canon-engine.ts:2267-2336`

Up to 3 visible author citations are shown under a verdict, ranked by rare, long, subject-specific keywords. Common-word-only matches and duplicate subjects are dropped.

- Given: A normalised question and the reference corpus
- When: Related references are chosen
- Then: Skip references with visible===false. Each matched keyword adds len x 1/log2(2 + frequency), where frequency is the number of references sharing the keyword (default 1), and adds a further len when the keyword is also one of the verdict's own keywords. A reference qualifies only if its weight is above 0 and at least one matched keyword is longer than 3 characters. Sort by weight descending, with the shorter text winning a tie. Keep only the first reference per normalised subject, and return at most 3 references.
- Parameters: maximum=3; solid keyword length > 3; rarity=1/log2(2+freq); subject keyword bonus=+length
- Edge cases: A reference whose keywords are all 3 characters or fewer never appears ; Two references with the same subject: only the higher weight is shown ; With an empty corpus no references are returned

### Author-statement reference selection

P1 · Calculation · confiance High · `apps/site/src/lib/canon-engine.ts:2291-2336`

Up to 3 printed author quotes are attached to a verdict, ranked by rarity-weighted keyword length, hidden ones excluded, one per subject.

- Given: A corpus of references and a normalised question
- When: referencesPour runs
- Then: Skip visible===false; weight = sum(keyword length / log2(2 + corpus frequency)) plus keyword length again when the verdict itself recognised the keyword; require weight > 0 and at least one keyword longer than 3 letters; sort by weight desc then shorter text; keep first per normalised subject; cap 3
- Parameters: maximum 3; min solid keyword length > 3
- Edge cases: Keyword match must be a whole word, tolerating one trailing 's' ; CJK keywords match without boundary checks

### Troll, crossover, invention and off-topic detection

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2352-2394`

Input is refused with a stated reason when it contains insults, rival franchises, invented forms, off-topic subjects or gibberish.

- Given: Normalised input with punctuation stripped
- When: detecterTroll runs
- Then: Tests run in this order: insults give 'vulgarite', rival franchises (superman, naruto, luffy...) give 'crossover', invented forms give 'invention', off-topic terms (macron, bitcoin, chatgpt...) give 'hors-sujet'. Then gibberish: a token of at least 7 characters with no Latin vowel, no digit and no CJK, where such tokens are at least ceil(words/2) and at least 1, gives 'charabia'. A run of 6 or more identical characters also gives 'charabia'. Example: 'Goku vs Superman' gives crossover. 'Super Saiyan 6' gives invention.
- Parameters: min gibberish token length 7; repeat run 6+; invented forms are Super Saiyan 6-9, 10 and above, infinity, omega, rainbow, black rose, god of god; universes 13-99; 'ultra ego instinct'
- Edge cases: Super Saiyan 5 is deliberately not an invention, because it is a ruled apocryphal topic ; An insult wrapped around a real question is still refused ; A mention of a rival franchise is a crossover, not vulgarity, but only if no insult matches first ; The insult list is coarse; short tokens such as 'pd', 'tg', 'bite' and 'nu' may cause false positives

### Troll / off-topic input state

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2352-2394`

Insults, crossovers with other franchises, invented forms (Super Saiyan 6+, universe 13+), off-topic subjects and keyboard mashing get no canon rank and a reason-specific explanation.

- Given: The question 'Goku vs Superman'
- When: detection runs, checked in order vulgarite, crossover, invention, hors-sujet, charabia
- Then: Result tier APOCRYPHE_FANON, score 0, label 'Hors des sources', nature 'troll', origin 'troll:crossover', no sources, no references. Gibberish gets label 'Illisible'
- Parameters: Gibberish: token length >= 7 with no latin vowel and no digit, making up >= ceil(words/2) of words; or a character repeated 6+ times. Super Saiyan >=6 is invention while SSJ5 is a ruled apocryphal entry
- Edge cases: An insult around a real question is still refused ; A real question mentioning a rival franchise is treated as crossover ; Word 'sex', 'tg', 'pd', 'claude', 'gemini' trigger refusal even in legitimate contexts

### Keyboard-mash and invented-form refusal thresholds

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2352-2394`

Input is refused as gibberish when at least half its words are 7+ letters with no vowel and no digit, or when any character repeats 6+ times; forms like Super Saiyan 6+ or Universe 13+ are refused as inventions.

- Given: Normalized user input
- When: detecterTroll runs, after punctuation removal and whitespace collapsing
- Then: Order: insult -> 'vulgarite'; out-of-universe franchise -> 'crossover'; invented form (super saiyan/ssj/ssgss/ss followed by 6-9, 10+, infini, omega, rainbow, etc.; univers 13-99; 'ultra ego instinct'; 'goku solo') -> 'invention'; off-topic list (politics, weather, crypto, AI assistant names) -> 'hors-sujet'; gibberish: count words with length >= 7, no a/e/i/o/u/y, no digit, not CJK; if count >= max(1, ceil(words/2)) -> 'charabia'; any char repeated 6 or more times (/(.)\1{5,}/) -> 'charabia'. Example: 'qsdfghjkl' -> charabia; 'Goku SSJ 7' -> invention.
- Parameters: gibberish word length 7; ratio ceil(words/2); repeat run 6; invented forms 6+ and universes 13+
- Edge cases: Super Saiyan 5 is deliberately not refused (ruled as apocryphal topic) ; Insults are checked first, so a vulgar word around a real question still refuses it ; Short pure-consonant words (<7) such as 'grr' are not flagged

### Troll, crossover, invention, off-topic or gibberish input is refused with no rank

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2352-2394, 2523-2547`

Before any lookup, the engine refuses vulgar text, other franchises, invented forms/universes, real-world off-topic subjects and keyboard mashing. It names the reason and gives no canon rank.

- Given: A normalised input, with punctuation stripped and whitespace collapsed
- When: It matches, in this order: INSULTES (vulgarite), HORS_UNIVERS (crossover), FORMES_INVENTEES (invention), HORS_SUJET (hors-sujet), or gibberish (charabia)
- Then: Return nature=troll, tier APOCRYPHE_FANON, score 0, empty sources and references, origine 'troll:<reason>', tierLabel 'Hors des sources' ('Illisible' for charabia), and up to 4 suggestions. No entry, heuristic or fallback is consulted.
- Parameters: Test order: vulgarite, crossover, invention, hors-sujet, charabia. Gibberish = at least half the tokens are 7+ chars with no vowel [aeiouy], no digit and no CJK, or one character repeated 6+ times in a row. Invented forms = Super Saiyan/SSJ/SSGSS/SS level 6-99+, infini/omega/rainbow/noir/black rose/god of god, universe 13-99, 'ultra ego instinct', 'goku solo'. Examples of out-of-universe franchises: superman, naruto, one piece, pokemon, solo leveling.
- Edge cases: Input 'Goku vs Superman' returns crossover, but 'Super Saiyan 5' is not matched here because it has its own ruled entry (apocryphal) ; An insult wrapped around a genuine question is still refused ; Word-boundary regexes with no accent handling: 'météo' is matched in both accented and plain forms ; Insult list includes 'sex', 'nu(e)s de', 'tg', 'pd', which can false-positive on short legitimate tokens ; A real question that only mentions a rival franchise is still classed as crossover, despite the comment saying crossover questions are not vulgarity

### Refusal of typed numbers with six identical consecutive characters as keyboard mashing

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2375-2394`

Any input with the same character repeated six or more times in a row is refused as unreadable, which also catches long power figures typed without separators.

- Given: The question 'Goku 150000000' or 'Gohan 1200000000' or 'ki 1000000'
- When: The input is checked before any topic is matched
- Then: The pattern (.)\1{5,} sees six or more repeated characters (the zeros), the origin becomes 'troll:charabia' and the answer is 'Rien a trancher : la question n'est pas lisible' with no rank, even though the doctrine itself ranks 150,000,000.
- Parameters: repeat threshold 6 identical characters; word test: length >= 7 with no [aeiouy] and no digit, refused when at least half of the tokens qualify

### Related-topic suggestions scoring

P2 · Calculation · confiance High · `apps/site/src/lib/canon-engine.ts:2411-2445`

Nearby ruled topics are offered as next questions, ranked by shared words.

- Given: A normalised input, the topic entries, and the entry to exclude
- When: Suggestions are built
- Then: For each keyword: +len if it appears as a whole word in the input, else +2 if it equals an input token. Each input token (longer than 2 characters, not a stop word) that appears in the title adds its length. Entries with weight > 0 are sorted by descending weight, limited to 3 to 4 titles. If nothing matches and an entry was excluded, the first N entries of the same category are returned.
- Parameters: max 4 (3 after a verdict); token length > 2; stop words such as 'est', 'les', 'canon', 'dragon', 'ball'; exact token match +2
- Edge cases: The excluded entry is the matched topic ; Same-category fallback occurs only when there is an excluded entry

### Suggested next questions

P2 · Calculation · confiance High · `apps/site/src/lib/canon-engine.ts:2411-2445`

The engine offers titles of ruled topics sharing words with the input, best first, and falls back to same-category topics.

- Given: An analysis result
- When: Suggestions are built
- Then: Per entry (excluding the matched one): a whole-word keyword match adds its length, a mere word equality adds 2, and each input word (over 2 characters and not a stop word) found in the title adds its length. Keep entries scoring above 0, sorted descending, with a maximum of 4 (3 for entry and heuristic verdicts). If nothing scores and a matched entry exists, list up to the maximum other entries of the same category.
- Parameters: max 4 (3 for verdicts); keyword word-equality bonus 2; stop words include canon, dragon, ball, officiel, vrai, faux
- Edge cases: Same-category fallback applies only when an entry matched; heuristic and fallback paths just return an empty list

### Verdict decision cascade (entry, heuristic, fallback)

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:2492-2667`

A canon question is answered by the first level that matches: troll/empty screening, then curated topic entries, then phrasing-family heuristics, then an honest 'not established' fallback.

- Given: A user question and the effective doctrine
- When: analyzeCanon runs
- Then: Empty input returns origin 'empty'; troll detection returns origin 'troll:<reason>'; else best entry returns 'entry:<id>'; else best heuristic returns 'heuristic:<id>'; else 'fallback'. No LLM or outbound call participates
- Parameters: Fallback tier EXTENSION_OFFICIELLE, score 50 (canon-engine.ts:2186-2193)
- Edge cases: Empty input returns tier CANON_ABSOLU with score 0 and label 'En attente d'analyse' (placeholder, not a real ruling)

### Verdict resolution order (troll, topic entry, heuristic, fallback)

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:2492-2669`

A canonicity question is answered by a fixed cascade: empty input, then troll or off-topic detection, then the best-matching curated topic, then the best-matching phrasing family, then an admitted-ignorance fallback.

- Given: Doctrine config with entries, heuristics and a fallback of EXTENSION_OFFICIELLE score 50
- When: analyzeCanon is called with input text
- Then: Empty or whitespace input returns CANON_ABSOLU, score 0, grey #9ca3af, label 'En attente d'analyse', origin 'empty'. Else a troll match returns APOCRYPHE_FANON, score 0, origin 'troll:<reason>'. Else the best entry returns the entry's own tier and score, origin 'entry:<id>'. Else the best heuristic returns origin 'heuristic:<id>'. Else the fallback returns tier EXTENSION_OFFICIELLE, score 50, origin 'fallback'. An open question gets the label 'Question ouverte' and nature 'question'.
- Parameters: empty score 0; empty colour #9ca3af; fallback tier EXTENSION_OFFICIELLE; fallback score 50; troll score 0
- Edge cases: Empty input carries tier CANON_ABSOLU with score 0, so a naive consumer could read it as top authority ; A question input ('?' ending or markers such as 'qui est', 'vs', 'pourquoi') with no match gets nature 'question' and a different label and verdict, but the same tier and score ; Troll results have empty sources and empty references

### Canon question: empty input yields a no-verdict placeholder

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2506-2521`

A blank or whitespace-only question gets no ruling, only the configured placeholder text with score 0.

- Given: A canon question box submission
- When: The trimmed, normalised input is empty
- Then: Return nature=empty, origine=empty, score 0, grey colour #9ca3af, tierLabel 'En attente d'analyse', verdict/explanation from config.vide, no sources, no suggestions
- Parameters: empty colour=#9ca3af; score=0
- Edge cases: The tier field is still CANON_ABSOLU on an empty result and is only a placeholder, so UI code must not treat it as a ruling

### Empty input state

P2 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2506-2521`

Blank or whitespace-only input yields a neutral 'awaiting analysis' state with score 0 and no sources.

- Given: Input ' '
- When: analyzeCanon runs
- Then: nature='empty', score 0, color #9ca3af, tier field is CANON_ABSOLU but meaningless
- Parameters: color #9ca3af

### Verdict nature drives whether a score is shown, and the site and the Discord bot disagree

P1 · Policy · confiance High · `apps/site/src/lib/canon-engine.ts:2507-2520, 2523-2546, 2574-2592, 2620-2637, 2643-2666; apps/site/src/app/wiki/canon/page.tsx:173-180, 381-383, 439-442, 448-456, 640-644; apps/bot/src/commands/wiki/Canon.ts:66-72, 88-88, 100-100, 170-170`

Each answer has a nature (verdict, question, troll, empty). The site prints 'score / 100' only for nature 'verdict', but an unknown statement that is not phrased as a question is classed as nature 'verdict' with the fallback score of 50, so the site prints '50 / 100' where the Discord bot hides the score.

- Given: The input 'Le Kamehameha rouge de Goku' matches no entry or heuristic, is not a troll, and is not phrased as a question
- When: analyzeCanon reaches the fallback
- Then: The result is tier EXTENSION_OFFICIELLE, score 50, origine 'fallback', nature 'verdict', label 'À vérifier dans le corpus'. The site page shows 'Extension officielle · 50 / 100' and the screen-reader announcement uses the scored phrase. The bot treats origine 'fallback' as unknown and shows no score bar, no tier definition and no doctrinal sources. A phrased question ('qui est le plus fort ?') gets nature 'question', no score on the site, and the 'nearby topics' heading instead of 'see also'. Troll input gets nature 'troll', score 0, tier APOCRYPHE_FANON, and the 'no evidence' message is suppressed. An older API without 'nature' is inferred by the bot as 'question' when origine is fallback, else 'verdict'.
- Parameters: fallback tier EXTENSION_OFFICIELLE; fallback score 50; empty/troll score 0
- Edge cases: Empty input has tier CANON_ABSOLU with score 0 and nature 'empty'; the label is 'En attente d'analyse' ; The site hides the score on nature, the bot hides it on origine, so the two surfaces diverge only for non-question fallback

### Topic entry scoring (best entry wins)

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2549-2572`

Each curated topic is scored by its matched keywords and its title. The highest score wins and ties go to the earlier table position.

- Given: A normalised input and a list of topic entries
- When: The engine scans the entries
- Then: Entry score = sum over matched keywords of (keyword length x 2), plus a title bonus. The title bonus is 50 if the normalised title equals the whole input, else min(50, title length x 2). Only a strictly higher score replaces the current best, so ties keep the first entry. A score of 0 never matches. Example: keywords 'broly' (5) and 'broly canon' (11) both matched give 32.
- Parameters: keyword weight 2 per character; title bonus cap 50; exact-title bonus 50
- Edge cases: The title is matched as a whole word, with the plural 's' tolerated ; The score shown to the user is the entry's configured score, not the match score ; The admin orders entries from most specific to broadest, because ties go to the first one

### Topic entry selection: highest keyword score wins, ties go to table order

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2549-2593`

The curated topic with the highest match score gives the canon verdict. Each matched keyword adds twice its length, and a title match adds up to 50.

- Given: An input that has passed the troll check, and the list of ruled entries
- When: Entries are scored
- Then: Score = sum(2 x keyword length for each matched keyword) + title bonus. The title bonus is 50 on an exact whole-input match, otherwise min(50, 2 x title length). The strictly greatest score wins, so the earlier entry wins a tie. The result carries the entry's tier, its own score, verdict, explanation, Toriyama quote, sources, tier label and colour, doctrine rules, tier definition, up to 3 suggestions and the matching author references, with nature=verdict and origine 'entry:<id>'.
- Parameters: keyword weight 2 x length; title cap 50; exact-title bonus 50; suggestions=3
- Edge cases: Input 'broly dbz 1993' also contains 'broly dbz' and 'broly', but the 1993 entry scores higher, so it returns NON_CANON_DERIVE with score 20 and not CANON_SUPERVISE 85 ; A score of 0 never selects an entry ; Admins should put the more specific entries first, since ties go to the earlier one

### Topic entry matching and scoring

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2549-2593`

The curated topic with the highest keyword score wins; the verdict, tier, score and quote are those the editor wrote for that entry.

- Given: Question 'Broly est-il canonique ?' and the default Broly entry (tier CANON_SUPERVISE, score 85)
- When: Each entry is scored: each matched keyword adds 2 x its length; a title match adds 50 if the normalised title equals the input, else min(50, 2 x title length)
- Then: Highest score wins, ties go to the earlier entry in table order; result tier CANON_SUPERVISE, score 85, nature 'verdict', origin 'entry:broly', up to 3 suggestions and 3 references
- Parameters: keyword weight 2 x length; exact-title bonus 50; title bonus cap 50; suggestions max 3
- Edge cases: Score must be > 0 to win ; Tie-break depends on admin ordering

### Heuristic (phrasing family) matching

P1 · Calculation · confiance High · `apps/site/src/lib/canon-engine.ts:2595-2638`

When no topic matches, the phrasing family with the longest cumulative keyword match decides the rank, so 'ce chapitre filler de Xenoverse' is not ruled canon just because it contains 'chapitre'.

- Given: Question 'ce chapitre filler de Xenoverse'
- When: Heuristics are scored by sum of matched keyword lengths
- Then: Highest score wins (ties: first in table); verdict tier is that of the winning rule (jeux-video, NON_CANON_DERIVE, score 15 in this case)
- Parameters: Default families: manga-original (CANON_ABSOLU, 100), production-toei (NON_CANON_DERIVE, 20), jeux-video (NON_CANON_DERIVE, 15), supervision-officielle (EXTENSION_OFFICIELLE, 85), fanon-general and rumeur (APOCRYPHE_FANON, 0)
- Edge cases: 'doujinshi' appears in both fanon-general and rumeur; the first wins on ties

### Heuristic phrase families are the fallback ruling, longest keyword match wins

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2595-2638, 2049-2148`

If no topic matches, phrase families (manga original, filler/Toei, video games, official guides, fan creations, rumour) give a probable rank. The family with the greatest total matched keyword length wins.

- Given: No ruled entry matched
- When: Heuristic keywords are scored
- Then: Score = sum of keyword lengths. The highest strict score wins, and the first declared family wins a tie. Return that family's tier and score, with origine 'heuristic:<id>'. Defaults: manga-original CANON_ABSOLU 100, production-toei NON_CANON_DERIVE 20, jeux-video NON_CANON_DERIVE 15, supervision-officielle EXTENSION_OFFICIELLE 85, fanon-general and rumeur APOCRYPHE_FANON 0.
- Parameters: Default heuristic scores 100/20/15/85/0/0; max 500 rules
- Edge cases: 'ce chapitre filler de Xenoverse' must not rank as canon absolute: 'filler' (6) + 'xenoverse' (9) beats 'chapitre' (8) and gives NON_CANON_DERIVE ; Heuristic 'supervision-officielle' (score 85, tier EXTENSION_OFFICIELLE) does not match the tier default score of 70 ; Keyword 'doujinshi' appears in both fanon-general and rumeur; the first declared wins a tie

### Heuristic (phrasing family) scoring

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2601-2618`

When no topic matches, phrasing families are scored by the cumulative length of their matched keywords. The longest, most specific match wins, not the first declared.

- Given: No topic entry matched
- When: Heuristics are scanned
- Then: Score = sum of the lengths of matched keywords, with no x2 factor. The strictly highest wins and ties go to the earlier one. Example: 'ce chapitre filler de Xenoverse' lets 'filler' and 'xenoverse' outweigh 'chapitre' (7), so the verdict is not CANON_ABSOLU.
- Parameters: weight 1 per character
- Edge cases: The comment cites 'chapitre' as a keyword of the manga-original family at rank 1 ; The score returned is the heuristic's configured score

### Fallback: not established vs open question

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:2640-2666`

When nothing is ruled, the system refuses to invent a verdict: genuine questions get 'Question ouverte', assertions get 'a verifier dans le corpus'.

- Given: A question 'qui est le plus fort ?' with no matching entry or heuristic
- When: Fallback is reached
- Then: nature='question', label 'Question ouverte', tier EXTENSION_OFFICIELLE, score 50, matchedKeywords empty, references from corpus; an assertion gets nature 'verdict' with the configured fallback verdict
- Parameters: Question markers: trailing '?', or phrases like 'qui est', 'pourquoi', 'vs', 'plus fort', 'est-il' (canon-engine.ts:2396-2404); fallback score 50
- Edge cases: Fallback still carries tier EXTENSION_OFFICIELLE/score 50, which looks like a ruling for an unestablished claim

### Unknown topic: 'not established' fallback or open question

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:2640-2666, 2186-2193, 2152-2158`

When nothing matches, the engine does not invent a rank. It says the claim is unestablished, or treats the input as an open question, and returns only corpus references.

- Given: No entry and no heuristic matched, and the input is not a troll
- When: The fallback path runs
- Then: Return tier EXTENSION_OFFICIELLE with score 50 (configurable), origine 'fallback', matchedKeywords empty, and up to 4 suggestions. If the input looks like a question (ends with ?/？ or contains qui est, pourquoi, combien, vs, contre, plus fort, est-il...), return nature=question with label 'Question ouverte' and the generic 'doctrine has not ruled' text. Otherwise return nature=verdict with the fallback verdict.
- Parameters: fallback.tier=EXTENSION_OFFICIELLE; fallback.score=50; question markers regex MARQUEURS_QUESTION
- Edge cases: The fallback carries a tier colour and score 50, which a consumer could mistake for a real ruling; the nature field distinguishes them ; Doctrine rule: 'a claim with no printed source is not false, it is unestablished'

### Canon doctrine document sanitisation and cardinality limits

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2672-2957`

The stored doctrine is retyped, bounded and defaulted field by field on every read and write, so a malformed document never breaks the page.

- Given: An arbitrary JSON document from the database or an admin PUT
- When: resolveCanonConfig runs
- Then: Entries are capped at 2000, heuristics at 500 and references at 20000. Scores are rounded and clamped to 0-100, and a non-finite score takes the default. An entry needs a title and at least one keyword, a heuristic needs at least one keyword, and a reference needs text and at least one keyword. Unknown tier values become EXTENSION_OFFICIELLE, unknown categories become 'lore', and a missing score takes the tier default (else 50). Lists are deduplicated and truncated (entry keywords 40 x 80 characters, reference keywords 24, doctrine 16 x 400). Ids are slugified (max 60), and a collision appends '-2'. Reference ids that already match /^[a-z0-9][a-z0-9_.:-]{0,199}$/i are kept unchanged. A reference href must be an internal route matching /^\/[\w/#?=&.-]*$/. A tier colour must match /^#[0-9a-f]{3,8}$/i. A reference lang is en, ja or fr (default fr). A reference provenance is manuel, databooks or manga (default shenron). An explicit empty array of entries is respected.
- Parameters: MAX_ENTREES 2000; MAX_REGLES 500; MAX_REFERENCES 20000; score clamp 0-100; verdict max 600; explanation max 4000; reference text max 4000
- Edge cases: The id collision loop only appends one '-2' per iteration, so a third duplicate becomes id-2-2 ; A non-object patch returns a clone of the default doctrine ; Power scaling multipliers, officialBps and tiers are accepted unvalidated if they are arrays ; Slice truncation uses a character count, not a word boundary

### Stored canon document is sanitised and bounded on read and write

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2680-2957`

The editable doctrine is never trusted. Every field is retyped, trimmed, length-capped and defaulted, and cardinality is limited.

- Given: A stored or submitted doctrine document
- When: resolveCanonConfig runs
- Then: Non-object input yields the shipped defaults. The five tiers are always kept, with a colour accepted only if it matches ^#[0-9a-f]{3,8}$ and scores clamped to integers 0-100. An entry needs a title and at least one keyword, otherwise it is dropped. A heuristic needs at least one keyword. A reference needs text and at least one keyword. An unknown tier becomes EXTENSION_OFFICIELLE, an unknown category becomes lore, and an unknown reference lang becomes fr. Duplicate ids get a '-2' suffix. Entries beyond 2000, rules beyond 500 and references beyond 20000 are ignored. A reference href is kept only if it is an internal path matching ^/[\w/#?=&.-]*$. A missing score defaults to the tier's score. An explicit empty array is respected as an admin decision.
- Parameters: MAX_ENTREES=2000; MAX_REGLES=500; MAX_REFERENCES=20000; entry keywords <=40 x 80 chars; reference keywords <=24 x 80; doctrine <=16 x 400; verdict <=600; explanation <=4000; reference text <=4000; label <=200; tier definition <=2000; sources <=20 x 300; tier inclut <=24 x 300; score range 0-100; id regex ^[a-z0-9][a-z0-9_.:-]{0,199}$
- Edge cases: A reference with an unknown provenance defaults to 'shenron', while canon-config.ts defaults it to 'manuel'; the two readers disagree ; Power-scaling multipliers, officialBps and tiers are accepted as arrays with no per-item validation ; Entry slug is cut to 60 characters

### Document sanitisation bounds

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2680-2957`

Stored doctrine is re-validated field by field: entries need a title and at least one keyword, references need text and a keyword, scores clamp to 0-100, and element counts are capped.

- Given: A malformed stored or submitted doctrine document
- When: resolveCanonConfig runs
- Then: Entries without title/keywords or heuristics/references without keywords/text are dropped; score = round and clamp 0-100 else tier default (50 if unknown); duplicate ids get '-2' suffix; href must match an internal path regex; explicit empty arrays are honoured
- Parameters: MAX_ENTREES 2000; MAX_REGLES 500; MAX_REFERENCES 20000; verdict <= 600 chars; explanation <= 4000; keywords <= 40 x 80 chars (24 for references); doctrine <= 16 x 400; powerScaling kiriToBpRate default 50000 and planetDestructionKiriFloor default 200 when invalid
- Edge cases: Duplicate-id suffix loop only appends '-2', so a collision repeats the suffix ; powerScaling multipliers/officialBps/tiers arrays are accepted without element validation

### Stored doctrine admission and defaulting rules

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2692-2957`

When a stored doctrine is resolved, topic entries need a title and at least one keyword, scores are clamped 0-100, unknown tiers default to 'official extension', ids are made unique, and citation links must be internal routes.

- Given: A stored or submitted doctrine document
- When: resolveCanonConfig runs
- Then: Entry dropped without title (<=200) or without any keyword (max 40 distinct, each <=80); rule dropped without keywords; reference dropped without text (<=4000) or without keywords (max 24). Unknown tier -> EXTENSION_OFFICIELLE; unknown category -> 'lore'; score = round(clamp 0..100), default = tier's score else 50; tier colour must match #hex 3-8 digits else default; duplicate ids get '-2' appended; reference id kept verbatim if it matches ^[a-z0-9][a-z0-9_.:-]{0,199}$, otherwise slugified (max 60); href kept only if it matches ^/[\w/#?=&.-]*$ (max 300); reference version only if 64 hex chars; updatedAt only if parsable and <=40 chars; unknown lang -> 'fr', unknown provenance -> 'shenron'; verdict max 600, explanation max 4000, sources max 20 x 300, doctrine max 16 x 400, admitted/forbidden sources max 24 x 300. Provided array that is explicitly empty is respected; a missing array falls back to shipped defaults.
- Parameters: MAX entries 2000; rules 500; references 20000; slug length 60; hex colour 3-8 digits
- Edge cases: Duplicate suffix is only '-2' repeated, so a third duplicate becomes 'a-2-2' ; If entries array contains only invalid items, the result is an empty list rather than the defaults

### Five canonicity tiers, default scores and colours

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:27-41, 256-337`

There are five fixed ranks in descending authority, each with a default score.

- Given: Default doctrine
- When: A tier is resolved
- Then: CANON_ABSOLU scores 100 (#22c55e, manga 1-42, Jaco, Minus). CANON_SUPERVISE scores 88 (#3b82f6, DBS manga, recent films, Daima). EXTENSION_OFFICIELLE scores 70 (#eab308, Daizenshuu, Super Exciting Guide). NON_CANON_DERIVE scores 20 (#f97316, fillers, 1986-1995 Toei films, GT, games). APOCRYPHE_FANON scores 0 (#ef4444, rumours, AF, SSJ5).
- Parameters: scores 100/88/70/20/0; colours as listed; tier vocabulary fixed in code
- Edge cases: rangConfig falls back to the default tier, then to the first default tier, if a tier is missing ; The tier vocabulary is not editable, only labels, colours, scores and definitions

### Canon tier vocabulary is closed and ordered

P1 · Lifecycle · confiance High · `apps/site/src/lib/canon-engine.ts:27-45`

Every canon verdict lands in exactly one of five ranks, ordered by authority; the vocabulary cannot be edited, only the labels, colours, scores and definitions around it.

- Given: A stored entry, heuristic or fallback whose tier is any string
- When: The document is resolved
- Then: Only CANON_ABSOLU, CANON_SUPERVISE, EXTENSION_OFFICIELLE, NON_CANON_DERIVE or APOCRYPHE_FANON are accepted; anything else is replaced by EXTENSION_OFFICIELLE (entries/heuristics) or the default fallback tier
- Parameters: 5 tiers; default tier scores 100/88/70/20/0; default colours #22c55e/#3b82f6/#eab308/#f97316/#ef4444
- Edge cases: Unknown tier on an entry silently becomes EXTENSION_OFFICIELLE (a mid-rank), not an error

### Canon tier vocabulary and default authority scores

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:27-45, 256-332`

There are five fixed authority ranks. The manga is supreme and Toei fillers, games and GT are derived. Fan inventions and rumours are apocryphal.

- Given: The canonicity doctrine
- When: A rank is assigned
- Then: CANON_ABSOLU (score 100, #22c55e), CANON_SUPERVISE (88, #3b82f6), EXTENSION_OFFICIELLE (70, #eab308), NON_CANON_DERIVE (20, #f97316), APOCRYPHE_FANON (0, #ef4444). Where sources conflict, the one closest to Toriyama's hand prevails.
- Parameters: tier scores 100/88/70/20/0; the vocabulary is frozen, while labels, colours, scores and definitions are editable
- Edge cases: An unknown tier in the document is coerced to EXTENSION_OFFICIELLE ; rangConfig falls back to the shipped definition, then CANON_ABSOLU, if a tier is missing

### Resolved document defaults: tier score inheritance, invalid tier fallback, id de-duplication, explicit empties respected

P1 · Validation · confiance High · `apps/site/src/lib/canon-engine.ts:2781-2843, 2941-2942`

A stored entry with an unknown tier becomes Extension officielle, a missing score inherits the tier score, duplicate ids get a -2 suffix, and an explicitly empty entry list is respected.

- Given: A stored entry titled 'X' with keyword 'x', tier 'WRONG' and no score, and a second entry with the same slug
- When: The document is resolved
- Then: Tier becomes EXTENSION_OFFICIELLE, score becomes the configured score of that tier (70 by default), category defaults to lore, the second id becomes '<slug>-2' (then '-2-2' on a further collision); an entry without title or without any keyword is dropped; an empty entries array stays empty, whereas a missing one restores the shipped 50+ entries.
- Parameters: slug max 60 chars, fallback 'entree-N' / 'regle-N'; keywords max 40 per entry x 80 chars; sources max 20 x 300; scores rounded and clamped 0-100; invalid tier colour falls back to the default hex

### Stored power-scaling arrays bypass the sanitisation applied to every other field

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-engine.ts:2921-2929; apps/site/src/app/wiki/canon/page.tsx:266-291`

When the stored doctrine is resolved, multipliers, official readings and power tiers are accepted as long as they are arrays, with no per-element checks, while entries, heuristics and references are retyped and bounded.

- Given: A stored powerScaling.multipliers array containing a null element, a string factor or a missing tier
- When: The document is resolved and the public canon page renders the multipliers
- Then: The elements are kept as stored (no length cap, no numeric or tier validation); the page dereferences m.form and m.canonTier on each, so a malformed element can break the public page, unlike the entry list which is dropped when it lacks title or keywords.
- Parameters: entries cap 2,000; heuristics cap 500; references cap 20,000; text caps 600/4,000 chars; no cap for the power arrays

### Version-qualified entries win over generic ones through keyword length weighting (Super Saiyan 4 case)

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-engine.ts:671-762, 2555-2572`

Three Super Saiyan 4 entries exist (generic, GT, DAIMA); adding the series name to the question selects the more specific entry because longer keyword matches score higher.

- Given: Entries: generic SSJ4 (CANON_SUPERVISE, 85), GT (NON_CANON_DERIVE, 20), DAIMA (CANON_SUPERVISE, 85); keyword weight is 2 x length
- When: The question is 'Goku SSJ4 GT'
- Then: Generic scores 'ssj4' (8) + 'goku ssj4' (18) = 26; the GT entry scores 'goku ssj4 gt' (24) + 'ssj4 gt' (14) = 38 and wins, giving Non-canon derive, score 20. 'Goku SSJ4' alone resolves to the generic entry: Canon supervise, 85.
- Parameters: generic 85, GT 20, DAIMA 85; comparison entry ssj4-vs-ssjg refuses a power ranking

## `apps/site/src/lib/canon-examples.ts` (1)

### Canon example shortcuts catalogue

P2 · Policy · confiance Medium · `apps/site/src/lib/canon-examples.ts:1-40`

Five fixed example questions (Broly, Super Saiyan 4 GT, Super Saiyan 4 DAIMA, Gogeta, Bardock) are offered as one-click canon queries, each tied to a work (DBS, GT, DAIMA, DBZ).

- Given: The canon page example chips
- When: A visitor clicks one
- Then: The query string for that example is submitted to the arbiter.
- Parameters: 5 examples, works DBS/GT/DAIMA/DBS/DBZ

## `apps/site/src/lib/canon-judgment.ts` (2)

### Plate judgment admission (public evidence only)

P1 · Policy · confiance High · `apps/site/src/lib/canon-judgment.ts:11-42`

Only plates that have a public excerpt are sent to the AI judge, and the judgment is skipped if none exist or no provider is set.

- Given: Plates already resolved from visible databooks
- When: judgeCanonPlates runs
- Then: Plates without trimmed text are dropped. Each is sent with id 'databook:<id>:<number>', visibility public and providerUseAllowed true. With no evidence the result is the empty judgment 'no_public_evidence'. With no configured provider the result is the empty judgment 'unavailable'.
- Parameters: none
- Edge cases: The text used is the Japanese transcription, not the translation

### Plate judgment: only public excerpts of visible plates reach the provider

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-judgment.ts:13-42`

The AI judge sees only plates that have a Japanese transcription. It returns an empty judgment instead of guessing when there is no public evidence or no provider.

- Given: Plates already resolved from visible databooks
- When: The judge is called
- Then: Plates with a blank texte are excluded. The rest become public evidence with id databook:<id>:<number>, visibility public and providerUseAllowed true. With zero evidence return emptyCanonJudgment('no_public_evidence'). With no configured provider return emptyCanonJudgment('unavailable'). Otherwise call port.judge with the question, the evidence and any continuity. The judge is evidence support only and cannot replace the curated tier.
- Parameters: provider credentials come from env (TYPESAFE_API_KEY, SHENRON_LLAMA_*): <credential, masked, see canon-judgment.ts:35-38>
- Edge cases: Translations (texteFr) are not sent, only the Japanese transcription

## `apps/site/src/lib/canon-preuves-view.ts` (3)

### Canon evidence API view duplicates legacy French field names until 1.4.0

P2 · Policy · confiance High · `apps/site/src/lib/canon-preuves-view.ts:1-57; apps/site/src/app/api/canon/route.ts:99-101,138-139`

The evidence API serves plates, records and suggestions under new English names while keeping the old French names as deprecated duplicates scheduled for removal in version 1.4.0; a judgment is included only when present.

- Given: An evidence result with a judgment, plates and records
- When: canonEvidenceView maps it
- Then: Output has both databookTitle/databookTitre, number/numero, text/texte, verified/verifiee, title/titre, excerpt/extrait and planches/fiches aliases; judgment key is omitted when absent
- Parameters: deprecation removal version 1.4.0
- Edge cases: Aliases are the same arrays or values, not independent copies

### Evidence API view with deprecated French aliases

P2 · Policy · confiance High · `apps/site/src/lib/canon-preuves-view.ts:3-57`

The canon API serves evidence under English names while keeping the former French field names as duplicates until version 1.4.0.

- Given: A CanonPreuves object (planches, fiches, suggestions, mode, optional judgment)
- When: canonEvidenceView builds the API response
- Then: Output has plates, records, suggestions, mode (+ judgment only when present) with English fields; the former names (planches, fiches, numero, texte, texteFr, verifiee, databookTitre, titre, extrait) are duplicated and scheduled for removal in 1.4.0.
- Parameters: deprecation removal version 1.4.0
- Edge cases: judgment key omitted (not null) when absent

### Evidence API view: dual naming and optional judgment

P2 · Policy · confiance Medium · `apps/site/src/lib/canon-preuves-view.ts:9-57`

The evidence response exposes English field names plus the former French names as deprecated duplicates until 1.4.0, and includes the AI judgment only when one exists.

- Given: A canon evidence result with plates, records, suggestions and an optional judgment
- When: The API serialises it
- Then: plates/records/suggestions get English names while planches, fiches, numero, texte, texteFr, verifiee, databookTitre, titre and extrait stay as aliases; judgment key is present only when a judgment exists; mode is passed through.
- Parameters: Deprecated aliases removed in version 1.4.0

## `apps/site/src/lib/canon-preuves.ts` (8)

### Evidence retrieval and ranking behind a verdict (plates and records)

P1 · Calculation · confiance Medium · `apps/site/src/lib/canon-preuves.ts:120-365`

Databook plates and wiki records that back a verdict are fetched, scored and capped. Fillers and mirrors are not shown as proof.

- Given: A verdict whose nature is not troll or empty
- When: canonPreuves runs
- Then: Troll and empty inputs return no evidence. The search query is the first 3 matched keywords longer than 2 characters, joined by spaces, else the raw question. The RAG is called with the question (14 hits) and with the keyword query if it differs. Only internal URLs under /wiki/ with at least 3 segments, or dragonballfr.com URLs, are admitted. Legacy routes are rewritten (/wiki/dragon-ball/character/ becomes /wiki/characters/, and planet becomes locations). Record score = hit score x 1.3 for kinds character, technique, transformation, planet, race, manga_chapter, manga_volume and source, else x 1.0. The top 6 records are kept. The top 6 plates are resolved, and a plate with no image and no text is dropped. Curated databook references add plates with score 1. The AI judgment moves plates that are 'supported' or 'contradicted' to the front. The top 4 plates are returned.
- Parameters: RAG hits 14; canon-core boost 1.3; records kept 6; plate candidates 6; plates returned 4; keywords used 3 with length > 2
- Edge cases: A databook plate defaults to number 1 when no #planche anchor is given ; Databooks with visible=false are excluded in SQL ; Uncertain judgment leaves the order unchanged ; Only the Dragon Ball Fandom mirror domain is rejected, because it is not dragonballfr.com

### Evidence URLs: internal canonical routes only, fan-wiki mirrors refused

P1 · Validation · confiance High · `apps/site/src/lib/canon-preuves.ts:173-188`

Only pages on dragonballfr.com that point to a specific record may be cited as evidence. External sites and index pages are dropped.

- Given: A retrieval hit URL
- When: It is turned into an evidence link
- Then: An absolute URL is accepted only for dragonballfr.com (with or without www). Legacy /wiki/dragon-ball/character/ becomes /wiki/characters/, and /wiki/dragon-ball/planet/ becomes /wiki/locations/. The path must start with 'wiki' and have at least 3 segments. Otherwise it is rejected.
- Parameters: min segments=3; allowed host dragonballfr.com
- Edge cases: /wiki/sagas or /wiki/dragon-ball (index pages) are rejected ; Filtering is by URL, not by kind, to keep own manga passages

### Evidence selection limits and weighting

P1 · Calculation · confiance High · `apps/site/src/lib/canon-preuves.ts:173-188; apps/site/src/lib/canon-preuves.ts:299-365`

Evidence shown with a verdict is internal-only, deduplicated, canon-core records are weighted up, and the counts are capped.

- Given: RAG hits for a question
- When: Evidence is assembled
- Then: Only dragonballfr.com or relative /wiki routes at least two segments deep are kept (legacy character/planet routes rewritten); canon-core kinds (character, technique, transformation, planet, race, manga_chapter, manga_volume, source) get score x 1.3; keep top 6 records, top 6 plate candidates, show top 4 plates
- Parameters: weight 1.3; records 6; plate candidates 6; plates shown 4; RAG limit 14; search query uses up to 3 matched keywords longer than 2 chars
- Edge cases: Fan-wiki mirrors are rejected because only the own domain is admitted ; Curated databook references are injected with score 1

### Evidence search and ranking

P1 · Calculation · confiance High · `apps/site/src/lib/canon-preuves.ts:203-206, 274-365`

Evidence is searched with the verdict's matched keywords for plates and with the raw question for records. Canonical record kinds are boosted 1.3x and the results are capped.

- Given: A question that is not a troll or empty
- When: Evidence is gathered
- Then: Troll and empty inputs return no evidence. The plate query uses up to 3 matched keywords longer than 2 characters, otherwise the raw question. Each query fetches 14 lexical results. Records of kind character/technique/transformation/planet/race/manga_chapter/manga_volume/source score x1.3, others x1.0. The top 6 records are kept, the top 6 plate candidates are resolved, and the top 4 plates are returned. Visible curated databook references with an href are added as plate refs with score 1. Plates the judge calls supported or contradicted are ranked ahead of the rest.
- Parameters: RAG limit 14; keyword count 3; min keyword length >2; canonical boost 1.3; records<=6; plate candidates<=6; plates returned<=4; curated ref score 1
- Edge cases: A refuted plate is promoted beside supporting ones, while an uncertain one leaves the order unchanged ; A RAG failure degrades to no hits, not an error

### No evidence for troll or empty input

P1 · Policy · confiance High · `apps/site/src/lib/canon-preuves.ts:281-285`

Troll or empty questions return no plates or records so the corpus does not lend them credibility.

- Given: verdict.nature is troll or empty
- When: canonPreuves runs
- Then: planches, fiches empty, mode null, only suggestions returned
- Parameters: none

### Judgment-based plate reordering is advisory only

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-preuves.ts:346-363; apps/site/src/lib/canon-judgment.ts:14-42`

A model's judgment can reorder plates (supported or contradicted first) but never changes the curated tier or verdict; judgment is attempted only on visible databook plates with text.

- Given: Plates with transcription text
- When: judgeCanonPlates runs
- Then: Plates without text are excluded; no evidence gives emptyCanonJudgment('no_public_evidence'); no configured provider gives 'unavailable'; plates with relation 'supported' or 'contradicted' sort ahead, others keep order
- Parameters: sourceKind 'databook', visibility 'public', providerUseAllowed true
- Edge cases: Only the Japanese transcription (texte) is sent as excerpt, not the French translation

### Evidence plates: only visible databooks, only plates with content

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-preuves.ts:76-146`

A databook plate counts as evidence only if its databook is visible and the plate has an image or a transcription or translation.

- Given: Plate references pulled from retrieval and from curated references
- When: Plates are resolved
- Then: The join requires bot.db_databooks.visible = true. A plate with no image, no text and no text_fr is discarded. A plate is marked verified only if verifiee === true. A missing plate number defaults to 1. Results are sorted by score descending.
- Parameters: default plate number=1
- Edge cases: A plate with a French translation but unverified review status is still shown, with verified=false

### Evidence plate admission (databook plates)

P1 · Validation · confiance Medium · `apps/site/src/lib/canon-preuves.ts:92-148`

Only plates of visible databooks that carry an image or text count as proof.

- Given: Databook plate references found by search or curated references
- When: resoudrePlanches resolves them
- Then: Join requires databook visible=true; plates with no image, no Japanese text and no French text are discarded; verified flag true only when verifiee===true; sorted by score desc
- Parameters: none
- Edge cases: Plate number missing in URL defaults to 1

## `apps/site/src/lib/canon-yolo-gate.ts` (4)

### AI evidence-selection gate: input and source eligibility

P1 · Validation · confiance High · `apps/site/src/lib/canon-yolo-gate.ts:26-95; apps/site/src/lib/canon-yolo.ts:21-25`

The AI citation-suggestion feature is off by default, and runs only for a non-empty question of at most 400 characters that has at least one valid public source.

- Given: A question and a list of references
- When: The gate is invoked
- Then: If not enabled return null (feature skipped). If enabled but not configured return unavailable. A question that is empty after trim or longer than 400 characters returns unavailable. Up to 16 sources are drawn from the first 256 references, skipping any with visible===false, a missing or oversized id (>300), or non-string subject, source or text. Subject is truncated to 300 characters, text to 3000 (French text preferred) and source to 300. No usable source returns unavailable.
- Parameters: max question length=400; sources<=16 of the first 256; id<=300; subject<=300; text<=3000; source<=300
- Edge cases: assessCanonEvidence re-checks the 400-character limit and the 16-source cap ; Sources are sent with keywords and document blanked

### Evidence decision gate: lifecycle, rate limits and cache

P1 · Lifecycle · confiance Medium · `apps/site/src/lib/canon-yolo-gate.ts:59-147; apps/site/src/lib/canon-yolo-server.ts:7-51`

Model evidence decisions are off unless enabled and configured, throttled by hourly, daily and spacing limits, single-flight, cached 60 s, and degrade to 'unavailable' on any failure.

- Given: Gate enabled with per-hour, per-day and min-spacing options
- When: A question arrives
- Then: Disabled returns null; unconfigured/empty/over-400/no sources returns unavailable; cached result within 60 s is reused; if another different request is in flight returns unavailable; over hour/day counters or within spacing returns unavailable; timeout aborts and returns unavailable; cache holds max 32 entries (oldest evicted)
- Parameters: hour window 3,600,000 ms; day window 86,400,000 ms; cache TTL 60,000 ms; cache size 32; sources max 16 of first 256 refs, id <= 300; enable requires SHENRON_CANON_YOLO_ENABLED='1' plus API key and model set; env limits SHENRON_CANON_YOLO_PER_HOUR/PER_DAY/MIN_SPACING_MS/TIMEOUT_MS (values not in code)
- Edge cases: Unavailable results (including timeouts) are cached for 60 s ; Both a local counter and a global memory limiter apply, so effective limits are the stricter of the two

### AI evidence-suggestion gate: rate limits, caching, single flight

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-yolo-gate.ts:62-147; apps/site/src/lib/canon-yolo-server.ts:8-51; apps/site/src/lib/env.ts:15-21`

An optional AI source suggestion is rate limited globally. It may not change the curated verdict. It gives 'unavailable' whenever any guard fails.

- Given: Evidence assessment enabled with an API key and a model
- When: A question and the references are submitted to the gate
- Then: The result is null if disabled, or 'unavailable' if not configured, if the question is empty or longer than 400 characters, if there are no usable sources, or if hourly, daily, spacing, active or timeout limits are hit. Results are cached for 60 s (max 32 entries, oldest evicted) by the sha256 of the question, sources, model and minimum confidence. Only one request is in flight, and a different concurrent key gets 'unavailable'. The default limits are 30 per hour, 120 per day, 1000 ms spacing and a 3000 ms timeout. Minimum confidence is 0.8.
- Parameters: ENABLED default '0'; MIN_CONFIDENCE 0.8 (0-1); TIMEOUT_MS 3000 (250-10000); PER_HOUR 30 (1-60); PER_DAY 120 (1-1440); MIN_SPACING_MS 1000 (1000-3600000); cache TTL 60000 ms; cache max 32; question max 400
- Edge cases: The counters increment before the model call, so a failed call still consumes quota ; Both a local window and a distributed limiter apply; either one refuses ; A timeout aborts the model call and returns 'unavailable'

### AI evidence-selection gate: rate limits, spacing, caching, timeout

P1 · Policy · confiance High · `apps/site/src/lib/canon-yolo-gate.ts:81-146; apps/site/src/lib/canon-yolo-server.ts:7-50`

AI suggestions are throttled with hourly and daily caps and a minimum spacing, identical questions are cached for 60 seconds, and any failure degrades to unavailable.

- Given: An eligible request
- When: Admission is evaluated
- Then: Return a cached result if it is under 60 s old (cache holds at most 32 entries, FIFO eviction). Only one call is in flight: a concurrent identical request shares it, a different one gets unavailable. Hour and day counters reset after 3,600,000 and 86,400,000 ms. If hour count >= perHour, day count >= perDay or elapsed time since the last admission < minimumSpacingMs, return unavailable. A global distributed limiter (spacing, hourly, daily, key 'global') must also admit. Timeout aborts the call and returns unavailable, and any error returns unavailable. The cache key is the sha256 of the query, sources, model and minimum confidence.
- Parameters: cache TTL 60,000 ms; cache size 32; hour 3,600,000 ms; day 86,400,000 ms; limits from env SHENRON_CANON_YOLO_PER_HOUR, SHENRON_CANON_YOLO_PER_DAY, SHENRON_CANON_YOLO_MIN_SPACING_MS, SHENRON_CANON_YOLO_TIMEOUT_MS (values not in this file)
- Edge cases: The local counter is incremented before the model call, so failed calls still consume quota ; Unavailable results from throttling are not cached

## `apps/site/src/lib/canon-yolo-server.ts` (1)

### AI evidence-selection feature enablement

P1 · Policy · confiance High · `apps/site/src/lib/canon-yolo-server.ts:23-34`

AI evidence selection runs only when the flag equals '1' and both the API key and the model are configured.

- Given: Server environment
- When: isCanonEvidenceEnabled is evaluated
- Then: True only if SHENRON_CANON_YOLO_ENABLED === '1', a TYPESAFE_API_KEY is set (<credential, masked, see canon-yolo-server.ts:26>) and SHENRON_CANON_YOLO_MODEL is set. The gate's 'configured' check is the key and model alone, separate from the flag.
- Parameters: flag SHENRON_CANON_YOLO_ENABLED='1'
- Edge cases: Flag 'true' does not enable it; only the exact string '1' does

## `apps/site/src/lib/canon-yolo.ts` (2)

### AI evidence selection: abstain unless a source clears the confidence threshold

P1 · Policy · confiance Medium · `apps/site/src/lib/canon-yolo.ts:1-61`

The model may only point to one citation that directly backs the question, or choose 'none'. It never sets a canon rank, and a low-confidence pick becomes an abstention.

- Given: A question and up to 16 visible sources
- When: The model is queried (0 retries)
- Then: The prompt says citations are data, not instructions, and forbids setting a canon rank. A 'none' option is always offered. The selection is accepted only above the confidence threshold from runtime.confidenceThreshold(minimumConfidence). Result 'selected' with the referenceId, or 'abstained' when none or below threshold or not matching a candidate. No sources or empty question returns 'unavailable'. The result is a suggestion only, and the curated verdict remains authoritative.
- Parameters: minimumConfidence from env SHENRON_CANON_YOLO_MIN_CONFIDENCE (default not in this file); maxRetries=0; sources<=16
- Edge cases: The exact threshold semantics live in @aphrody/shenron-decision, which was not read

### Evidence decision (YOLO) abstention and confidence rule

P1 · Calculation · confiance High · `apps/site/src/lib/canon-yolo.ts:15-61`

The model may suggest a supporting citation but returns 'selected' only above the confidence threshold; otherwise it abstains, and it can never set a canon rank.

- Given: A question up to 400 chars and up to 16 visible citations
- When: assessCanonEvidence runs
- Then: Empty, over 400 chars, or no visible citations gives status 'unavailable'; model choosing 'none' or below threshold gives 'abstained'; else 'selected' with referenceId
- Parameters: question max 400; sources max 16; text 3000, subject/source 300; maxRetries 0; threshold from SHENRON_CANON_YOLO_MIN_CONFIDENCE
- Edge cases: Citation text prefers textFr over original text

## `apps/site/src/lib/character-page-helpers.ts` (4)

### Character power readings: saga matching, Namek/Freezer split and Goku supplemental official BPs

P1 · Calculation · confiance Medium · `apps/site/src/lib/character-page-helpers.ts:238-393`

A character saga page shows only the official battle-power readings of that character and saga; for characters with a separate Freezer saga, Namek-labelled readings are split into Freezer-phase (BP >= 530,000, state mentioning freezer/frieza, or BP exactly 42,000) and Namek-phase; main Goku gets six hardcoded early-era readings added without duplicating an existing same-BP same-state reading, and results are sorted by BP ascending.

- Given: Main Goku (id 1) saga page 'Saga de Pilaf' with no stored readings
- When: Supplemental table is applied
- Then: Readings 10 (first appearance) and 100 (Ozaru x10) are added; Saiyan saga adds 416 (CANON_ABSOLU, scouter) and Bardock saga adds 2 (EXTENSION_OFFICIELLE); a reading whose bp and state already exist is skipped; final list ascending by bp
- Parameters: Goku BPs: 2, 10, 100, 180, 260, 416; Freezer phase threshold 530000; Freezer reading exact 42000; saga aliases saiyans->saiyan, sagafreezer/frieza->freezer
- Edge cases: Matches by characterId, or by normalised name when the reading has no characterId ; Non-Goku characters never receive supplemental readings ; A Namek reading without freezer saga variant is matched normally

### Character profile panel routing to public tabs

P2 · Policy · confiance Medium · `apps/site/src/lib/character-page-helpers.ts:395-422`

A profile panel is routed by keyword to relations, powers, history, or additional tabs in strict priority order, with power-scaling headings landing in 'powers' even if they contain 'combat'.

- Given: A panel labelled 'Niveaux de combat' (power group)
- When: classifyCharacterProfileBucket runs
- Then: Relations keywords on key/label take priority; then power keywords on key/label/group -> powers; then history keywords -> history; otherwise additional
- Parameters: four buckets: history, relations, powers, additional
- Edge cases: Short token 'ami' and 'ami' inside words (e.g. 'dynamic') will route to relations ; 'forme'/'form' matches many labels

### Transformed-form test and Goku identity classification

P2 · Validation · confiance Medium · `apps/site/src/lib/character-page-helpers.ts:46-57,112-231`

A form string is 'transformed' only if it does not start with base/forme de base/normal and matches a known transformation term; main Son Goku's alternate identities (Xeno, Jump Force, CC, Fusion) are recognised by label keywords and listed in a fixed order, and non-Goku characters just list other versions excluding the current one.

- Given: Current character Son Goku (main) and candidates labelled Xeno, CC, Fusion, Jump Force
- When: buildCharacterLiveVersionChoices runs
- Then: Main entry is omitted when the page is already main Goku; others ordered main(0), xeno(1), cc(2), fusion(3), jumpforce(4), then by id; candidates not rooted at 'songoku' are dropped; for non-Goku characters all versions except the current id are kept
- Parameters: identity order main<xeno<cc<fusion<jumpforce
- Edge cases: Substring test for 'cc' can match unrelated labels containing 'cc' ; Continuity rows take precedence over prefix-matched versions with the same id

### Character transformation progression ordering

P2 · Calculation · confiance Medium · `apps/site/src/lib/character-page-helpers.ts:59-110`

Transformations are listed in a fixed narrative power order by pattern-matched rank (Great Ape 10, false SSJ 20, Kaio-ken 25, SSJ 30, Full Power 32, SSJ2 40, SSJ3 50, Potential/Mystic 55, SSJ4 70/72, SSG 80, SSB 90/92, SSR 94, UI sign 100, UI 110, Ultra Ego/Beast/Orange 120, Golden Great Ape 60, unknown 999) with ties broken by id.

- Given: Transformations 'Super Saiyan 3' and 'Great Ape'
- When: sortCharacterTransformations runs
- Then: Great Ape (10) precedes SSJ3 (50); an unrecognised name ranks 999 (last); equal ranks sort by ascending id
- Parameters: rank table as listed
- Edge cases: First matching regex wins, so order of tests matters (Kaio-ken SSB 92 vs plain SSB 90) ; Golden Great Ape 60 sits between SSJ3 and SSJ4 though tested first ; 'beast' pattern also matches 'bestiale' forms

## `apps/site/src/lib/databooks-audit-traductions.ts` (1)

### Translation audit grading: healthy, suspect, corrupted (quarantine)

P1 · Calculation · confiance Medium · `apps/site/src/lib/databooks-audit-traductions.ts:48-52, 606-631`

A plate translation is graded by summing weighted defect signals: any certain signal or a total of 6 or more means corrupted (quarantine), 3 or more means suspect (flag for review, no action), otherwise healthy.

- Given: A plate with French translation, source text and a set of detected signals with weights
- When: auditerPlanche runs
- Then: score = sum of signal weights; niveau = corrompu if any signal is certain or score >= 6; suspect if score >= 3; else sain. Example: a masking token leak (weight 10, certain) is corrompu; an OCR copy with 6-11 percent noisy tokens (weight 5) is suspect; identical to a Japanese source (weight 10, certain) is corrompu. French OCR copy weight: 8 if noise >= 12 percent, 5 if >= 6 percent, else 2.
- Parameters: SEUIL_CORROMPU=6, SEUIL_SUSPECT=3, noise cut-offs 0.12 and 0.06, weights 8/5/2/10
- Edge cases: Only the 'certain' subset (jeton, copie asiatique) blocks ingestion; non-certain corrupted grades do not stop canon-ingest from publishing the plate

## `apps/site/src/lib/databooks-traduction.ts` (4)

### Databook transcription intake gate (untranslatable signatures)

P1 · Validation · confiance High · `apps/site/src/lib/databooks-traduction.ts:24-81`

A Japanese transcription is refused for translation if it shows simplified-Chinese characters, lowercase Latin glued to Japanese, or a non-consecutive repeated block.

- Given: Transcription text containing a simplified character such as 个, or 'のability', or the same 30-char Japanese block three times
- When: intraduisible(texte) runs
- Then: Returns 'chinois-simplifie', 'latin-colle' or 'boucle-dispersee' (checked in that order); null means translatable. Uppercase Latin acronyms (WJNo, ISBN, GET) and 'Switch版' do not trigger latin-colle. The scattered-loop scan slides a 30-char window by 15 and flags any window containing kana/kanji that occurs 3 or more times
- Parameters: window 30 chars, step 15, repeat threshold 3; Latin run >= 3 lowercase letters; simplified set 个陆这说见门东车马鸟贝长风飞龙业习乡书买卖
- Edge cases: Measured on the corpus: 2,131 of 9,356 plates (23%) hit these signatures ; Occurrences are counted non-overlapping (index += 30)

### Translation intake gate: transcriptions judged untranslatable before paying for translation

P1 · Validation · confiance High · `apps/site/src/lib/databooks-traduction.ts:29-81`

A databook transcription is rejected as untranslatable if it contains simplified-Chinese-only characters, lowercase Latin noise glued to Japanese, or the same 30-character block three or more times.

- Given: A plate transcription containing the character 这 (simplified-only) or 'のability' or a 30-character Japanese block repeated 3 times non-consecutively
- When: intraduisible() is evaluated
- Then: It returns 'chinois-simplifie', 'latin-colle' or 'boucle-dispersee' respectively (checked in that order), and the plate is not sent for translation; otherwise null.
- Parameters: loop check window 30 chars, step 15, threshold 3 occurrences, only windows containing kana/kanji; Latin noise = 3+ lowercase letters adjacent to Japanese
- Edge cases: Uppercase Latin (WJNo, ISBN, GET) is deliberately ignored; counting it would have discarded 3,468 plates instead of about 1,500 ; Lookbehind avoids rejecting 'Switch版' (witch + Japanese)

### Translation deposit refusal rules

P1 · Validation · confiance High · `apps/site/src/lib/databooks-traduction.ts:83-113; apps/site/src/lib/ja/lexique-canonique.ts:102-125`

A French translation is rejected at deposit if empty, too much Japanese remains, it has corruption signatures, or its length is out of proportion to the source.

- Given: French output fr and Japanese source ja
- When: refus(fr, ja) / verifierConformiteTraduction runs
- Then: Returns a refusal reason, evaluated in order: empty after trim -> 'vide'; share of Japanese characters > 15% -> 'N % de japonais résiduel'; contains U+FFFD -> 'défaut remplacement'; contains Cyrillic/Arabic/Thai/Korean -> 'défaut etranger'; repeated-segment loop -> 'défaut boucle'; length > 3.5 x source length -> '(glose)'; length x 6 < source length -> '(tronqué)'; otherwise null (accepted)
- Parameters: PART_JA_MAX 0.15; max length ratio 3.5; min ratio 1/6
- Edge cases: Kanji alongside the French form, such as 'Kaïō-ken (界王拳)', is deliberately allowed ; han-sans-kana and 'courte' verdicts are intentionally not applied to French output ; Source lengths are in UTF-16 units

### Translation output refusal rules (deposit judge)

P1 · Validation · confiance High · `apps/site/src/lib/databooks-traduction.ts:88-113; apps/site/src/lib/ja/normalisation.ts:13-18; apps/site/src/lib/ja/lexique-canonique.ts:73-125`

A French translation of a plate is refused when empty, more than 15% Japanese characters, containing replacement/foreign-alphabet/loop defects, more than 3.5 times the source length (gloss), or less than one sixth of it (truncated); any unrestored masking token also blocks deposit.

- Given: A Japanese source of 100 characters
- When: A French translation is submitted
- Then: Refused if trimmed text is empty ('vide'); if Japanese characters / total characters > 0.15 ('NN % de japonais residuel'); if it has replacement characters, Cyrillic/Arabic/Thai/Hangul, or a loop; if length > 350 ('glose'); if length x 6 < 100, i.e. under 17 characters ('tronque'). A 'Kaio-ken (界王拳)' style gloss is allowed because the Japanese share stays under 15%.
- Parameters: PART_JA_MAX 0.15; max length ratio 3.5; min length ratio 1/6
- Edge cases: han-sans-kana and 'courte' detectors are deliberately not applied to French output ; Masked canonical-term tokens (e.g. Zeta010) tolerate case, accents and separators when restored; a plate with residual tokens must never be deposited

## `apps/site/src/lib/ia-shenron.ts` (2)

### Admin IA cockpit gate separates unauthenticated (401) from non-admin (403)

P1 · Policy · confiance Medium · `apps/site/src/lib/ia-shenron.ts:12-47; apps/site/src/app/api/admin/ai/route.ts:43-46,74-77`

The admin IA API answers 401 with a Bearer challenge when there is no session, and 403 when the session user is not an admin or is not linked to a business user.

- Given: A call to /api/admin/ai
- When: No session -> 401; session whose user.roleAdmin is not strictly true (or user not linked) -> 403; roleAdmin === true -> allowed
- Then: Response is private, no-store; admin passes with author identity discordId, else user id
- Parameters: Cache-Control 'private, no-store, max-age=0'
- Edge cases: roleAdmin must be exactly true, truthy values do not qualify ; Unlike /api/canon-config this route does not accept bearer tokens

### RAG evaluation sample size validation

P2 · Validation · confiance High · `apps/site/src/lib/ia-shenron.ts:57-72`

The evaluation sample count defaults to 25, 0 means the whole gold set, positive integers are capped at 1000, and any other value is refused rather than defaulting to the heaviest run.

- Given: A samples parameter on evaluate_rag
- When: absent -> 25; 0 -> whole set; 5000 -> 1000; '' / -3 / 2.5 / 'abc' -> null (400)
- Then: Returns the effective sample count or null causing HTTP 400
- Parameters: EVAL_DEFAULT_SAMPLES=25; EVAL_MAX_SAMPLES=1000
- Edge cases: Numeric strings are accepted ('10' -> 10) ; Blank string is invalid, not default

## `apps/site/src/lib/ja/traduction.ts` (1)

### Canonical term masking before translation and mandatory token restoration

P1 · Validation · confiance High · `apps/site/src/lib/ja/traduction.ts:40-169; apps/site/src/lib/ja/lexique-canonique.ts:73-100`

Official Dragon Ball names are swapped for neutral tokens before machine translation and restored to the official French form afterwards; any token left unrestored makes the plate unfit to deposit.

- Given: A Japanese text with lexicon terms and a lexicon where each has a French form
- When: protegerTermes / masquerTermes then restaurerJetons run
- Then: Longest match first, single pass, no overlap, only at word boundaries for katakana/Latin (so 'セル' inside 'カプセルコーポレーション' is not masked); at most 16 distinct terms per segment, the rest stay in clear and are counted as overflow; a term without a French form is not masked; restoration tolerates case, accents and a separator ('Zêta010', 'ZETA 001'), absorbs an immediate duplicate, and returns residual tokens which must be empty or the plate must not be deposited
- Parameters: MAX_TOKENS 16; token prefix DEFAULT_TOKEN_PREFIX (Zeta/Yuni style)
- Edge cases: Terms beyond 16 distinct ones are translated by the model without protection ; Lexicon core forms drop prefixes '未来の', '少年', '幼少期の', suffix 'ゼノ' and trailing parentheses (noyaux, databooks-traduction.ts:134-143), keeping the stripped form only if >= 2 chars

## `apps/site/src/lib/manga-search-rules.ts` (1)

### Manga plate and episode scene relevance score (0-100)

P1 · Calculation · confiance High · `apps/site/src/lib/manga-search-rules.ts:17-150; apps/site/src/lib/manga-api.ts:356, 444-560; apps/site/src/lib/scene-search.ts:31-79; apps/site/src/app/wiki/canon/page.tsx:27-34`

Plates and scenes shown under a canon verdict are ranked by a score: exact phrase 50, share of query words found 30, damped frequency 10, trigram similarity 10, with a 0.6 penalty on near-empty OCR text.

- Given: Query 'kamehameha' against a transcribed plate containing it once among at least 12 letters, all query words found, Postgres word similarity 0.8
- When: The plate is scored
- Then: score = 50 (exact, compact form so OCR splits like 'KAMEHA-MEHA' still match) + 1.0 x 30 + min(10, log2(1+1) x 5 = 5) + 0.8 x 10 = 93. If the compact plate text has fewer than 12 characters the score is multiplied by 0.6 (55.8). Plates with score 0 are dropped; ties sort by series, volume, plate number.
- Parameters: weights 50/30/10/10; short-text penalty x0.6 below 12 compact chars (below 6 for Japanese); typo tolerance 2 edits if the longer word has >= 8 letters, 1 if >= 5, else 0; trigram recall threshold 0.45 (plates) and 0.5 (scenes); plate candidates min(1000, max(100, (offset+limit) x 4)); limit capped 1..100 (plates) and 1..30 (scenes); query truncated to 120 chars, minimum 2; canon page asks for 6 of each, cached 600 s
- Edge cases: Queries of 3 characters or fewer are exact only as a whole word (so 'ki' does not match 'kinto'), but the word-coverage term still accepts substrings ; Japanese queries: exact = 60 + min(10, log2(occ+1) x 5), otherwise coverage x 50, plus similarity x 10; punctuation stripped before comparing ; Scenes search only the title and synopses of episodes where visible is not false ; Plate and scene recall thresholds differ (0.45 vs 0.5)

## `apps/site/src/lib/toriyama-words.ts` (3)

### Toriyama words listing: scope filter, visible databooks only, chronological order with undated last

P1 · Lifecycle · confiance High · `apps/site/src/lib/toriyama-words.ts:167-270`

Only author-voice references are listed, filtered by scope (all / interviews / profile), linked only to visible catalogue databooks, grouped by work and sorted oldest first with undated works at the end; unreachable sources shrink the list instead of failing.

- Given: The canon corpus and the databook catalogue (paged by 200)
- When: scope='interviews' keeps only interview documents; scope='profile' keeps only non-interview; hidden databooks are not indexed; works with no year sort after dated ones
- Then: Interview catalogue books with no citation still appear as empty groups unless scope='profile'; group year falls back to the databook's published year; errors in either source yield empty lists
- Parameters: page size 200; published_at in seconds (UTC year)
- Edge cases: Break out of pagination loop on an empty page ; Hidden databooks are never linked ; Two titles (EN and JA) index the same book

### Toriyama interview-book detection

P1 · Policy · confiance High · `apps/site/src/lib/toriyama-words.ts:39-69`

A databook is an interview of Toriyama if not excluded and either its kind is 'interview' or it mentions Toriyama together with an interview keyword; a reference is an interview document if its book is one or its source/document text has an interview keyword.

- Given: A databook record or a reference
- When: Title/author/description contains an excluded marker -> false; kind==='interview' -> true; else Toriyama (or 鳥山明) and one of interview|entretien|ask akira|q&a|wired japan -> true
- Then: The citation is routed to the interviews corpus rather than the Toriyama profile corpus
- Parameters: interview regex, 6 excluded markers; extra reference markers: shenlong times, super interview, dragon ball forever
- Edge cases: Word 'Toriyama' alone is never sufficient

### Author-voice classification of canon references (Toriyama's own words)

P1 · Policy · confiance Medium · `apps/site/src/lib/toriyama-words.ts:80-136`

A canon reference counts as Toriyama's own statement only if it is not from an excluded editorial product and either its document is on a closed list of fully author-authored works or its source/subject contains an author-voice marker.

- Given: A canon reference with source, document and subject
- When: The text contains an excluded marker (special anime, the world special, carddass, perfect file, shin budokai, flying postman) in source/document/subject
- Then: It is rejected as author voice even if it matches others; otherwise accepted if its lowercase trimmed document is in the 7-entry author document set, or its source+subject contains one of 16 markers (interview, entretien, shenlong times, q&a, hetappi, tankobon, ...)
- Parameters: AUTHOR_DOCUMENTS (7 titles); AUTHOR_VOICE_MARKERS (16); EXCLUDED_MARKERS (6)
- Edge cases: Exclusion wins over the author-document list ; Document is matched by exact string; the markers are checked against source and subject only, not document ; Substring matching: 'ami'-like short markers do not exist but 'q&a' and 'interview' can match unrelated subjects

## `crates/dragon-pixel/src/canon_story.rs` (1)

### Canon story manifest contract

P2 · Validation · confiance Medium · `crates/dragon-pixel/src/canon_story.rs:7-126; packages/engine/src/games/canon-scenario.ts:85-109,141-162`

The Rust and TypeScript sides share one story manifest shape; every chapter must carry a player, enemy, references and dialogue, and the shipped manifest must have version 1.0.0, Toriyama as author, at least 10 sagas and 10 chapters.

- Given: data/games/canon-story-manifest.json
- When: The Rust test or the TS resolver loads it
- Then: All fields except $schema and boss_hp are mandatory in Rust (deserialisation fails otherwise); the Rust test asserts version '1.0.0', source_author 'Akira Toriyama', sagas >= 10, chapters >= 10, and chapter id 7 is tome 27, manga chapter 318 and cites 'Daizenshuu 7'. Dialogues render in 'fr', 'ja' or 'bilingual' (default) mode; getCanonChapter returns undefined for an unknown id
- Parameters: min sagas 10; min chapters 10; version 1.0.0
- Edge cases: The TS side casts the JSON without validation, so a malformed manifest is not caught at runtime ; The TS style union (balanced, rush, power, trickster, brute, team, boss) is not enforced by the Rust struct (plain string)

## `data/games/canon-story-manifest.json` (1)

### Game chapter power levels beyond Namek contradict the doctrine and are display-only

P1 · Policy · confiance Medium · `data/games/canon-story-manifest.json:549-557, 613-621, 677-685; packages/engine/src/games/canon-scenario.ts:111-136; apps/site/src/components/games/CanonGameView.tsx:245-248, 571-578`

The game manifest gives numeric power levels to Cell, Buu and Beerus chapters (1.2 billion up to 15 billion) although the doctrine says Toriyama stopped numbers after Namek, and the computed damage multiplier is only shown, never applied to damage.

- Given: Chapter 6 Goku 8,200 vs Vegeta 18,000, chapter 7 150,000,000 vs 120,000,000, chapter 10 10,000,000,000 vs 15,000,000,000
- When: computeCanonPowerMultiplier runs
- Then: Chapter 6: log difference -0.34, multipliers 0.95 player and 1.05 enemy, scouter ratio 0.46; chapter 7: 1.01 and 0.99, ratio 1.25; chapter 10: 0.97 and 1.03, ratio 0.67. These values appear in the HUD only; the engine uses fixed damage (player 6 light / 14 heavy, enemy 5 / 12) and a boss HP of boss_hp (default 150) against a 100 HP player.
- Parameters: multiplier = clamp(1 +/- 0.15 x log10 ratio, 0.65, 1.45); boss_hp 90-300 per chapter; power levels for chapters 8-10 are not in the canon officialBps table

## `packages/config/src/databooks-defauts.ts` (2)

### Human-verified plate flag overrides mechanical defects

P1 · Policy · confiance High · `packages/config/src/databooks-defauts.ts:169-206`

A plate that a reviewer has compared with the scan is treated as healthy whatever the mechanical signatures say, except that an empty plate stays empty.

- Given: A plate object with verifiee === true and text '3月号 COVER' (defect han-sans-kana)
- When: defautDePlanche(planche, texte) runs
- Then: Returns null (healthy). If the text is empty it still returns 'vide'. Only a strict boolean true counts; any non-object plate is not verified
- Parameters: flag key 'verifiee' (with verifiee_par, verifiee_le stored in the plate jsonb)
- Edge cases: Flag can be removed to restore the warning banner ; Flag does not change the stored text, only the verdict

### Transcription defect classification and quality score

P1 · Calculation · confiance High · `packages/config/src/databooks-defauts.ts:34-167`

A transcription is classified by mechanical failure signatures, and two versions of the same plate are ranked so that a defect-free text beats any defective one, then the longer text wins.

- Given: A transcribed plate text
- When: classerDefaut / noteQualite run
- Then: Defect order: '' -> vide; contains U+FFFD -> remplacement; Cyrillic/Arabic/Thai/Korean -> etranger; ideographs without any kana (and not recognised traditional Chinese: >= 20 chars with at least one distinctive traditional character) -> han-sans-kana; repeated 4-40 char segment 3+ times in a row (not a single repeated character, not a markdown table separator, not punctuation or lines each <= 15 chars, not '次Pへ') or 40+ identical letters/digits in a row -> boucle; length < 15 -> courte; else healthy. Score = base*1,000,000 + min(length, 999,999) with base 10 healthy, 3 courte, 2 han-sans-kana/etranger, 1 remplacement/boucle, 0 vide
- Parameters: SEUIL_COURT 15; loop segment 4-40 chars x3; single-sign loop 40; traditional Chinese min length 20; score bases 10/3/2/1/0
- Edge cases: A cover with only '3月号 COVER' is flagged han-sans-kana/courte despite being correct ; A repeated block made only of one character (stars, full-width spaces) is layout, not a loop

## `packages/config/src/economy-canon.ts` (3)

### Canon inflation ceiling factor (x2.96)

P1 · Policy · confiance Medium · `packages/config/src/economy-canon.ts:10-14,89-90`

The server's price index may never exceed the series' own inflation: the Tenkaichi Budokai prize going from 500,000 to 1,480,000 zeni, a factor of 2.96.

- Given: Budokai prize 500,000 at start and 1,480,000 at end of series
- When: The default price-index ceiling is needed
- Then: ceiling = 1,480,000 / 500,000 = 2.96
- Parameters: CANON_INFLATION_FACTOR = 1,480,000 / 500,000 = 2.96; overridable by setting economy.inflation.ceiling (apps/bot/src/services/InflationService.ts:112-115,156)
- Edge cases: The public shop endpoint reports ceiling: CANON_INFLATION_FACTOR (apps/bot/src/api/server.ts:1821) even if economy.inflation.ceiling was overridden, while status() reports the override

### Canon price grid and 'canon equivalent' of an amount

P1 · Calculation · confiance High · `packages/config/src/economy-canon.ts:34-40, 43-87, 90, 97-107; apps/site/src/app/shop/ShopGrid.tsx:80-85`

Shop prices are annotated with the most expensive canon price (taxi 65, Capsule 200,000, house 500,000, Budokai 500,000, ...) that fits in the amount; canon inflation is the Budokai price rise 500,000 to 1,480,000, a factor of 2.96, and 1 zeni equals 1 yen.

- Given: The canon grid: taxi 65; Capsule 200,000; house 500,000; Budokai 500,000; late Budokai 1,480,000; aircar 10,000,000; Baba 10,000,000; Tao Pai Pai 100,000,000
- When: canonEquivalent is asked for 1,000,000 zeni
- Then: The best reference is the Budokai (500,000, because on equal prices the later grid entry wins over the house) and times = floor(1,000,000 / 500,000) = 2. For 30 zeni the answer is null (below the smallest reference). The inflation ceiling is 1,480,000 / 500,000 = 2.96.
- Parameters: ZENI_YEN_PARITY ratio 1 (Super Exciting Guide, plate 93); CANON_INFLATION_FACTOR 2.96; 8 reference prices sourced to Chozenshu 4 plate 40
- Edge cases: Zero, negative or non-finite amounts return null ; Tie-break uses >= so later entries win: Budokai over house at 500,000 and Baba over aircar at 10,000,000 ; The shop page has its own copy of the function that returns the fractional ratio (e.g. 2.3) while the bot-side shared function returns floor(); the two copies can display different counts ; The public shop payload advertises ceiling = the constant 2.96 even if the setting economy.inflation.ceiling was changed

### Canon price grid and nearest-landmark equivalent

P1 · Calculation · confiance High · `packages/config/src/economy-canon.ts:42-105`

A zeni amount is expressed as a multiple of the most expensive official price landmark that fits inside it; below the cheapest landmark (65) no equivalent is shown.

- Given: Landmark grid: taxi 65, capsule 200,000, house 500,000, budokai 500,000, budokai_late 1,480,000, aircar 10,000,000, baba 10,000,000, taopaipai 100,000,000
- When: canonEquivalent(1_000_000) is called (and for 30, 0, NaN)
- Then: 1,000,000 returns the budokai landmark with times = floor(1,000,000 / 500,000) = 2; 30 returns null; 0, negative or non-finite returns null; at an exact tie (house vs budokai at 500,000, aircar vs baba at 10,000,000) the later entry in the grid wins because the comparison is >=
- Parameters: CANON_PRICES values in zeni (65; 200,000; 500,000; 500,000; 1,480,000; 10,000,000; 10,000,000; 100,000,000); ZENI_YEN_PARITY.ratio = 1; times is floored
- Edge cases: Amounts of 100,000,000 or more always map to taopaipai, even for huge multiples ; A tie is decided by array order, so reordering the grid changes the displayed landmark ; The site shop re-implements this function (apps/site/src/app/shop/ShopGrid.tsx:81-85) without the finite/positive guard and with a fractional times (zeni / price) instead of floor

## `packages/config/src/inflation-rules.ts` (5)

### Daily price index computation

P1 · Calculation · confiance Medium · `packages/config/src/inflation-rules.ts:11-36`

Prices follow the money supply with an elasticity below 1, move at most a set percentage per day, never fall below 1 and never exceed the ceiling.

- Given: referenceSupply 1,000,000, elasticity 0.5, maxDailyChange 0.02 (2%), previousIndex 1, floor 1, ceiling 2.96
- When: computeIndex runs with supply 4,000,000
- Then: target = 4^0.5 = 2.0; clamped to previous*(1+0.02) = 1.02; result 1.02 rounded to 4 decimals. With supply 100 the result is 1 (floor). With supply = 1e15, previous 2.95 and maxDailyChange 1 the result is 2.96 (ceiling)
- Parameters: floor default 1; ceiling default 2.96; elasticity clamped to [0,1]; maxDailyChange clamped to [0,1]; settings defaults economy.inflation.elasticity 0.5, economy.inflation.max_daily_change 0.02; rounding to 4 decimals
- Edge cases: previousIndex not finite or <= 0 is treated as 1 ; referenceSupply <= 0 or supply <= 0 returns the previous index clamped to [floor, ceiling] with no recalculation ; A negative or >1 elasticity is silently clamped, not rejected

### Daily price index follows money supply with elasticity, daily step cap, floor 1 and canon ceiling

P1 · Calculation · confiance Medium · `packages/config/src/inflation-rules.ts:26-37`

The shop price index is the supply ratio raised to an elasticity power, moved at most a few percent per day from yesterday's index, never below 1 and never above the canon Budokai inflation factor.

- Given: A reference money supply of 1,000,000 zeni, elasticity 0.5, max daily change 0.02, previous index 1.00, ceiling 2.96, floor 1
- When: The daily snapshot computes the index for a supply of 4,000,000 zeni
- Then: target = (4,000,000 / 1,000,000)^0.5 = 2.0, but it is clamped to previous x (1 + 0.02) = 1.02, so the stored index is 1.02 (rounded to 4 decimals). A supply of 100 gives target 0.01 and the index stays at the floor 1. With previous 2.95, step 100% and supply 1e15 the index is capped at 2.96.
- Parameters: floor default 1; ceiling default CANON_INFLATION_FACTOR (2.96); elasticity clamped to [0,1] (setting default 0.5); max daily change clamped to [0,1] (setting default 0.02); rounding to 4 decimals
- Edge cases: referenceSupply <= 0 or supply <= 0: the previous index is returned, clamped to [floor, ceiling] ; previousIndex not finite or <= 0 is treated as 1 ; elasticity outside 0..1 is clamped, so supply cannot amplify prices more than proportionally ; The index can fall by up to the same daily step, but never below 1, so there are no sales

### Indexed price rounding to readable steps

P1 · Calculation · confiance Medium · `packages/config/src/inflation-rules.ts:38-48`

An indexed shop price is rounded to a readable step that grows with the amount, and is never lower than that step.

- Given: Base price 5,000 and index 1.037
- When: indexedPrice(5000, 1.037) is computed
- Then: raw = 5,185; step is 100 (raw between 1,000 and 10,000); result 5,200. 50,000 x 1.02 = 51,000; 999,999 x 1 = 1,000,000; base 0 or negative returns 0
- Parameters: Steps: raw < 1,000 -> 10; < 10,000 -> 100; < 100,000 -> 500; < 1,000,000 -> 5,000; otherwise 50,000; minimum result = the step; invalid index treated as 1
- Edge cases: Because of the minimum, a base price of 1 costs 10 once indexed ; With index 1 the bot bypasses rounding entirely (EconomyService/InflationService.priceOf returns the base price), so rounding only applies when index != 1

### Indexed shop price rounded to a readable step that grows with the amount

P1 · Calculation · confiance Medium · `packages/config/src/inflation-rules.ts:39-47; apps/bot/src/api/server.ts:1860-1864`

The price actually charged is base price times index, rounded to a step of 10, 100, 500, 5,000 or 50,000 depending on the size of the raw amount, and never lower than that step.

- Given: Index 1.037 and a base price of 5,000 zeni
- When: The effective price is computed
- Then: raw = 5,185, step = 100 (raw between 1,000 and 10,000), price = 5,200. Base 50,000 at index 1.02 gives raw 51,000, step 500, price 51,000. Base 999,999 at index 1 gives raw 999,999, step 5,000, price 1,000,000.
- Parameters: steps: raw < 1,000 -> 10; < 10,000 -> 100; < 100,000 -> 500; < 1,000,000 -> 5,000; otherwise 50,000
- Edge cases: base <= 0 or not finite returns 0 ; index not finite or <= 0 is treated as 1 ; minimum price is one step (a raw 4 zeni becomes 10) ; The step is chosen on the raw amount, so a price can round up across a band boundary (999,999 becomes 1,000,000) ; When index is exactly 1 the public shop and the service return the base price untouched, skipping rounding

### Seven-day price change percentage

P2 · Calculation · confiance High · `packages/config/src/inflation-rules.ts:50-54; apps/bot/src/services/InflationService.ts:146-159`

The displayed price change is the signed percentage between two indices, to one decimal, and 0 when the starting index is not positive.

- Given: from = 1, to = 1.05
- When: changePercent runs
- Then: 5 (percent, one decimal); from = 0 gives 0. The 'week ago' point is the 8th most recent snapshot, or the oldest one, or 1
- Parameters: rounding to 0.1 %; history window 60 rows; week-ago offset index -8
- Edge cases: With fewer than 8 snapshots the baseline is the oldest snapshot, so the 'weekly' figure covers a shorter period

## `packages/engine/src/games/canon-game-engine.ts` (6)

### Canon game match lifecycle (intro, fighting, beam clash, victory, defeat)

P1 · Lifecycle · confiance High · `packages/engine/src/games/canon-game-engine.ts:101-101, 204-211, 349-370, 399-402, 421-423, 444-470, 486-492; apps/site/src/components/games/CanonGameView.tsx:227-243, 481-550`

A story-mode fight moves through five states: it starts at intro, the player must click to enter fighting, a mutual super move enters beam clash, and victory or defeat are terminal states that only a restart leaves.

- Given: A chapter loaded in the Canon game (enemy HP 150 by default, player HP 100)
- When: The state changes as follows. Intro to fighting happens on the 'Engager le Combat' click. Fighting to beam_clash happens when both fighters are in beam_special at once. Fighting to victory happens when enemy HP reaches 0, which also sets dramaticFinishTriggered. Fighting to defeat happens when player HP reaches 0. Beam clash returns to fighting if both survive, or ends in victory or defeat if the loser's HP reaches 0.
- Then: The simulation tick only runs physics, AI and collisions in 'fighting' and only the clash timer in 'beam_clash'. In 'intro', 'victory' and 'defeat' nothing advances. 'Rejouer' and 'Réessayer' build a new engine already in 'fighting', skipping the intro dialogue. 'Chapitre Suivant' is offered only on victory and only when currentChapterId < number of chapters. Example: after enemy HP drops from 8 to 0 on a 14-damage heavy hit, matchState becomes 'victory' and the victory overlay shows the first dialogue_victory line.
- Parameters: enemy HP default 150 (boss_hp overrides); player HP 100; clash length 180 frames; clash ends early when either energy >= 100; tie in clash energy goes to the enemy
- Edge cases: Retry after defeat skips the intro state ; Next-chapter button relies on chapter id equalling its index (id < chapters.length) ; No progress, score or reward is persisted on victory

### Game state machine: hitstun never expires and the enemy never moves

P2 · Lifecycle · confiance Medium · `packages/engine/src/games/canon-game-engine.ts:204-211, 236, 312-341, 373-381, 406-414, 449, 462`

A fighter placed in the hitstun state is never returned to another state, and only the player runs the movement/ki-regeneration step, so melee exchange effectively stops after the first hit.

- Given: A fight in state 'fighting'
- When: The player lands one light or heavy attack within 70 units
- Then: The enemy is set to 'hitstun' (hp -6 or -14) and the collision test requires e.state != 'hitstun' for further player hits, while no code resets it; likewise a hit on the player sets 'hitstun', which also skips the whole movement and attack block. Only beam clashes (enemy -45 / player -40) and the 7-ball wish keep changing HP. updateEnemyAi sets enemy velocity but the enemy position and ki regeneration are never integrated (only the player passes through updateFighterPhysics).
- Parameters: enemy AI: every 45 frames within 180 units pick light 50%, heavy 30%, else beam if ki >= 100 with 30% (6% overall); chase speed 3.5 beyond 180 units

### Fight damage, ki and combo rules

P1 · Calculation · confiance Medium · `packages/engine/src/games/canon-game-engine.ts:231-310, 343-425`

Attacks within 70 units deal fixed damage, specials and ki blasts cost ki, and ki refills slowly and on hits.

- Given: A player (HP 100, ki 100 of 700) facing an enemy (HP boss_hp default 150)
- When: Frames tick in 'fighting' state
- Then: Player light 6, heavy 14; enemy light 5, heavy 12; hit requires distance < 70 and target not in hitstun. Super move needs ki >= 100 (costs 100); ki blast needs ki >= 15 (costs 15); player hit grants +25 ki; passive regen +0.15 ki/frame up to 700. Enemy hit resets player combo count/damage; player hit increments combo. Player HP 0 -> defeat; enemy HP 0 -> victory with dramatic finish. Movement speed 5.5, jump power 14, gravity 0.8, x clamp -480..480. Enemy AI acts every 45 frames in range: 50% light, 30% heavy, remaining 20% special only if ki >= 100 and a further 30% roll; chases at 3.5 when farther than 180.
- Parameters: damage 6/14/5/12; ki costs 100/15; hit range 70; regen 0.15/frame; boss_hp default 150; AI period 45 frames; AI chase distance 180
- Edge cases: Special takes priority over heavy over light over ki blast in the same frame ; Enemy boss_hp comes from the chapter manifest

### Fighter hitstun and beam_special states are never exited (suspected soft-lock)

P1 · Lifecycle · confiance Medium · `packages/engine/src/games/canon-game-engine.ts:236-281, 312-340, 373-424, 448-463`

Once a fighter enters hitstun or beam_special, no code returns it to a normal state, and movement, attacks and the enemy AI are all disabled in those states.

- Given: A fight in 'fighting' state with the player landing a light attack at distance < 70
- When: The enemy is put in 'hitstun' (line 380). Movement and AI are skipped while state is hitstun or beam_special (lines 236, 318), and new hits are skipped while state is hitstun (lines 376, 409). No assignment ever moves a fighter out of hitstun.
- Then: The enemy stays frozen and can never take another melee hit. comboCount therefore stays at 1, so the 'every 3rd combo hit awards a Dragon Ball' rule and the 7-ball Shenron wish cannot be reached by play. The enemy HP cannot go below roughly 144 to 136, so victory is unreachable. The same freeze hits the player after the first enemy hit. A lone super move (player at ki >= 100) leaves the player in beam_special with no damage and no exit, because damage only comes from a mutual clash.
- Parameters: light damage 6, heavy 14 (player); 5 and 12 (enemy); super costs 100 ki

### Beam clash resolution

P2 · Calculation · confiance High · `packages/engine/src/games/canon-game-engine.ts:348-370, 427-472`

When both fighters use a beam special simultaneously, a 3-second energy tug-of-war decides who takes a heavy hit.

- Given: Both fighters in beam_special state
- When: Clash starts
- Then: Energies start 50/50, duration 180 frames. Each frame the player mashing (light, heavy or ki blast input) gives player +2.5 and enemy -2.5, else enemy +0.8 and player -0.8 (clamped 0..100). Ends at 0 frames or either energy 100. If player energy > enemy: enemy loses 45 HP (victory if 0 HP else back to fighting). Otherwise (including a tie): player loses 40 HP (defeat if 0 HP).
- Parameters: duration 180 frames; mash +2.5/-2.5; idle drift 0.8; player win damage 45; enemy win damage 40
- Edge cases: A tie goes to the enemy ; The clash only ends by the player's mash rate or the timer, enemy AI has no mash input

### Dragon Ball collection and Shenron wish

P2 · Lifecycle · confiance High · `packages/engine/src/games/canon-game-engine.ts:392-398, 474-484`

Every third consecutive player hit awards one of seven Dragon Balls, and with all seven the player may summon Shenron once to fully heal HP and ki.

- Given: Player landing hits with combo counter incrementing
- When: comboCount % 3 === 0 and fewer than 7 balls are held
- Then: +1 Dragon Ball. When summon is requested, all 7 collected and not yet summoned: shenronSummoned = true, HP = maxHp (100), ki = maxKi (700); cannot be repeated.
- Parameters: balls needed 7; one ball per 3 combo hits; wish limit 1 per match
- Edge cases: Combo resets to 0 when the player is hit, so balls need 3 hits per ball within unbroken combos but already-earned balls persist ; Restart creates a new engine, resetting the wish

## `packages/engine/src/games/canon-scenario.ts` (2)

### Game power-level damage multiplier

P1 · Calculation · confiance High · `packages/engine/src/games/canon-scenario.ts:111-136; apps/site/src/components/games/CanonGameView.tsx:245-248`

Relative power levels are compared on a log10 scale: each decade of difference shifts the damage multiplier by 15%, clamped between 0.65 and 1.45.

- Given: Player power 1,000,000 and enemy power 1,000
- When: computeCanonPowerMultiplier is called
- Then: diff = log10(1e6) - log10(1e3) = 3; player multiplier = clamp(1 + 3 x 0.15, 0.65, 1.45) = 1.45; enemy multiplier = clamp(1 - 0.45, ...) = 0.65 (both rounded to 2 decimals); scouterRatio = 1,000.00. Powers below 1 are floored to 1.
- Parameters: slope 0.15 per decade; min 0.65; max 1.45; rounding 2 decimals
- Edge cases: Zero or negative power treated as 1 ; Equal powers give 1.00 / 1.00

### Power-level multiplier and ki blast have no effect on combat outcome

P1 · Calculation · confiance High · `packages/engine/src/games/canon-scenario.ts:115-136; apps/site/src/components/games/CanonGameView.tsx:245-248, 575-579; packages/engine/src/games/canon-game-engine.ts:274-280, 378, 411, 538-551`

The log-scaled power-level damage multipliers (0.65x to 1.45x) are computed but only the scouter ratio is displayed. Damage in the engine uses fixed values, and a ki blast is only a particle that costs 15 ki and hurts nobody.

- Given: A chapter where player power level is 150,000,000 and enemy is 120,000,000
- When: The view calls computeCanonPowerMultiplier and the engine resolves hits
- Then: The scouter ratio (1.25x) is shown in the lore panel. The player and enemy damage multipliers are never passed to the engine, so damage stays 6/14 for the player and 5/12 for the enemy regardless of power level. Pressing ki blast spends 15 ki and spawns a particle with no collision or damage.
- Parameters: multiplier = clamp(1 + 0.15 x (log10 player - log10 enemy), 0.65, 1.45); ki blast cost 15

## `packages/pipeline/src/ai/canon-eval.ts` (1)

### Canon judgment evaluation metrics

P2 · Calculation · confiance High · `packages/pipeline/src/ai/canon-eval.ts:32-121`

Judge quality is measured by accuracy, false-support rate, supported recall, MRR, nDCG@6, Brier score and latency against reviewed gold labels, with a lexical baseline.

- Given: Eval cases with expected relation, relevant evidence ids and reviewed ground truth
- When: Results are computed and aggregated
- Then: Baseline: relation 'supported' if the lexical citation verifier cites >=1 passage, else 'not_established'. Reciprocal rank = 1/(rank of first relevant id), 0 if none, null when no gold ids; nDCG at k=6 on accepted (supported/contradicted) evidence. Brier = sum over relations of (p_r - [r == expected])^2 on the first relevant evidence (else the first). Aggregates: accuracy = correct/rows; falseSupportRate = non-supported-expected rows answered 'supported' / non-supported rows; supportedRecall = supported-expected rows answered supported / supported rows; abstentions = rows with null relation; means skip nulls.
- Parameters: nDCG cutoff k = 6
- Edge cases: Empty input gives null aggregates ; A mixed judgment counts as incorrect for any single expected relation

## `packages/pipeline/src/ai/canon-judgment.ts` (3)

### Aggregate canon relation across evidence

P1 · Calculation · confiance Medium · `packages/pipeline/src/ai/canon-judgment.ts:3-7, 124-135`

The overall relation combines per-source verdicts: supported and contradicted together give 'mixed', otherwise the strongest present relation wins, and 'not_established' only counts if nothing stronger exists.

- Given: Per-evidence relations among supported, contradicted, not_established, continuity_mismatch or null
- When: canonRelation is computed
- Then: Ignore null and not_established when building the accepted set. supported + contradicted -> 'mixed'; supported -> 'supported'; contradicted -> 'contradicted'; continuity_mismatch -> 'continuity_mismatch'; else 'not_established' if any item says so; else null (abstention). Example: [supported, not_established] -> supported; [contradicted, continuity_mismatch] -> contradicted.
- Parameters: precedence: mixed > supported > contradicted > continuity_mismatch > not_established > null
- Edge cases: Empty list or all null gives null ; continuity_mismatch is overridden by any supported or contradicted

### Public evidence admission for the pipeline judge

P0 · Validation · confiance High · `packages/pipeline/src/ai/canon-judgment.ts:49-122`

Only public, provider-cleared, https evidence from a known source kind, with a non-empty id and excerpt, not on Fandom and not a collection receipt, reaches the AI judge, capped at 6 sources of 700 characters.

- Given: A list of candidate evidence items for a question
- When: publicCanonEvidence runs
- Then: Reject when visibility != 'public', providerUseAllowed !== true, sourceKind not in {manga,toriyama,databook,official,wiki}, trimmed id or excerpt empty, id already seen, url unparsable, protocol not https, url has username/password, hostname is fandom.com or *.fandom.com, path matches /wiki/source-<12+ hex>, or excerpt contains 'Cette fiche décrit un document collecté'. Survivors: excerpt sliced to 700 chars, url normalized, first 6 kept in input order.
- Parameters: maxEvidence 6; maxExcerptCharacters 700; maxQuestionCharacters 400; timeoutMs 8000; rubric version canon-evidence-1
- Edge cases: Fandom is blocked only by hostname; a mirror on another domain is not detected here ; The 6-item cap applies after filtering, so rejected items do not consume slots ; Question length cap and timeout are declared but enforced elsewhere (not in this file)

### Minimum judgment confidence

P1 · Policy · confiance Low · `packages/pipeline/src/ai/canon-judgment.ts:49-56`

The judging policy declares a 0.8 minimum confidence for accepting a model's per-source relation.

- Given: A model-produced evidence judgment with a confidence value
- When: The judgment is accepted
- Then: Policy constant minimumConfidence = 0.8; below that an evidence relation should be treated as not accepted.
- Parameters: minimumConfidence 0.8
- Edge cases: The constant is not applied anywhere in this file; the enforcement point was not located

## `scripts/plugin/src/canon.ts` (1)

### Offline plugin arbiter: status wording and degraded outputs

P1 · Policy · confiance High · `scripts/plugin/src/canon.ts:42-56,98-153,155-190`

The offline plugin rules on the doctrine shipped in the repository only; it labels a verdict established only for curated entries and never presents a fallback tier as a ranking.

- Given: A question asked through the plugin without network
- When: The plugin answers
- Then: origine entry: -> 'établi (instantané)'; heuristic: -> 'non établi (rang présumé par une famille de formulations)'; troll -> 'hors des sources'; empty -> 'aucune question'; anything else -> 'non établi'. Readable output prints a Rank and Score only for entry/heuristic results, otherwise 'aucun rang établi (… valeur de repli de l'API : <tier>)' and 'Score … (repli, ne fonde rien)'. Question trimmed and cut to 400 chars. References from corpus, plates and sheets are empty offline; JSON output sets hors_ligne true. --entree with an unknown id exits 1; blank question exits 1
- Parameters: question cap 400; production doctrine edits are not reflected (shipped doctrine only)
- Edge cases: Heuristic results display a rank but are labelled non-established ; JSON consumers still receive the fallback tier and score fields

