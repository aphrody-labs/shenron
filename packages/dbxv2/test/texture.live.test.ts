/**
 * Live check of `/png` against the real private server (factory): `DBXV2_LIVE=1` with
 * `DBXV2_SERVER_URL` and `DBXV2_TOKEN`. Without them the suite is skipped; with `DBXV2_LIVE=1`
 * but a missing configuration it fails instead of passing silently.
 *
 * No game file name or hash is written here: the sample is drawn at run time from `find`, and
 * the expected dimensions come from the EMB / DDS headers read in the raw bytes by this file
 * (not by the server converter nor by the client), the digest from `node:crypto` over bytes
 * fetched with a plain `fetch` (not by the client).
 */
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { createDbxv2Client } from "../src/client";
import { dbxv2Status } from "../src/env";

const live = process.env.DBXV2_LIVE === "1";
const SAMPLE_EMBS = Number(process.env.DBXV2_LIVE_SAMPLE ?? 12);
const MAX_EMB_BYTES = 4 << 20;

interface DdsEntry {
  readonly index: number;
  readonly width: number;
  readonly height: number;
  readonly fourcc: string;
}

/** EMB: `#EMB`, count at 0x0C, table offset at 0x18, entries (offset, size) relative to the table. */
function parseEmb(raw: Uint8Array): DdsEntry[] | null {
  if (raw.length < 0x20 || String.fromCharCode(...raw.slice(0, 4)) !== "#EMB") return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const count = view.getUint32(0x0c, true);
  const table = view.getUint32(0x18, true);
  if (count === 0 || count > 4096 || table + count * 8 > raw.length) return null;
  const entries: DdsEntry[] = [];
  for (let index = 0; index < count; index++) {
    const start = table + view.getUint32(table + index * 8, true);
    const size = view.getUint32(table + index * 8 + 4, true);
    if (size < 128 || start + size > raw.length) continue;
    if (String.fromCharCode(...raw.slice(start, start + 4)) !== "DDS ") continue;
    entries.push({
      index,
      height: view.getUint32(start + 12, true),
      width: view.getUint32(start + 16, true),
      fourcc: String.fromCharCode(...raw.slice(start + 84, start + 88)),
    });
  }
  return entries;
}

/** Minimal 8-bit RGBA / RGB PNG decoder (zlib + filters), independent of the code under test. */
function decodePng(png: Uint8Array): {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
} {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Uint8Array[] = [];
  for (let pos = 8; pos < png.length;) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...png.slice(pos + 4, pos + 8));
    const body = png.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      if (png[pos + 16] !== 8) throw new Error("bit depth is not 8");
      channels = png[pos + 17] === 6 ? 4 : png[pos + 17] === 2 ? 3 : 0;
      if (!channels) throw new Error(`unsupported PNG colour type ${png[pos + 17]}`);
    } else if (type === "IDAT") idat.push(body);
    pos += 12 + len;
  }
  const data = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  if (data.length !== height * (stride + 1)) throw new Error("PNG data length mismatch");
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    for (let x = 0; x < stride; x++) {
      const cur = data[y * (stride + 1) + 1 + x]!;
      const left = x >= channels ? pixels[y * stride + x - channels]! : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels]! : 0;
      const p = left + up - upLeft;
      const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
      const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      const add = [0, left, up, (left + up) >> 1, paeth][filter];
      if (add === undefined) throw new Error(`unknown PNG filter ${filter}`);
      pixels[y * stride + x] = (cur + add) & 255;
    }
  }
  return { width, height, channels, pixels };
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

describe.if(live)("live: EMB textures served by the real server", () => {
  setDefaultTimeout(300_000);
  const enc = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

  test("sha256, dimensions, invariance and declared colour / alpha on a dynamic sample", async () => {
    const status = dbxv2Status(process.env);
    if (!status.enabled)
      throw new Error(`DBXV2_LIVE=1 needs DBXV2_SERVER_URL and DBXV2_TOKEN (${status.reason})`);
    const { baseUrl, token } = status.config;
    const client = createDbxv2Client({ baseUrl, token, cache: false });
    const cpks = await client.cpks();
    const picks: { cpk: string; path: string; entries: DdsEntry[] }[] = [];
    for (let round = 0; picks.length < SAMPLE_EMBS && round < 6; round++) {
      for (const { name } of cpks) {
        if (picks.length >= SAMPLE_EMBS) break;
        const page = await client.find(name, { q: "ext:emb", limit: 1, offset: round * 7 });
        const entry = page.entries[0];
        if (!entry || entry.extract_size > MAX_EMB_BYTES) continue;
        if (picks.some((p) => p.cpk === name && p.path === entry.path)) continue;
        const raw = (await client.raw({ cpk: name, path: entry.path })).bytes;
        const entries = parseEmb(raw);
        if (entries?.length) picks.push({ cpk: name, path: entry.path, entries });
      }
    }
    expect(picks.length).toBeGreaterThanOrEqual(Math.min(SAMPLE_EMBS, 4));

    const stats = {
      textures: 0,
      withAlpha: 0,
      straightEvidence: 0,
      premultipliedEvidence: 0,
      fourcc: new Map<string, number>(),
    };
    for (const pick of picks) {
      const wanted = [...new Set([0, pick.entries.length - 1].map((i) => pick.entries[i]!))];
      for (const dds of wanted) {
        const ref = { cpk: pick.cpk, path: pick.path };
        const first = await client.texture(ref, { index: dds.index });
        const second = await client.texture(ref, { index: dds.index });
        // independent transport + digest
        const plain = await fetch(
          `${baseUrl}/cpk/${pick.cpk}/png/${enc(pick.path)}?index=${dds.index}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const plainBytes = new Uint8Array(await plain.arrayBuffer());

        expect(first.info.sha256).toBe(sha256(first.binary.bytes));
        expect(sha256(plainBytes)).toBe(first.info.sha256);
        // invariance across two requests (bytes, digest, validator)
        expect(second.info.sha256).toBe(first.info.sha256);
        expect(second.binary.etag).toBe(first.binary.etag);
        // dimensions: EMB / DDS header read from the raw bytes
        expect([first.info.width, first.info.height]).toEqual([dds.width, dds.height]);

        const png = decodePng(first.binary.bytes);
        expect([png.width, png.height]).toEqual([dds.width, dds.height]);
        expect(first.info.bitDepth).toBe(8);
        expect([2, 6]).toContain(first.info.pngColorType);
        expect(first.info.colorSpace).toBe("srgb"); // declared default, not measured
        expect(first.info.alpha).toBe("straight"); // declared default, checked below when possible

        stats.textures++;
        stats.fourcc.set(dds.fourcc, (stats.fourcc.get(dds.fourcc) ?? 0) + 1);
        if (png.channels === 4) {
          let translucent = 0;
          let colourAboveAlpha = 0;
          for (let i = 0; i < png.pixels.length; i += 4) {
            const a = png.pixels[i + 3]!;
            if (a === 255 || a === 0) continue;
            translucent++;
            if (Math.max(png.pixels[i]!, png.pixels[i + 1]!, png.pixels[i + 2]!) > a)
              colourAboveAlpha++;
          }
          if (translucent > 0) {
            stats.withAlpha++;
            // premultiplied data can never have a colour channel above alpha
            if (colourAboveAlpha > 0) stats.straightEvidence++;
            else stats.premultipliedEvidence++;
          }
        }
      }
    }
    console.log(
      JSON.stringify({
        embs: picks.length,
        textures: stats.textures,
        fourcc: Object.fromEntries(stats.fourcc),
        translucentTextures: stats.withAlpha,
        straightEvidence: stats.straightEvidence,
        noPremultipliedViolation: stats.premultipliedEvidence,
      }),
    );
    expect(stats.textures).toBeGreaterThanOrEqual(4);
    // `straight` is refuted only if translucent textures exist and none has colour above alpha
    // while some do not contradict premultiplication: the declaration stays "assumed" otherwise.
    if (stats.withAlpha > 0) expect(stats.straightEvidence).toBeGreaterThan(0);
  });
});
