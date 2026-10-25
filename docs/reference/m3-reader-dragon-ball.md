<!-- SPDX-License-Identifier: Apache-2.0 -->
# Dragon Ball readers in the M3 family (archive)

`@aphrody/m3-reader` owns the manga, databook, and collection reading controls. Its neutral `styles.css` uses M3 color roles. `dragon-ball.css` is an optional reader theme; Shenron imports it and supplies its existing live `--dbz-*` variables. Shenron owns `/admin/design`, the site theme document and validation, asset routing, chapter metadata, OCR review warnings, and transcription text.

| Reader role | Shenron variable | Reader use |
| --- | --- | --- |
| surface, elevated surface, outline | `--dbz-bg`, `--dbz-card`, `--dbz-border` | viewport, controls, separators |
| primary and pressed state | `--dbz-orange`, `--dbz-orange-dark` | active controls and focus |
| on-surface and secondary | `--dbz-blue-light`, `--dbz-blue` | labels and secondary theme color |
| editorial and status accents | `--dbz-yellow`, `--dbz-red` | scrollbar hover and palette slots |
| effects | `--dbz-ember`, `--dbz-ki`, `--dbz-amber` | palette slots for host variants |

The reader theme retains the 12.3° slanted badge, ink borders, tactile button press, dark reading surface, and orange scrollbar from Shenron's prior readers. The original palette and its measurements remain documented in Shenron's `docs/reference/shenron/couverture-analyse-visuelle.md`; no new Toriyama illustration or unmeasured palette is claimed. Reader text uses at least 18 px, keyboard focus is visible, and the databook lightbox traps and restores focus.

The local Shenron dependency currently uses `file:../packages/m3-reader`. Publishing the package and replacing that path with a registry version are still required before an isolated Shenron checkout or deployment can install it. CSS and TypeScript checks do not prove the final browser appearance; inspect the real site after release.

## Archive note

Moved from Bun UI (`aphrody-labs/bun-ui`, `docs/material/m3/architecture/design/DRAGON-BALL-READER.md`
and `packages/m3-reader/dragon-ball.css`, last at commit `efc5b0d`) when Bun UI dropped its Shenron
theme material. `@aphrody/m3-reader` no longer exports `./dragon-ball.css`; Shenron's live reader
theme is `packages/ui/src/reader-dragon-ball.css` (the « Planche couleur » direction, derived from
the 3.3.4 copy). The last Bun UI version of the optional theme, with the 12.3° slanted badge, ink
borders and tactile press described above, is kept verbatim below.

```css
/* SPDX-License-Identifier: Apache-2.0 */
/* Shenron's live --dbz-* palette drives the reader, including /admin/design overrides. */
.m3-reader--dragon-ball.m3-reader,
.m3-reader--dragon-ball .m3-reader {
  --reader-surface: var(--dbz-bg, #0a0a0a);
  --reader-on-surface: var(--dbz-blue-light, #cdcdcd);
  --reader-accent: var(--dbz-orange, #e78220);
  --reader-on-accent: #0a0a0a;
  --reader-outline: var(--dbz-border, #2a2a26);
  --reader-card: var(--dbz-card, #141410);
  --reader-accent-pressed: var(--dbz-orange-dark, #c46f1b);
  --reader-blue: var(--dbz-blue, #1e244d);
  --reader-yellow: var(--dbz-yellow, #fefd03);
  --reader-red: var(--dbz-red, #f10c3b);
  --reader-ember: var(--dbz-ember, var(--reader-accent));
  --reader-ki: var(--dbz-ki, #4ba8ff);
  --reader-amber: var(--dbz-amber, #ffd23f);
  color-scheme: dark;
  font-family: var(--font-sans, system-ui, sans-serif);
}
.m3-reader--dragon-ball .m3-reader-container,
.m3-reader--dragon-ball .m3-reader-collection {
  border: 2px solid var(--reader-outline);
  box-shadow: 4px 4px 0 #000;
}
.m3-reader--dragon-ball .m3-reader-hud {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  box-shadow: 0 2px 0 #000;
}
.m3-reader--dragon-ball .m3-reader-btn,
.m3-reader--dragon-ball .m3-reader-btn-active {
  border-radius: var(--radius, 0.5rem);
  box-shadow: 2px 2px 0 #000;
  text-transform: uppercase;
}
.m3-reader--dragon-ball .m3-reader-btn:active,
.m3-reader--dragon-ball .m3-reader-btn-active:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 #000;
}
.m3-reader--dragon-ball .m3-reader-btn-active:hover {
  background: var(--reader-accent-pressed);
}
.m3-reader--dragon-ball .m3-reader-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: skewX(-12.3deg);
  border: 2px solid #000;
  border-radius: 0.25rem;
  color: var(--reader-on-accent);
  box-shadow: 2px 2px 0 #000;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.m3-reader--dragon-ball .m3-reader-badge > * {
  transform: skewX(12.3deg);
}
.m3-reader--dragon-ball .m3-reader-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--reader-accent) #050505;
}
.m3-reader--dragon-ball .m3-reader-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.m3-reader--dragon-ball .m3-reader-scroll::-webkit-scrollbar-thumb {
  background: var(--reader-accent);
  border: 1px solid #000;
  border-radius: 2px;
}
.m3-reader--dragon-ball .m3-reader-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--reader-yellow);
}
```
