/**
 * Captures every state of states.json from the web gallery with agent-browser.
 * Usage: bun web/capture.ts [--out <dir>] [--theme dark|light]... [--id <id>]...
 * Writes <out>/<theme>/<id with / as __>.png and <out>/<theme>/bounds.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { Browser } from "../browser";
import { loadContract } from "./serve";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: resolve(import.meta.dir, "../out/web") },
    theme: { type: "string", multiple: true },
    id: { type: "string", multiple: true },
    session: { type: "string", default: "parity-web" },
  },
});

const TAGS = `
for (const [slot, name] of [["dialog-content","dialog-popup"],["dialog-overlay","dialog-backdrop"],["dialog-close","dialog-close"],["select-content","select-popup"],["select-icon","select-icon"]]) {
  const el = document.querySelector('[data-slot="' + slot + '"]');
  if (el && !el.dataset.parity) el.dataset.parity = name;
}
document.querySelectorAll('[data-slot="select-item"]').forEach((el, i) => { el.dataset.parity = 'select-item-' + (i + 1); });
`;

const BOUNDS = `(() => {
${TAGS}
const parts = {};
for (const el of document.querySelectorAll('[data-parity]')) {
  const r = el.getBoundingClientRect();
  parts[el.dataset.parity] = { x: r.x, y: r.y, w: r.width, h: r.height };
}
// Line boxes of every rendered text node: the text mask of diff.ts.
const text = [];
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  if (!node.textContent.trim() || ['SCRIPT', 'STYLE'].includes(node.parentElement.tagName)) continue;
  const range = document.createRange();
  range.selectNodeContents(node);
  for (const r of range.getClientRects()) {
    if (r.width > 0 && r.height > 0) text.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  }
}
return { parts, text };
})()`;

const contract = await loadContract();
const port = 4300 + Math.floor(Math.random() * 500);
const url = `http://127.0.0.1:${port}`;
// The gallery runs in its own process: Browser uses synchronous spawns that would block an in-process server.
const server = Bun.spawn(["bun", join(import.meta.dir, "serve.ts")], {
  env: { ...process.env, PORT: String(port) },
  stdout: "ignore",
  stderr: "inherit",
});
for (let attempt = 0; attempt < 150; attempt += 1) {
  if (
    await fetch(url).then(
      (response) => response.ok,
      () => false,
    )
  )
    break;
  await Bun.sleep(200);
}
const browser = new Browser(values.session ?? "parity-web");
const themes = values.theme?.length ? values.theme : ["dark"];
const wanted = values.id?.length ? new Set(values.id) : undefined;
const states = contract.states.filter((state) => !wanted || wanted.has(state.id));
const { width, height, scale } = contract.viewport;

try {
  browser.must("set", "viewport", String(width), String(height), String(scale));
  for (const theme of themes) {
    const dir = join(values.out ?? "", theme);
    mkdirSync(dir, { recursive: true });
    const bounds: Record<string, unknown> = {};
    for (const state of states) {
      browser.must("set", "media", theme);
      browser.must("open", `${url}/?id=${state.id}&theme=${theme}`);
      await browser.waitFor(
        "document.documentElement.dataset.parityReady === '1' && document.fonts.status === 'loaded'",
      );
      // Park the pointer away from every component before any interaction.
      browser.must("mouse", "move", String(width - 10), String(height - 10));
      const [kind, target] = state.interaction.split(":");
      if (state.id.startsWith("dialog/")) {
        await browser.waitFor("!!document.querySelector('[data-slot=dialog-content]')");
        browser.eval(`(() => { ${TAGS} })()`);
      }
      if (kind === "click") {
        browser.must("click", `[data-parity="${target}"]`);
        await browser.waitFor("!!document.querySelector('[data-slot=select-content]')");
        browser.must("mouse", "move", String(width - 10), String(height - 10));
      } else if (kind === "hover") {
        browser.must("hover", `[data-parity="${target}"]`);
      } else if (kind === "focus-visible") {
        let focused = false;
        for (let presses = 0; presses < 8 && !focused; presses += 1) {
          browser.must("press", "Tab");
          focused = browser.eval<boolean>(
            `document.activeElement?.dataset?.parity === ${JSON.stringify(target)} && document.activeElement.matches(':focus-visible')`,
          );
        }
        if (!focused) throw new Error(`${state.id}: Tab never reached ${target}`);
      }
      await Bun.sleep(200);
      bounds[state.id] = browser.eval(BOUNDS);
      const file = join(dir, `${state.id.replaceAll("/", "__")}.png`);
      browser.must("screenshot", file);
      console.log(`${theme} ${state.id}`);
    }
    writeFileSync(join(dir, "bounds.json"), `${JSON.stringify(bounds, null, 2)}\n`);
  }
} finally {
  browser.run("close");
  server.kill();
}
