/**
 * Bun server of the web gallery: bundles gallery.tsx, compiles the Tailwind v4 CSS of
 * packages/ui, serves the explicit Inter files of states.json. No Next, no dev server.
 */
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const here = import.meta.dir;
export const repoRoot = resolve(here, "../../..");
const uiDir = join(repoRoot, "packages/ui");

export interface Contract {
  viewport: { width: number; height: number; scale: number };
  origin: { x: number; y: number };
  themes: string[];
  font: { family: string; files: Record<string, string> };
  states: { id: string; interaction: string }[];
}

export async function loadContract(): Promise<Contract> {
  return Bun.file(join(here, "../states.json")).json();
}

async function bundle(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(here, "gallery.tsx")],
    target: "browser",
    minify: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join("\n"));
  }
  return result.outputs[0].text();
}

async function compileCss(contract: Contract): Promise<string> {
  // Resolved from packages/ui so the gallery adds no dependency of its own.
  const require = createRequire(join(uiDir, "package.json"));
  const postcss = require("postcss");
  const tailwind = require("@tailwindcss/postcss");
  const faces = Object.entries(contract.font.files)
    .map(
      ([weight, file]) =>
        `@font-face{font-family:"${contract.font.family}";font-weight:${weight};font-style:normal;font-display:block;src:url("/fonts/${weight}.ttf") format("truetype")}`,
    )
    .join("\n");
  const source = `@import "tailwindcss";
@import "./src/styles.css";
@source "./src/components";
${faces}
:root{--font-sans:"${contract.font.family}";--font-serif-src:"${contract.font.family}";--font-mono-src:"${contract.font.family}"}
html,body{margin:0;width:${contract.viewport.width}px;height:${contract.viewport.height}px;overflow:hidden;background:var(--background);color:var(--foreground);font-family:"${contract.font.family}";-webkit-font-smoothing:auto}
#stage{position:absolute;left:${contract.origin.x}px;top:${contract.origin.y}px}
`;
  const out = await postcss([tailwind()]).process(source, { from: join(uiDir, "__parity.css") });
  return out.css;
}

export async function startGallery(port = 0) {
  const contract = await loadContract();
  const [js, css] = await Promise.all([bundle(), compileCss(contract)]);
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>parity</title><link rel="stylesheet" href="/gallery.css"></head><body><div id="stage"></div><script type="module" src="/gallery.js"></script></body></html>`;
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/gallery.js") {
        return new Response(js, { headers: { "content-type": "text/javascript" } });
      }
      if (pathname === "/gallery.css") {
        return new Response(css, { headers: { "content-type": "text/css" } });
      }
      const font = /^\/fonts\/(\d+)\.ttf$/.exec(pathname);
      if (font) {
        const file = contract.font.files[font[1]];
        if (file) return new Response(Bun.file(join(repoRoot, file)));
      }
      if (pathname === "/") {
        return new Response(page, { headers: { "content-type": "text/html" } });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { server, contract, url: `http://127.0.0.1:${server.port}` };
}

if (import.meta.main) {
  const { url } = await startGallery(Number(process.env.PORT ?? 4177));
  console.log(`gallery on ${url}/?id=button/default&theme=dark`);
}
