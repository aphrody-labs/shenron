# Shenron design system: master

Rules for every surface of dragonballfr.com and its native shells (`tv.`, wiki, admin, manga, games). A page file in `pages/<surface>.md` overrides this file where they conflict.

Sources: measured palette `packages/ui/src/tokens.ts`, generated outputs of `bun packages/ui/scripts/generate-palette.ts` (CSS scales, `docs/design/contrast-report.md`, `crates/shenron-theme/themes/shenron.json`), UX rules from the `ui-ux-pro-max` skill database (queried 2026-11-19). That database's generic palette (indigo/green "Dark Mode (OLED)") is not used: the colours below are measured on Toriyama's manga, colour editions and anime frames.

## Rendering targets

| Target | Engine | Why |
| --- | --- | --- |
| Public pages (wiki, episode, manga index, news) | Server-rendered HTML (Next.js today, Rust SSR per ADR 0009 step 7) | Indexing, screen readers, first paint without a GPU |
| Readers and players (manga reader, databook viewer, `tv.` player, games) | GPUI / NSH canvas over wgpu, wasm on the web | 120 fps target, GPU upscale, gestures |
| Admin and desktop | GPUI (`gpui-kit`, `shenron-admin-ui`, `shenron-desktop`) | Dense data, keyboard first |

A canvas surface always has an HTML fallback with the same content and URL (deep links stay `/wiki/...`, `/tv/...`). The open Leptos versus GPUI decision for public pages is `docs/plans/base-ui-vers-gpui.md`.

## Colour

| Theme | Background | Text | Primary / ink on primary | Secondary | Muted text | Focus ring | Danger text | Link |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Shenron Nuit | `#0a0a0a` | `#efe9d8` | `#e78220` / `#0a0a0a` | `#1e244d` | `#a39e90` | `#4ba8ff` | `#ff9593` | `#ff9c48` |
| Shenron Jour | `#efe9d8` | `#131b08` | `#e78220` / `#0a0a0a` | `#1e244d` | `#5b584f` | `#4ba8ff` | `#a70025` | `#844500` |

- Components read semantic roles only (`cx.theme()` in GPUI, `--color-*` on the web). No raw hex in views.
- Every text tone in the theme set is chosen by the generator to reach WCAG AA 4.5:1 on its background. 11 of the 34 raw `--dbz-*` tokens fail as body text (`docs/design/contrast-report.md`): use them as fills, never as text.
- Dark is the default; light is a full theme, not an afterthought. `/admin/design` overrides `--dbz-*` at runtime on the web.

## Typography

- One sans family for interface and headings (Inter, as the gallery and `states.json` already ship), Japanese fallback for `name_ja` and `title_ja`, monospace for ids, logs and the scouter readouts.
- Body 16 px web / 14 px dense native (`font.size` 14 in the GPUI theme), line height 1.5, 65 to 75 characters per line on article text.
- Text reflows: fluid sizes, unitless line height, no clipped fixed-height boxes (critical in the UX database).

## Motion

- Motion carries meaning (ki charge, transformation, page turn), never decoration alone.
- Every animation has a reduced-motion path that shows the end state (`prefers-reduced-motion` on the web, the OS setting in GPUI).
- Movement uses the Material 3 Expressive springs of Compose Material 3 1.5.0 (`packages/m3-tokens/src/compose-m3.generated.ts`, CSS `--md-sys-motion-spring-expressive-*`, GPUI `shenron_theme::expressive_springs()`): fast spatial (damping 0.6, stiffness 800) for controls, default spatial (0.8, 380) for layout, effects springs (damping 1) for colour and opacity. Exit faster than enter. No overshoot (damping below 1) on data tables or lists of records: use the effects springs there.
- 120 fps is a measured target, not a claim: the gate is `docs/plans/gpui-parite-pixel-120fps.md` (p99 frame time; it fails today at 15.4 ms).

## Interaction

- Visible focus ring on every control (`ring` token); keyboard reaches everything a pointer reaches.
- Targets: 44 pt iOS, 48 dp Android, WCAG target size on the web; at least 8 px between targets.
- Destructive actions name the object and the verb (`Supprimer « Beerus » ?` with a `Supprimer` button) and confirm; success gets a short message, never silence.
- Search predicts as the user types and shows suggestions when nothing matches.
- Lazy-load below the fold, reserve image space (CLS under 0.1), AVIF/WebP variants from the CDN.
- Icons are SVG (no emoji). User-facing text goes through the i18n catalogues (fr, en, ja).

## Legal line

Video and scans shown on Shenron come from rights holders or official offers (Crunchyroll links, official sites) or are Shenron's own content. No re-hosting or proxying of licensed streams; no pirate sources.
