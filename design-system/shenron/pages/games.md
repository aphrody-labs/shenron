# Games (overrides MASTER where they conflict)

Engine: `crates/dragon-pixel` (combat engine, render packets, Bevy WebGPU view), canvas fallback `apps/site/src/lib/dragon-pixel-canvas.ts`.

- Story chapters follow the canon: each chapter names its tome or episode (`episode_id`, linked as `/wiki/episodes/<id>`). The Beerus arc uses episodes 876, 879 and 880.
- Auras and transformations use the form colours of the roster; flashes respect reduced motion (shake and flash scaled down to zero).
- Touch controls meet the platform target sizes with 8 px gaps; keyboard and gamepad map the same actions.
- HUD values (HP, ki, combo) are text as well as bars.
