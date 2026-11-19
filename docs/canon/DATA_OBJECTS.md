# Objets de données du canon (extraction du 2026-11-19)

Types, énumérations et structures lus dans les mêmes fichiers que [BUSINESS_RULES.md](BUSINESS_RULES.md), avec leur emplacement dans le code. Généré ; ne pas modifier à la main.

## CanonTier (union type + CANON_TIERS array)

`apps/site/src/lib/canon-engine.ts:27`

| Champ | Type | Note |
| --- | --- | --- |
| CANON_ABSOLU | string literal | rank 1, :28 |
| CANON_SUPERVISE | string literal |  |
| EXTENSION_OFFICIELLE | string literal |  |
| NON_CANON_DERIVE | string literal |  |
| APOCRYPHE_FANON | string literal | rank 5; closed ordered vocabulary (CANON_TIERS :35); guard isCanonTier :43. Duplicated in apps/bot/src/services/CanonService.ts:33 |

## CanonTierConfig (internal, not exported)

`apps/site/src/lib/canon-engine.ts:54`

| Champ | Type | Note |
| --- | --- | --- |
| id | CanonTier |  |
| label | string | long label, max 200 on resolve (:2692 texteCourt) |
| court | string | short label, max 60 |
| couleur | string | hex, validated by COULEUR_HEX /^#[0-9a-f]{3,8}$/i (:2678) |
| score | number | default 0-100, clamped by scoreValide :2708 |
| definition | string | max 2000 |
| inclut | string[] | max 24 items x 300 chars |

## CanonQuote (internal, not exported)

`apps/site/src/lib/canon-engine.ts:47`

| Champ | Type | Note |
| --- | --- | --- |
| text | string | trimmed, max 2000 (citation() :2713) |
| source | string | max 300 |
| year | number? | rounded if finite |

## CanonTopicEntry

`apps/site/src/lib/canon-engine.ts:70`

| Champ | Type | Note |
| --- | --- | --- |
| id | string | slugCanon of id or title, de-duplicated with -2 suffix |
| title | string | max 200; required |
| category | 'character'\|'form'\|'lore'\|'work'\|'myth' | invalid falls back to 'lore' |
| tier | CanonTier | invalid falls back to EXTENSION_OFFICIELLE (:2753+) |
| score | number | 0-100 |
| keywords | string[] | max 40 x 80; entry dropped when empty |
| verdict | string |  |
| explanation | string |  |
| toriyamaQuote | CanonQuote? |  |
| sources | string[] |  |

## CanonHeuristic

`apps/site/src/lib/canon-engine.ts:87`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| label | string |  |
| tier | CanonTier |  |
| score | number |  |
| keywords | string[] |  |
| verdict | string |  |
| explanation | string |  |
| sources | string[] |  |

## CanonReference (site/engine)

`apps/site/src/lib/canon-engine.ts:107`

| Champ | Type | Note |
| --- | --- | --- |
| id | string | must match /^[a-z0-9][a-z0-9_.:-]{0,199}$/i (ID_REFERENCE :2728) else slugified |
| subject | string |  |
| keywords | string[] |  |
| text | string | original-language text, never replaced |
| textFr | string? | French translation; mapped from DB text_fr |
| source | string |  |
| year | number? |  |
| document | string |  |
| lang | 'fr'\|'en'\|'ja' |  |
| provenance | 'shenron'\|'databooks'\|'manuel'\|'manga' | only 'manuel' lives in the doctrine JSON blob (canon-config.ts:143) |
| href | string? |  |
| visible | boolean? | explicit editor gesture; absent = unchanged |
| updatedAt | string? (ISO) | display only |
| version | string? | sha256 of stable-JSON row state excluding created/seen/updated timestamps (canon-config.ts:77) |

## CanonAnalysisResult (verdict)

`apps/site/src/lib/canon-engine.ts:148`

| Champ | Type | Note |
| --- | --- | --- |
| tier | CanonTier |  |
| tierLabel | string |  |
| score | number | 0-100 |
| color | string |  |
| verdict | string |  |
| explanation | string |  |
| toriyamaQuote | CanonQuote? |  |
| sources | string[] |  |
| matchedKeywords | string[] |  |
| doctrineRules | string[]? |  |
| tierDefinition | string? |  |
| origine | string | entry:<id> \| heuristic:<id> \| fallback \| troll \| empty |
| nature | 'verdict'\|'question'\|'troll'\|'empty' | drives whether a score is shown |
| suggestions | string[] |  |
| references | CanonReference[]? |  |

## PowerScalingMultiplier

`apps/site/src/lib/canon-engine.ts:176`

| Champ | Type | Note |
| --- | --- | --- |
| form | string |  |
| multiplier | number | fusion rows stored with 0 |
| baseForm | string |  |
| source | string |  |
| canonTier | CanonTier |  |
| notes | string? |  |

## OfficialBattlePower (internal)

`apps/site/src/lib/canon-engine.ts:185`

| Champ | Type | Note |
| --- | --- | --- |
| character | string |  |
| characterId | number? |  |
| saga | string |  |
| state | string |  |
| bp | number |  |
| scouter | boolean |  |
| source | string |  |
| canonTier | CanonTier |  |

## PowerScalingTier (internal)

`apps/site/src/lib/canon-engine.ts:196`

| Champ | Type | Note |
| --- | --- | --- |
| tierNumber | number |  |
| name | string |  |
| description | string |  |
| examples | string[] |  |

## PowerScalingConfig

`apps/site/src/lib/canon-engine.ts:203`

| Champ | Type | Note |
| --- | --- | --- |
| enabled | boolean | default true (:1549+) |
| kiriToBpRate | number | fan conversion, non-canonical; default 50000; must be finite > 0 else default |
| planetDestructionKiriFloor | number | default 200; finite > 0 else default |
| multipliers | PowerScalingMultiplier[] | only Array.isArray checked (:2918), no per-item sanitisation |
| officialBps | OfficialBattlePower[] |  |
| tiers | PowerScalingTier[] |  |

## CanonConfig (doctrine document, singleton)

`apps/site/src/lib/canon-engine.ts:217`

| Champ | Type | Note |
| --- | --- | --- |
| version | 1 |  |
| intro | string | max 1000 |
| placeholder | string | max 120 |
| doctrine | string[] | max 16 x 400 |
| sourcesAdmises | string[] | max 24 x 300 |
| sourcesInterdites | string[] | max 24 x 300 |
| tiers | CanonTierConfig[] | always the 5 fixed ids |
| entries | CanonTopicEntry[] | MAX_ENTREES 2000 (:2688) |
| heuristics | CanonHeuristic[] |  |
| references | CanonReference[] | MAX_REFERENCES 20000 (:2690) |
| powerScaling | PowerScalingConfig |  |
| fallback | {tier:CanonTier;score:number;verdict:string;explanation:string;sources:string[]} | verdict max 600, explanation max 4000 |
| vide | {verdict:string;explanation:string} | empty-state text |

## CanonConfig table ("CanonConfig", Postgres public)

`packages/db/src/schema.ts:1067 (DDL apps/site/src/db/migrations/0013_canon_config.sql:7)`

| Champ | Type | Note |
| --- | --- | --- |
| id | text PK | singleton value 'default' (canon-config.ts:28) |
| data | jsonb NOT NULL | serialized CanonConfig; must be a non-array object |
| updatedBy | text? | automation id or user id |
| updatedAt | timestamp(3) default CURRENT_TIMESTAMP | snapshot token = sha256(stableJson({data, updatedAt::text})) (canon-config.ts:82) |

## canon_references table (CanonReferenceRow)

`packages/db/src/schema.ts:1414 (DDL apps/site/src/db/migrations/0014_canon_tables.sql:9)`

| Champ | Type | Note |
| --- | --- | --- |
| id | text PK | e.g. planche-<id>-<n>, manga-vol-<series>-<n>, manga-chap-<db\|dbs>-<n> (canon-ingest.ts:261,314,411) |
| subject | text NOT NULL |  |
| keywords | jsonb string[] default [] | GIN index |
| text | text NOT NULL |  |
| text_fr | text? |  |
| source | text NOT NULL |  |
| year | integer? |  |
| document | text NOT NULL |  |
| lang | text default 'fr' |  |
| provenance | text default 'manuel' | non-listed values are coerced to 'manuel' on read (canon-config.ts:116) |
| href | text? |  |
| hash | text NOT NULL | sha1 over subject,text,textFr,source,year,href,keywords (canon-ingest.ts hashDe) |
| visible | boolean default true | set only at creation by ingestion; edited via explicit gestures |
| seen_at | timestamp(3) |  |
| created_at | timestamp(3) |  |
| updated_at | timestamp(3) | part of optimistic-lock token via ::text |

## canon_verdicts table

`packages/db/src/schema.ts:1443 (DDL apps/site/src/db/migrations/0014_canon_tables.sql:31)`

| Champ | Type | Note |
| --- | --- | --- |
| id | text PK | slugCanon(question,'question') sliced to 80 (api/canon/route.ts:47) |
| question | text NOT NULL | truncated to QUESTION_MAX 400 |
| tier | text NOT NULL |  |
| score | integer NOT NULL |  |
| origine | text NOT NULL |  |
| asked_count | integer default 1 | incremented on conflict |
| first_asked_at | timestamp(3) |  |
| last_asked_at | timestamp(3) | indexed DESC |

## canon_ingest_runs table

`packages/db/src/schema.ts:1459 (DDL apps/site/src/db/migrations/0014_canon_tables.sql:46)`

| Champ | Type | Note |
| --- | --- | --- |
| id | bigserial PK |  |
| source | text NOT NULL |  |
| started_at | timestamp(3) |  |
| finished_at | timestamp(3)? |  |
| inserted | integer default 0 |  |
| updated | integer default 0 |  |
| unchanged | integer default 0 |  |
| hidden | integer default 0 |  |
| error | text? |  |

## LigneCitation

`apps/site/src/lib/canon-config.ts:171`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| subject | string |  |
| textFr | string\|null |  |
| visible | boolean |  |
| updatedAt | Date |  |
| updatedAtExact | string | Postgres updated_at::text, microsecond-exact |
| version | string |  |

## GesteCitation

`apps/site/src/lib/canon-config.ts:182`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| lu | string | updatedAtExact read token used as the write guard |
| textFr | string\|null? | null = erase translation; absent = unchanged |
| visible | boolean? |  |

## PlanCitations

`apps/site/src/lib/canon-config.ts:191`

| Champ | Type | Note |
| --- | --- | --- |
| gestes | GesteCitation[] |  |
| conflits | {id:string; raison:string}[] | raison 'citation version missing or changed since read' (:225) |

## CanonConfigWriteError

`apps/site/src/lib/canon-config.ts:41`

| Champ | Type | Note |
| --- | --- | --- |
| message | string |  |
| status | 409 \| 428 | conflict vs precondition required |

## CanonConfig snapshot ({config, expected})

`apps/site/src/lib/canon-config.ts:129`

| Champ | Type | Note |
| --- | --- | --- |
| config | CanonConfig | resolved doctrine + manual refs from blob + visible refs from table |
| expected | string | sha256 hex, the optimistic-concurrency token sent back on save |

## PlanchePreuve (evidence plate)

`apps/site/src/lib/canon-preuves.ts:32`

| Champ | Type | Note |
| --- | --- | --- |
| databookId | number |  |
| databookTitre | string |  |
| numero | number |  |
| image | string\|null |  |
| texte | string\|null | Japanese transcription |
| texteFr | string\|null |  |
| verifiee | boolean | human-verified flag |
| href | string | internal canonical route only, e.g. /wiki/databooks/105#planche-11 |
| score | number |  |

## FichePreuve (evidence record, internal)

`apps/site/src/lib/canon-preuves.ts:46`

| Champ | Type | Note |
| --- | --- | --- |
| kind | string |  |
| titre | string |  |
| extrait | string |  |
| href | string |  |
| score | number |  |
| image | string\|null |  |
| nameJa | string\|null |  |

## CanonPreuves (evidence bundle)

`apps/site/src/lib/canon-preuves.ts:58`

| Champ | Type | Note |
| --- | --- | --- |
| verdict | CanonAnalysisResult |  |
| planches | PlanchePreuve[] |  |
| fiches | FichePreuve[] |  |
| mode | string\|null | hybrid+rerank \| hybrid \| lexical |
| suggestions | {titre:string; href:string}[] |  |
| judgment | CanonJudgment? | advisory, cannot replace curated tier |

## canonEvidenceView output (API shape)

`apps/site/src/lib/canon-preuves-view.ts:11`

| Champ | Type | Note |
| --- | --- | --- |
| plates | {databookId,databookTitle,number,image,text,textFr,verified,href,score, + deprecated databookTitre,numero,texte,texteFr,verifiee}[] |  |
| records | {kind,title,excerpt,href,score,image,nameJa, + deprecated titre,extrait}[] |  |
| suggestions | {title,href, + deprecated titre}[] |  |
| mode | string\|null |  |
| judgment | CanonJudgment? | spread only if present |
| planches / fiches | aliases of plates / records | removal planned for 1.4.0 |

## PublicCanonEvidence

`packages/pipeline/src/ai/canon-judgment.ts:11`

| Champ | Type | Note |
| --- | --- | --- |
| id | string | e.g. databook:<id>:<numero> (apps/site/src/lib/canon-judgment.ts:20) |
| publicExcerpt | string | max 700 chars per CANON_JUDGMENT_POLICY |
| url | string | absolute, built from DEFAULT_PUBLIC_ORIGINS.site |
| sourceKind | 'manga'\|'toriyama'\|'databook'\|'official'\|'wiki' |  |
| continuity | CanonContinuity? |  |
| visibility | 'public'\|'private' |  |
| providerUseAllowed | boolean | owner attestation |

## CanonJudgmentInput

`packages/pipeline/src/ai/canon-judgment.ts:22`

| Champ | Type | Note |
| --- | --- | --- |
| question | string | max 400 |
| evidence | readonly PublicCanonEvidence[] | max 6 |
| continuity | CanonContinuity? | original_manga\|super\|anime\|gt\|daima\|unspecified |

## CanonEvidenceJudgment

`packages/pipeline/src/ai/canon-judgment.ts:28`

| Champ | Type | Note |
| --- | --- | --- |
| evidenceId | string |  |
| relation | CanonRelation\|null | supported\|contradicted\|not_established\|continuity_mismatch |
| confidence | number |  |
| probabilities | Readonly<Record<CanonRelation, number>> |  |

## CanonJudgment

`packages/pipeline/src/ai/canon-judgment.ts:35`

| Champ | Type | Note |
| --- | --- | --- |
| status | 'judged'\|'unavailable'\|'no_public_evidence' |  |
| relation | CanonRelation\|'mixed'\|null |  |
| evidence | CanonEvidenceJudgment[] |  |
| model | string\|null |  |
| rubricVersion | string | policy version 'canon-evidence-1' (:51) |
| latencyMs | number |  |
| usage | {input_tokens:number; output_tokens:number}\|null |  |

## CANON_JUDGMENT_POLICY (frozen constants)

`packages/pipeline/src/ai/canon-judgment.ts:51`

| Champ | Type | Note |
| --- | --- | --- |
| version | string = 'canon-evidence-1' |  |
| minimumConfidence | number = 0.8 |  |
| maxEvidence | number = 6 |  |
| maxExcerptCharacters | number = 700 |  |
| maxQuestionCharacters | number = 400 |  |
| timeoutMs | number = 8000 |  |

## CanonEvalCase / CanonEvalResult

`packages/pipeline/src/ai/canon-eval.ts:12`

| Champ | Type | Note |
| --- | --- | --- |
| CanonEvalCase.id | string |  |
| CanonEvalCase.input | CanonJudgmentInput |  |
| CanonEvalCase.expected | CanonRelation |  |
| CanonEvalCase.relevantEvidenceIds | readonly string[] |  |
| CanonEvalCase.groundTruth | {sourceUrl,excerptSha256,reviewedBy} |  |
| CanonEvalResult.actual | CanonJudgment['relation'] |  |
| CanonEvalResult.status | CanonJudgment['status']\|'baseline' |  |
| CanonEvalResult.correct | boolean |  |
| CanonEvalResult.reciprocalRank / ndcg / brierScore | number\|null |  |
| CanonEvalResult.latencyMs | number |  |

## CanonEvidenceDecision (YOLO)

`apps/site/src/lib/canon-yolo.ts:9`

| Champ | Type | Note |
| --- | --- | --- |
| status | 'selected'\|'abstained'\|'unavailable' | discriminated union |
| referenceId | string | only when selected |
| model | string | selected and abstained |

## CanonEvidenceGateOptions

`apps/site/src/lib/canon-yolo-gate.ts:9`

| Champ | Type | Note |
| --- | --- | --- |
| enabled | boolean | SHENRON_CANON_YOLO_ENABLED === '1' && TYPESAFE_API_KEY && model (canon-yolo-server.ts:25) |
| configured | boolean |  |
| model | string |  |
| minimumConfidence | number |  |
| timeout | number (ms) |  |
| perHour | number |  |
| perDay | number |  |
| minimumSpacingMs | number |  |

## CanonEvidenceGatePorts

`apps/site/src/lib/canon-yolo-gate.ts:20`

| Champ | Type | Note |
| --- | --- | --- |
| runtime | () => Promise<CanonDecisionRuntime> |  |
| admit | () => Promise<boolean> |  |
| now | () => number (optional) |  |

## Bilan (ingestion tally)

`apps/site/scripts/canon-ingest.ts:439`

| Champ | Type | Note |
| --- | --- | --- |
| inserted | number |  |
| updated | number |  |
| unchanged | number |  |
| hidden | number |  |
| restored | number |  |
| kept | number | editorially removed, still in source |

## Existant (known canon_references row)

`apps/site/scripts/canon-ingest.ts:451`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| hash | string |  |
| visible | boolean |  |
| retraitEditorial | boolean | latest visibility revision in wiki_revisions is a removal |

## PlanIngestion

`apps/site/scripts/canon-ingest.ts:459`

| Champ | Type | Note |
| --- | --- | --- |
| nouvelles | string[] | inserted visible |
| modifiees | string[] | rewritten without touching visible |
| inchangees | string[] |  |
| aRetablir | string[] | hidden without editorial removal and back in source |
| retraitsRespectes | string[] |  |
| disparues | string[] | visible but absent from source: hidden |

## Point (alignment verification point)

`apps/site/scripts/canon-align.ts:96`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| ok | boolean |  |
| detail | string |  |

## CanonVerdict (bot client DTO)

`apps/bot/src/services/CanonService.ts:84`

| Champ | Type | Note |
| --- | --- | --- |
| question | string |  |
| verdict | {tier,tierLabel,tierDefinition\|null,score,color,verdict,explanation,toriyamaQuote\|null,sources,matchedKeywords,doctrine,origine,nature,suggestions} | mirror of /api/canon response; no 'origin' english alias |
| references | CanonReference[] (bot variant: textFr\|null, year\|null, lang:string, href\|null) |  |
| planches | CanonPlanche[] |  |
| fiches | CanonFiche[] |  |
| suggestions | {titre,href}[] |  |
| mode | string\|null |  |

## CanonDoctrine / CanonEntry / CanonReferencesPage (bot client DTOs)

`apps/bot/src/services/CanonService.ts:109`

| Champ | Type | Note |
| --- | --- | --- |
| CanonEntry | {id,title,category,tier,score,verdict} |  |
| CanonDoctrine.intro | string |  |
| CanonDoctrine.tiers | CanonTierInfo[] (:40) |  |
| CanonDoctrine.doctrine / sourcesAdmises / sourcesInterdites | string[] |  |
| CanonDoctrine.entries | CanonEntry[] |  |
| CanonDoctrine.heuristics | {id,label,tier}[] |  |
| CanonDoctrine.stats | {references:number; parProvenance:Record<string,number>} |  |
| CanonReferencesPage | {q,provenance\|null,total,limit,offset,items:CanonReference[]} | limit clamp 1..100 server side (api/canon/references/route.ts:33) |

## CanonDailyResult

`apps/bot/src/services/CanonService.ts:138`

| Champ | Type | Note |
| --- | --- | --- |
| ok | boolean |  |
| reason | 'disabled'\|'no_channel'\|'already_posted'\|'not_yet'\|'no_entry'\|'fetch_failed'\|'error'? |  |
| entry | string? |  |

## COULEURS_RANG / EMOJI_RANG (bot tier palettes)

`apps/bot/src/services/CanonService.ts:170`

| Champ | Type | Note |
| --- | --- | --- |
| COULEURS_RANG | Record<CanonTier, number> | 0x22c55e, 0x84cc16, 0xf59e0b, 0xf97316, 0xef4444 in tier order |
| EMOJI_RANG | Record<CanonTier,string> | emoji in a Discord embed, contrary to project no-emoji rule (observation) |

## CANON_EXAMPLES (entries)

`apps/site/src/lib/canon-examples.ts:2`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| query | string |  |
| label | string | i18n key |
| work | string |  |
| image | string (CDN URL) |  |

## CanonSaga

`packages/engine/src/games/canon-scenario.ts:17`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| name | string |  |
| name_ja | string |  |
| tomes | number[] |  |
| era | string |  |

## CanonFighter

`packages/engine/src/games/canon-scenario.ts:25`

| Champ | Type | Note |
| --- | --- | --- |
| id | string |  |
| name | string |  |
| name_ja | string |  |
| power_level | number |  |
| style | 'balanced'\|'rush'\|'power'\|'trickster'\|'brute'\|'team'\|'boss' |  |
| boss_hp | number? |  |
| wiki_slug | string |  |

## CanonRefs / CanonDialogue / CanonDramaticFinish

`packages/engine/src/games/canon-scenario.ts:35`

| Champ | Type | Note |
| --- | --- | --- |
| CanonRefs | {manga_url,episode_id:number,episode_url,wiki_arc_url,technique_slug,daizenshuu,databook_lot} |  |
| CanonDialogue | {speaker,speaker_ja,text,text_ja} |  |
| CanonDramaticFinish | {move,anim_cutscene} |  |

## CanonChapter

`packages/engine/src/games/canon-scenario.ts:57`

| Champ | Type | Note |
| --- | --- | --- |
| id | number |  |
| saga_id | string |  |
| tome | number |  |
| manga_chapter | number |  |
| page_start | number |  |
| title / title_ja | string |  |
| arena_id / arena_name | string |  |
| player / enemy | CanonFighter |  |
| canon_refs | CanonRefs |  |
| dialogue_intro / dialogue_victory | CanonDialogue[] |  |
| objective | string |  |
| dramatic_finish | CanonDramaticFinish |  |

## CanonStoryManifest

`packages/engine/src/games/canon-scenario.ts:76 (data data/games/canon-story-manifest.json)`

| Champ | Type | Note |
| --- | --- | --- |
| version | string |  |
| generated_at | string |  |
| source_author | string |  |
| curation | string |  |
| sagas | CanonSaga[] |  |
| chapters | CanonChapter[] |  |

## FighterCombatState

`packages/engine/src/games/canon-game-engine.ts:18`

| Champ | Type | Note |
| --- | --- | --- |
| id / name / name_ja | string |  |
| x,y,vx,vy | number |  |
| hp / maxHp / recoverableHp | number |  |
| ki / maxKi | number | 0..700 (7 bars) |
| facingRight | boolean |  |
| state | 'idle'\|'walk'\|'jump'\|'attack_light'\|'attack_heavy'\|'ki_blast'\|'beam_special'\|'hitstun'\|'block' | hitstun and beam_special: no exit transition found (suspected soft-lock, rule list claims this; not re-verified past line 100) |
| frame | number |  |
| comboCount / comboDamage | number |  |
| isGrounded | boolean |  |
| transformationLevel | number | 0 base, 1 ssj, 2 ssj2, 3 ssj3, 4 god |

## BeamClashEntity

`packages/engine/src/games/canon-game-engine.ts:49`

| Champ | Type | Note |
| --- | --- | --- |
| active | boolean |  |
| p1Energy / p2Energy | number | 0..100 |
| clashX / clashY | number |  |
| mashRateP1 / mashRateP2 | number |  |
| durationFrames | number |  |
| winner | 'player'\|'enemy'? |  |

## CanonGameEngine state (dragonBallsCollected, shenronSummoned)

`packages/engine/src/games/canon-game-engine.ts:90`

| Champ | Type | Note |
| --- | --- | --- |
| chapter | CanonChapter |  |
| renderMode | '2.5d_webgpu'\|'2d_pixel' |  |
| dragonBallsCollected | number 0..7 |  |
| shenronSummoned | boolean |  |
| frameCount | number |  |
| particles | GameVfxParticle[] |  |
| onomatopoeias | OnomatopoeiaText[] |  |

## CanonSource / CanonPrice (economy canon)

`packages/config/src/economy-canon.ts:17`

| Champ | Type | Note |
| --- | --- | --- |
| CanonSource | {title:string; url:string} |  |
| CanonPrice | {key,label,zeni:number,source:CanonSource} | 8 priced landmarks from taxi 65 to Tao Pai Pai contract 100,000,000 |
| ZENI_YEN_PARITY | {ratio:1, source} |  |
| CANON_INFLATION_FACTOR | number = 1,480,000 / 500,000 = 2.96 |  |

## InflationParams

`packages/config/src/inflation-rules.ts:14`

| Champ | Type | Note |
| --- | --- | --- |
| supply | number |  |
| referenceSupply | number |  |
| previousIndex | number |  |
| elasticity | number | clamped 0..1 |
| maxDailyChange | number | clamped 0..1 |
| floor | number? (default 1) |  |
| ceiling | number? (default CANON_INFLATION_FACTOR) |  |

## economy_index (daily snapshot, SQLite bot + Postgres bot schema mirror)

`apps/bot/src/db/schema.ts:317 and packages/db/src/bot-schema.ts:1609`

| Champ | Type | Note |
| --- | --- | --- |
| day | text PK | YYYY-MM-DD UTC |
| supply | integer | money supply, frozen accounts excluded |
| index_value | double/real | rounded to 4 decimals by computeIndex |
| enabled | integer/boolean | whether correction was active that day |
| created_at | integer (ms epoch) |  |

## Canon API GET /api/canon response (wire DTO)

`apps/site/src/app/api/canon/route.ts:63`

| Champ | Type | Note |
| --- | --- | --- |
| question | string | trimmed, max 400 |
| evidenceAssessmentEnabled | boolean |  |
| evidenceDecision | CanonEvidenceDecision? | only with assessEvidence=1, Cache-Control no-store |
| verdict | {tier,tierLabel,tierDefinition\|null,score,color,verdict,explanation,toriyamaQuote\|null,sources,matchedKeywords,doctrine,origin,nature,suggestions, + deprecated origine} |  |
| references | {id,subject,text,textFr\|null,source,year\|null,lang,provenance,href\|null}[] |  |
| plates/records/suggestions/mode/judgment + deprecated planches/fiches | canonEvidenceView output |  |
| (empty q) intro,tiers,doctrine,admittedSources,forbiddenSources,entries,heuristics,stats | doctrine listing mode |  |

## Gap notice: scope path

`legacy/shenron-canon (does not exist)`

| Champ | Type | Note |
| --- | --- | --- |
| note | n/a | The directory legacy/shenron-canon is absent from C:\src\shenron (no legacy/ dir). All objects above were catalogued from the live canon code under apps/site, apps/bot, packages/{pipeline,engine,config,db}. Not read in depth, so no objects extracted: translation audit grading, deposit judge/transcription gate, Toriyama interview detection, character power readings, wiki lexicon, seed-canon.ts. No instruction-shaped text aimed at the analyst was found in the files read. |

