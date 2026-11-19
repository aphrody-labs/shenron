# Wiki (overrides MASTER where they conflict)

Engine: server-rendered HTML (`apps/site/src/app/wiki`, Rust SSR later); data from `bot.db_*`, RAG and canon tools (`shenron-rag`, canon_check).

- Generated pages (characters, episodes, techniques, chronology) show their sources inline: manga page, databook plate, episode id. Fandom is never a source.
- Reading width 65 to 75 characters; Japanese names beside French; long tables scroll horizontally inside their own container.
- Search: predictive, typo tolerant, with suggestions on no result. One lens-style entry point (image, text or name) routes to character, episode, manga page, databook or game.
- Links between surfaces keep stable URLs (`/wiki/episodes/<id>` is what Dragon Pixel chapters link to).
