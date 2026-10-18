// SPDX-License-Identifier: Apache-2.0
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const url = "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys";
  console.log(`[Recon] Fetching ${url} with Bun fetch...`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "fr-FR,fr;q=0.9,ja-JP;q=0.8,en-US;q=0.7",
      "Cache-Control": "no-cache",
    },
  });

  console.log(`[Recon] HTTP Status: ${res.status} ${res.statusText}`);
  const headers = Object.fromEntries(res.headers.entries());

  const html = await res.text();
  console.log(`[Recon] HTML Length: ${html.length} bytes`);

  const outDir = join(process.cwd(), "var", "reports", "crunchyroll-recon-875");
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "page.html"), html, "utf8");
  writeFileSync(join(outDir, "headers.json"), JSON.stringify(headers, null, 2), "utf8");

  // Extraction Title & Meta
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Extraction Scripts
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const externalScripts: string[] = [];
  const inlineScripts: string[] = [];
  const jsonLdScripts: any[] = [];

  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];
    const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
    if (srcMatch) {
      externalScripts.push(srcMatch[1]);
    } else if (attrs.includes('application/ld+json')) {
      try {
        jsonLdScripts.push(JSON.parse(content));
      } catch {
        jsonLdScripts.push(content.trim());
      }
    } else if (content.trim()) {
      inlineScripts.push(content.trim());
    }
  }

  // Extraction CSS (link stylesheet + style tags)
  const linkRegex = /<link\b([^>]*)\/?>/gi;
  const stylesheets: string[] = [];
  const preloads: Array<{ href: string; as: string }> = [];
  const allLinks: Array<Record<string, string>> = [];

  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    const relMatch = attrs.match(/rel=["']([^"']+)["']/i);
    const asMatch = attrs.match(/as=["']([^"']+)["']/i);
    if (hrefMatch && relMatch) {
      const rel = relMatch[1].toLowerCase();
      const href = hrefMatch[1];
      allLinks.push({ rel, href, as: asMatch ? asMatch[1] : "" });
      if (rel.includes("stylesheet")) {
        stylesheets.push(href);
      } else if (rel.includes("preload")) {
        preloads.push({ href, as: asMatch ? asMatch[1] : "unknown" });
      }
    }
  }

  // Extraction Images & Assets
  const imgRegex = /<img\b([^>]*)\/?>/gi;
  const images: string[] = [];
  while ((match = imgRegex.exec(html)) !== null) {
    const srcMatch = match[1].match(/src=["']([^"']+)["']/i);
    if (srcMatch) images.push(srcMatch[1]);
  }

  // Extraction Meta Tags
  const metaRegex = /<meta\b([^>]*)\/?>/gi;
  const metaTags: Array<Record<string, string>> = [];
  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1];
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
    const propMatch = attrs.match(/property=["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content=["']([^"']+)["']/i);
    if (contentMatch) {
      metaTags.push({
        key: nameMatch ? nameMatch[1] : propMatch ? propMatch[1] : "unknown",
        content: contentMatch[1],
      });
    }
  }

  // Initial State JSON (__INITIAL_STATE__ / next_data / etc)
  const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

  const report = {
    url,
    title,
    httpStatus: res.status,
    headers,
    counts: {
      stylesheets: stylesheets.length,
      preloads: preloads.length,
      externalScripts: externalScripts.length,
      inlineScripts: inlineScripts.length,
      jsonLd: jsonLdScripts.length,
      images: images.length,
      metaTags: metaTags.length,
    },
    stylesheets,
    preloads,
    externalScripts,
    jsonLdScripts,
    metaTags,
    images: [...new Set(images)],
    hasNextData: Boolean(nextDataMatch),
    hasInitialState: Boolean(initialStateMatch),
  };

  writeFileSync(join(outDir, "summary.json"), JSON.stringify(report, null, 2), "utf8");

  if (nextDataMatch) {
    try {
      writeFileSync(join(outDir, "next_data.json"), JSON.stringify(JSON.parse(nextDataMatch[1]), null, 2), "utf8");
      console.log(`[Recon] Extracted Next.js __NEXT_DATA__ JSON (${nextDataMatch[1].length} bytes)!`);
    } catch {
      writeFileSync(join(outDir, "next_data.raw.txt"), nextDataMatch[1], "utf8");
    }
  }

  console.log(`[Recon] Full extraction complete!`);
  console.log(`- Title: ${title}`);
  console.log(`- Stylesheets: ${stylesheets.length}`);
  console.log(`- External Scripts: ${externalScripts.length}`);
  console.log(`- Preload Assets: ${preloads.length}`);
  console.log(`- Images: ${images.length}`);
  console.log(`- JSON-LD blocks: ${jsonLdScripts.length}`);
}

main().catch(console.error);
