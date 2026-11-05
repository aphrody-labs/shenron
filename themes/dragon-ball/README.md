# Dragon Ball theme pack (dragonballfr.com)

Yolo UI theme pack, schema v1 (`crates/yolo-theme-pack/src/manifest.rs` in yolo-ui). It turns a
Yolo shell into the dragonballfr.com look: the near-black DBFR background, the gi orange accent,
the yellow focus ring, the Kinto-Un mark and the Toei stills from the live home hero.

Nothing here is published or deployed. Publishing is the Shenron admin's decision (see the open
decisions below).

## Contents

| File | Origin |
| --- | --- |
| `theme.toml` | Pack manifest. Every value is traced below. |
| `assets/logo/kinto-un-mark.svg` | `bun plugin/skills/toriyama-svg/scripts/toriyama.js kinto-un icone`. Byte-identical to `packages/ui/assets/dbz/kinto-un-icone.svg`, the site favicon source. |
| `assets/logo/kinto-un-monochrome.svg` | `toriyama.js kinto-un monochrome`, with `fill="#000"` changed to `fill="currentColor"` (the format's tinting rule) and an `aria-label`. |

There are no binaries in the pack. The PNG and ICO renders of the mark already exist in
`packages/ui/assets/` (`favicon-*.png`, `favicon.ico`, `icon-512.png`); `[logo] png` and `ico`
are left empty so they are not duplicated. Wallpapers are referenced by their CDN URL.

## Colour

The seed is the DBFR accent `#e78220` (`replica/design/tokens.json` `accent`,
`--color-dbz-orange`), with the `fidelity` variant and a dark default. The overrides pin the roles
the site actually measures; every other role comes from the generated scheme.

| Role | Value | Source token | Contrast |
| --- | --- | --- | --- |
| `primary` | `#e78220` | accent, `--color-dbz-orange` | 7.18:1 on bg, 6.69:1 on card |
| `on-primary` | `#0a0a0a` | on-accent | 7.18:1 |
| `background`, `surface` | `#0a0a0a` | bg, `--color-dbz-bg` | |
| `on-background`, `on-surface` | `#efe9d8` | text, `--color-os` | 16.33:1 |
| `surface-container-low` | `#141410` | surface, `--color-dbz-card` | 15.23:1 with text |
| `surface-variant` | `#2a2a26` | border tone | 5.71:1 with muted text |
| `on-surface-variant` | `#a8a393` | text-muted | 7.85:1 on bg, 7.32:1 on card |
| `outline` | `#8a8a7e` | border-input | 5.67:1 on bg (UI, needs 3:1) |
| `outline-variant` | `#2a2a26` | border, `--color-dbz-border` | 1.37:1, decorative hairline as on the site |
| `tertiary` | `#fefd03` | focus-ring, `--color-dbz-yellow` | 18.16:1 on bg |
| `on-tertiary` | `#0a0a0a` | | 18.16:1 |

Ratios are WCAG 2.x relative luminance. With these overrides no `on-*` / base pair falls under
4.5:1 (checked against the material-color-utilities 0.4.0 fidelity scheme that yolo-tokens ports).
`surface-variant` is overridden only because the generated `#554336` gave 3.71:1 with the muted
text.

The schema has no focus-ring role. The site's `#fefd03` focus ring is carried by `tertiary`; a shell
that wants the DBFR focus ring should draw it from `tertiary`.

The overrides are dark values and apply in both modes, so the pack is dark only (`mode = "dark"`),
like the site (`<html class="dark">`).

### Drift on the live site

On 2026-11-05 the live home page carries a CMS theme (`<style id="site-theme">`) that differs from
the design-system defaults: `--dbz-bg #101010`, `--dbz-card #191919`, `--dbz-border #ffdd00`,
`--dbz-orange #d4d4d4`, `--dbz-os #ededed`, nearly every accent set to grey `#d4d4d4`, and
`--radius 0.5rem`. This pack follows `tokens.json` and `packages/ui/src/styles.css` (orange
accent). If the CMS theme is the intended identity, change `seed` and the overrides to those
values.

## Wallpapers

The four Toei stills are the live home hero frames, in its order
(`apps/site/src/lib/home-hero-frames.ts`). The colour page is the one in `replica/recon.md`. Each
file was downloaded once from cdn.dragonballfr.com into a temporary folder to compute its hash and
seed, then deleted.

| # | Source | Size | sha256 | Seed | Focal | Subject |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `media/episodes/876/hero/.../frame-1115.webp` | 1440x810, 50 852 B | `15415c10...33957aa1` | `#edca57` | 30, 42 | Beerus facing Super Saiyan 3 Goku |
| 2 | `media/episodes/875/hero/.../frame-1100.webp` | 1440x810, 103 528 B | `84284388...3e762ab3` | `#f61819` | 25, 42 | red aura, energy blast |
| 3 | `media/episodes/876/hero/.../frame-900.webp` | 1440x810, 57 444 B | `5c591046...57ad279f` | `#c781d2` | 22, 30 | Kaio panicking |
| 4 | `media/episodes/876/hero/.../frame-240.webp` | 1440x810, 36 028 B | `e59bb6df...49dde7f9` | `#623f53` | 50, 38 | Beerus close-up, French subtitle burned in |
| 5 | `assets/manga/DBFC/ch516/001.jpg` | 1662x2560, 479 343 B | `7b949dbe...e6f915bd` | `#9df0fa` | 50, 62 | chapter 516 title page, `fit = "contain"` |

Full hashes are in `theme.toml`; the frame hashes match the content hash in their CDN paths.
Seeds are `sourceColorFromImage` from material-color-utilities 0.4.0 (Celebi quantizer to 128
colours, then Score) on the full-resolution decode, the algorithm yolo-tokens ports.
`color.source = "seed"`, so the wallpapers do not recolour the theme unless the user asks for it.

The schema documents `file` as a path inside the pack. Here it is the CDN URL, at the Shenron
owner's request, so a loader has to accept `https://` files (and check `sha256` after download).

## Licences

- Toei stills and the colour manga page: `license = "LicenseRef-AllRightsReserved"`. Usage is
  limited to dragonballfr.com and the files are not redistributable. Credit lines are in each
  `attribution`, and the source URL is in each `source`.
- Kinto-Un SVGs: original Shenron geometry (toriyama-svg, `packages/ui/src/toriyama-svg/`),
  under the Shenron repository's licence.
- Fonts: Google Sans Flex and JetBrains Mono, both SIL OFL 1.1, already served by the site CDN.

## Other fields

- Title: live `<title>` template `%s — DBFR`, `application-name` `DBFR`, home `<h1>` "Dragon Ball,
  en français et sourcé".
- Icons: `lucide`, outlined, weight 400. `lucide-react` is the site's icon library (121 imports).
- Typography: `--font-sans` and `--font-mono-src` in `apps/site/src/app/fonts.css`. Japanese
  pages switch to Noto Sans JP; the schema has no per-language family.
- Shell: `top-bar` (56 px header, `layout.header-height`), header `backdrop-filter: blur(12px)`
  becomes `glass_blur = 12`, radii `[6, 8, 16]` (tokens `sm` 6, live `--radius` and
  `--site-panel-radius` 8, tokens `lg` 16), `calm` motion (200 ms, tokens `motion.base`).

## Not included

- Pet: neither the shenron plugin nor toriyama-svg ships an animated character with the per-state
  files a pet needs (`pets/<provider>/<id>/idle|active|sleep`). The static mascots in
  `packages/ui/assets/wiki-mascots/` (Goku, Kid Buu, Shenron) could become one if someone draws
  the states.
- Wordmark: `packages/ui/assets/brand/dragonballfr-logo.svg` is the site logo, but only SVGs
  created for this pack go in the pack, so `wordmark` is not set.

## Open decisions for the owner

1. Final licence identifier for the Toei and manga files. They are marked
   `LicenseRef-AllRightsReserved` because there is no agreement in the repo to cite. Confirm it or
   rename it before any publication.
2. Whether and where to publish the pack. Nothing is published or deployed.
3. Orange design-system accent (this pack) or the current grey CMS theme of the live site.
4. Whether the loader should accept URL wallpapers, or the pack should carry local files on a
   channel that allows them.
