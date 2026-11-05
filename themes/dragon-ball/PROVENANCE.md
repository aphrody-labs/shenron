# Provenance of the Dragon Ball pack

## Rights decision

On 2026-11-05, in the work chat, the owner of dragonballfr.com decided, after settling with the rights
holders, that Shenron may serve the real Dragon Ball assets as far as needed. This lifts the
`unverified` / `pending-*` blocks for this pack. No licence text is quoted: the decision itself is the
provenance. Every asset carries `LicenseRef-DBFR-Rights-Holder-Authorized-2026-11-05`.

**The assets are not redistributable outside Shenron (dragonballfr.com and cdn.dragonballfr.com).**
Do not publish the pack, mirror its files or ship them in another product.

## Colour

Seed `#fcf03a` and nothing else: it is the computed outline colour of the production nav links on
2026-11-05 (headless Chrome on https://dragonballfr.com/, `--color-kinto-lumiere` -> `rgb(252, 240, 58)`
for `focus-visible:outline-kinto-lumiere`). The page's `--color-ring` resolved to `rgb(237, 237, 237)`
(CMS theme) and only serves the sidebar collapse button; not retained. No role is overridden. An
earlier attempt that pinned focus-ring to this yellow on an orange seed failed 3:1 in the light scheme (1.13:1).

## Assets (all verified byte-identical between the repository and cdn.dragonballfr.com)

Wallpapers dark (Toei stills and manga page, existing in the home hero; shas in `theme.toml`) and:

| Asset | Source | sha256 |
| --- | --- | --- |
| wallpaper light banner-14 | https://cdn.dragonballfr.com/banners/banner-14.jpg (apps/site/public/banners) | 8a1c0d3425e825fd06b146a9536450a347023eb9caee8bb1446eb6a59bd4ddff |
| wallpaper light banner-05 | https://cdn.dragonballfr.com/banners/banner-05.jpg | 475f9e4cc1f9849fbe1832dcc7d4a6d4c9004d3744c27fe56b73594bed359b96 |
| wallpaper light banner-08 | https://cdn.dragonballfr.com/banners/banner-08.jpg | 58734e61080ad1e86efe4165fa2354365e86260411ec2d3759f3e362339084a5 |
| wallpaper dark banner-16 | https://cdn.dragonballfr.com/banners/banner-16.png | 153ea52587bc3097f3fbc38673927883f3e6cdd7939da265eecaacfd4cdf9c19 |
| wallpaper dark dbs-beerus-2026 | https://cdn.dragonballfr.com/banners/dbs-beerus-2026.jpg | ca4270c5b0fa8634dc827b18825cefa8bc51e59a7056d1731b27ffe0e4490352 |
| logo mark | packages/ui/assets/dbz/kinto-un-icone.svg | c7f00e5b5402d5e0d345290ac577f054df88ed50868175c8c25bd3b5731448f4 |
| logo monochrome | derived (currentColor) | 6cba0a6cf39b61b6e954cfeb7fbfcfd257da1e3663f3d3b778240a6661fbbbc4 |
| wordmark | packages/ui/assets/brand/dragonballfr-logo.svg (https://cdn.dragonballfr.com/brand/dragonballfr-logo.svg) | 39d0b5c665abc384fc8b5c9d3779ce6fa92c5bcdb5ec1da2b40076426ae29776 |
| pet Shenron | packages/ui/assets/wiki-mascots/shenron-full.svg (site-drawn vector, static) | 22a774e170ac92e56a6a6799882ed525f240c2aeeeaf2a179fade2eb2b994e67 |
| sounds shenron, nimbus, select, click, kamehameha, ki-charge | https://cdn.dragonballfr.com/sfx/*.mp3 (apps/site/public/sfx, see its README) | in `theme.toml` |
| technique stills kamehameha, genkidama, final-flash, kaioken, kienzan | https://cdn.dragonballfr.com/techniques/*.webp | in `theme.toml` |

Hash provenance: the pack stores the full sha256; the CDN name for static theme assets would be
`{sha16}.{ext}`, but nothing was uploaded to R2: all assets already exist on the CDN under their
current names.

## Missing

Dragon Radar and a separate Nuage Magique pet: no animated or per-state asset exists (Nuage Magique is the logo).
No AVIF/WebP variant exists for the banners (JPEG/PNG on the CDN). Light wallpapers have no precomputed seed.
