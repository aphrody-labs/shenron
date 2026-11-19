# Banque d'actifs et de jeux de données du design Shenron : relevé du 2026-11-19

Rapport de la recherche multi-sources (109 agents, vérification adverse à trois votes par affirmation). Il ne couvre que ce qui a été confirmé ; les parties sans affirmation confirmée sont déclarées ouvertes plutôt que comblées de mémoire. Aucune ressource protégée n'est copiée ici : seuls des termes de licence et des liens figurent.

## Synthèse

Only the legal-terms and dataset-licensing parts of the brief were confirmed; the UI/UX constants (Material 3, HIG, Fluent 2, shadcn/Radix, GPUI Kit) and the Figma-to-GPUI workflow have no confirmed claims in this run. For the asset bank, no Bandai Namco, Toei or Shueisha source checked grants fan sites any right to host or redistribute franchise images, video or manga pages, so Dragon Ball imagery must come from our own originals or from explicit permission. Safe redistributable building blocks are Inter (SIL OFL 1.1), Lucide (ISC) and Phosphor (MIT), each requiring its notice to be kept. For the dataset bank, AniList forbids bulk mirroring and caps throughput (degraded to 30 req/min); TMDB is non-commercial only, limits caching to 6 months and treats AI/chatbot use as commercial; Fandom dumps are per-wiki, admin-triggered and text-only, with their licence unchecked here. Use these as legal constraints for the Shenron knowledge base, and treat the unconfirmed areas as open work.

## Affirmations confirmées

### 1. Bandai Namco Entertainment's Video Policy lets individuals share gameplay videos, screenshots and stills for n...

Bandai Namco Entertainment's Video Policy lets individuals share gameplay videos, screenshots and stills for non-commercial use only. It excludes legal entities and commercial use, excludes content whose main purpose is not showing gameplay, and does not assign any rights. It does not mention fan sites or hosting franchise assets, so it gives no redistribution rights for Dragon Ball site assets. The Dragon Ball Xenoverse 3 press kit page states no usage terms (only a site-wide (c) 2010-2026 Bandai Namco Entertainment Europe S.A.S. footer), so press-kit redistribution rights cannot be derived from it.

- Confiance : high (votes : 3-0 (all three claims in this group))
- Sources : <https://www.bandainamcoent.co.jp/english/videopolicy/> ; <https://en.bandainamcoent.eu/dragon-ball/dragon-ball-xenoverse-3/press>
- Vérification : Three verifiers read the policy live: individuals only, non-commercial only, 'does not assign or transfer any rights', applies only to IP held by Bandai Namco, enacted 2022-01-26 and subject to change. A curl of the raw press page HTML found no terms, licence or per-asset notice. Linked pages (Legal documentation, Legal information, Licensing) were not opened, so terms may exist there. A separate claim that a fan site run as an organisation cannot rely on the policy was refuted 0-3 and is not asserted here, although the quoted rule 2 (individuals only) is part of the surviving text.

### 2. Toei Animation Europe's copyright page forbids copying, reproducing, modifying or distributing any document fr...

Toei Animation Europe's copyright page forbids copying, reproducing, modifying or distributing any document from its site. It names text, logos, images, audio, videos, flash animations, software and icons as protected, states 'reproduction of part or all of the website content, whatever the support, is absolutely forbidden', and offers no fan-site exemption or open licence. Self-hosting Toei site assets therefore requires separate written permission (contact given: marketing-taeu@toei-anim.co.jp).

- Confiance : high (votes : 3-0 (both claims))
- Sources : <https://www.toei-animation.com/copyrights/>
- Vérification : Page fetched live 2026-11-19 by verifiers. Violations are called counterfeiting with possible civil and penal action, and any link to the site needs prior authorisation. Scope is limited to Toei Animation Europe's own site, not Toei Japan. Wording is dated (footer 2020, mentions flash). No Toei press kit or fan-asset licence was found.

### 3. Shueisha's MANGA Plus Terms of Use bar public transmission of the service's content and limit translation and ...

Shueisha's MANGA Plus Terms of Use bar public transmission of the service's content and limit translation and duplication (including screenshots) to the user's private use. All rights belong to Shueisha or its licensors and users get no rights beyond the Terms and Copyright Law. Rehosting or republishing manga pages, or copying scans into a public asset bank, is outside the terms.

- Confiance : high (votes : 3-0 (all three claims))
- Sources : <https://mangaplus.shueisha.co.jp/static/terms/eng/>
- Vérification : Art. 9(1)(1) and Art. 10(1) of the terms (revised 2023-10-04) read by verifiers. Caveats: the English text is a translation (Japanese is authoritative), the terms do not name fan sites, and extending them to press images is an extrapolation. They govern the MANGA Plus service only, not all Shueisha licensing.

### 4. Inter is licensed under SIL OFL 1.1 (full text in LICENSE.txt, copyright 2016 The Inter Project Authors). It m...

Inter is licensed under SIL OFL 1.1 (full text in LICENSE.txt, copyright 2016 The Inter Project Authors). It may be bundled and used commercially in a product or site. Selling Inter itself or derivatives needs the author's agreement. 'Inter' is a Reserved Font Name and trademark of Rasmus Andersson (RSMS), so modified versions must be renamed.

- Confiance : high (votes : 3-0 (both claims))
- Sources : <https://github.com/rsms/inter/> ; <https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt>
- Vérification : Verifiers fetched the README (lines 133-137) and LICENSE.txt on 2026-11-19. The README's ban on selling derivatives is stricter than the OFL text itself; the OFL is the binding licence. Bundling Inter in a GPUI app or website is allowed under both.

### 5. Lucide (ISC) and Phosphor Icons core (MIT) are both permissive and redistributable on a hosted site or app. Bo...

Lucide (ISC) and Phosphor Icons core (MIT) are both permissive and redistributable on a hosted site or app. Both require the copyright and permission notice to be kept in copies.

- Confiance : high (votes : 3-0 each; Feather-attribution claim refuted 1-2)
- Sources : <https://github.com/lucide-icons/lucide/blob/329d75a2c158c2f9a19e15caae1c536f72522318/LICENSE> ; <https://github.com/phosphor-icons/core/blob/main/LICENSE>
- Vérification : Lucide LICENSE at the pinned commit and on main (now 'Copyright (c) 2026 Lucide Icons and Contributors') contains the ISC grant. Phosphor was verified through the GitHub API (spdx_id MIT, copyright 2023 Phosphor Icons, last push 2026-01-06). GitHub reports Lucide's spdx_id as NOASSERTION, a detection quirk only. A claim that the Feather (MIT, Cole Bemis) attribution must also be carried was refuted 1-2 (the main-branch file no longer shows it), so check the shipped LICENSE file when bundling.

### 6. AniList API: free without permission for commercial apps earning under $150 per month; above that a commercial...

AniList API: free without permission for commercial apps earning under $150 per month; above that a commercial licence is required (contact@anilist.co). Using it as a backup or data store and 'hoarding' or mass collection of its data are strictly prohibited, so a Dragon Ball knowledge base should fetch and cache on demand rather than bulk-mirror. The API is documented as 'degraded' at 30 requests per minute.

- Confiance : high (votes : 3-0 for the three surviving claims)
- Sources : <https://docs.anilist.co/guide/terms-of-use> ; <https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/rate-limiting>
- Vérification : Terms text matched in the AniList/docs GitHub markdown, the gitbook mirror and curl of the live page (docs.anilist.co returned 403 to WebFetch). Third-party projects confirm the 30/min limit in practice (429s, X-RateLimit-Limit: 30). The terms also forbid use in competing list or tracker services. 'On-demand caching only' is an inference, since the terms do not define hoarding. The claim that the standard limit is 90/min with an unpublished burst limiter was refuted 0-3 as stated, though the page still mentions a normal 90/min. Read X-RateLimit-Limit and Retry-After at runtime.

### 7. TMDB API (terms last updated 2023-10-20) is free only for non-commercial use with attribution (logo and a 'not...

TMDB API (terms last updated 2023-10-20) is free only for non-commercial use with attribution (logo and a 'not endorsed or certified by TMDB' notice). A project is commercial if its primary purpose is revenue for the owner; commercial use needs a separate written agreement (sales@themoviedb.org), otherwise it is a material breach. TMDB content may not be cached longer than 6 months and must be purged on termination. Training or validating ML/AI systems (including LLMs and chatbots) with TMDB content, or collecting datasets for that, is classed as commercial use, which affects Shenron's RAG/MCP layer.

- Confiance : medium (votes : 3-0 for non-commercial, cache and FAQ claims; 2-1 for the AI-training claim)
- Sources : <https://www.themoviedb.org/api-terms-of-use> ; <https://developer.themoviedb.org/docs/faq>
- Vérification : Terms and FAQ fetched live. Sections cited: 1.A, 1.C, 1.D and 2.A. Four of the five underlying claims were verified 3-0. The AI-training claim passed only 2-1, and the extension to RAG/MCP is an inference, because retrieval is not training and a TMDB representative is quoted calling semantic search not training. Whether a cache refresh resets the 6-month clock was not confirmed. TMDB can change the terms at its sole discretion (section 10.H).

### 8. Fandom wiki database dumps are per-wiki, linked at the bottom of Special:Statistics. When links are missing, b...

Fandom wiki database dumps are per-wiki, linked at the bottom of Special:Statistics. When links are missing, broken or outdated, community admins can request a new dump via a button on that page, and new dumps usually appear within a few hours depending on wiki size. This is an on-demand, admin-triggered mechanism, not a public bulk feed.

- Confiance : medium (votes : 3-0 (both claims; per-wiki and not-bulk are inferences from the wording))
- Sources : <https://support.fandom.com/hc/en-us/articles/360026387674-Where-can-I-find-database-dumps> ; <https://community.fandom.com/wiki/Help:Database_download>
- Vérification : The help article returned 403 to WebFetch; one verifier read it through Fandom's Zendesk API (updated 2024-04-23, outdated=false), the other relied on search summaries plus Community Central. Secondary details, not primary-confirmed: one request per 7 days, dumps are XML text and history only (no files or discussions), wikis without an admin must contact support. The text licence (CC BY-SA on most wikis) was not checked, and Shenron's MCP instructions state Fandom is never a source.

## Affirmations réfutées

- Only individuals may produce covered content. Legal entity-led activity is outside the policy and commercial use is prohibited. A fan site run as an organisation cannot rely on it.
- Portions of Lucide derive from Feather (MIT, Cole Bemis, 2013-2022); all other copyright is held by Lucide Contributors (2022). Two copyright holders must therefore be acknowledged, and the Feather portion is MIT-licensed.
- AniList API v2 documents a standard rate limit of 90 requests per minute per client, with a separate burst limiter that has no published numeric threshold.

## Ouvert

Les valeurs de constantes d'interface (échelles d'espacement et de typographie, rayons, élévations, durées et courbes de mouvement, cibles tactiles, seuils de contraste, densité, anneaux de focus) de Material 3, Apple HIG, Fluent 2, shadcn et Radix, et des guides de design de GPUI Kit, ainsi que la pratique de Figma vers GPUI (variables, Tokens Studio, Style Dictionary, Dev Mode, serveur MCP) n'ont reçu aucune affirmation confirmée dans cette exécution. Les constantes propres au dépôt sont mesurées dans [contrast-report.md](../design/contrast-report.md) (WCAG 2.x et APCA de chaque jeton `--dbz-*`) et dans la matrice [base-ui-gpui-parity-matrix.md](../plans/base-ui-gpui-parity-matrix.md) pour le comportement des composants GPUI.

## Sources

- <https://www.bandainamcoent.co.jp/english/videopolicy/>
- <https://en.bandainamcoent.eu/dragon-ball/dragon-ball-xenoverse-3/press>
- <https://www.toei-animation.com/copyrights/>
- <https://mangaplus.shueisha.co.jp/static/terms/eng/>
- <https://github.com/rsms/inter/>
- <https://github.com/lucide-icons/lucide/blob/329d75a2c158c2f9a19e15caae1c536f72522318/LICENSE>
- <https://github.com/phosphor-icons/core/blob/main/LICENSE>
- <https://docs.anilist.co/guide/terms-of-use>
- <https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/rate-limiting>
- <https://www.themoviedb.org/api-terms-of-use>
- <https://developer.themoviedb.org/docs/faq>
- <https://dev.to/publicapis/12-best-free-anime-apis-in-2026-tested-jikan-anilist-kitsu-and-more-5dp4>
- <https://community.fandom.com/wiki/Help:Database_download>
- <https://support.fandom.com/hc/en-us/articles/360026387674-Where-can-I-find-database-dumps>
- <https://dragonball.fandom.com/wiki/Dragon_Ball_Wiki:About>
- <https://www.wikidata.org/wiki/Wikidata:Database_download>
- <https://m3.material.io/styles/shape/corner-radius-scale>
- <https://fluent2.microsoft.design/shapes>
- <https://github.com/microsoft/fluentui/blob/master/docs/architecture/design-tokens.md>
- <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>
- <https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/>
- <https://github.com/longbridge/gpui-component>
- <https://longbridge.github.io/gpui-component/>
- <https://github.com/southleft/figma-console-mcp>
- <https://github.com/alvinindra/figma-mcp-rust>
- <https://camoa.github.io/dev-guides/ai-tooling/figma-mcp/design-tokens-and-variables/>
