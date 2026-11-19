# tv. (overrides MASTER where they conflict)

Engine: `crates/shenron-tv` (library, FFmpeg HLS ladder, player API); Next.js `apps/site/src/app/tv` until the Rust port.

- Catalogue first: series rows, then episode grid; each episode card shows number, title (fr), `title_ja`, air date and its legal offer (official link). A card never implies a stream Shenron does not have rights to.
- Player: click to play, never autoplay; pause, captions track, keyboard (space, arrows, `f`, `m`, `c`), stops when off-screen; honours reduced motion for previews.
- Own content (Shenron videos, trailers with rights) runs on the HLS ladder; quality switches without layout shift.
- Live counters (viewers, new episodes) update in place with a text status, not colour alone.
