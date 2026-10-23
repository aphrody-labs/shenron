import "./setup"; // must be first
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import {
  clearRemoteImageCache,
  drawImageCover,
  isRemoteRef,
  loadFrameImage,
} from "~/lib/canvas-kit";
import { paintBackdrop } from "~/render/backdrop";
import { loadBackdrop } from "~/render/cards/chrome";
import { PROFILE_LABELS } from "~/render/fixtures";
import { defaultCatalog, pickFrameBackdrop } from "~/frames/catalog";
import { renderLeaderboardCard, renderProfileCard, renderTierCard } from "~/render";
import { defaultImages, loadAsset } from "~/render/images";
import { resolvePalette } from "~/render/theme";
import type { ImageSource } from "~/render/types";
import { BackgroundCacheService } from "~/services/BackgroundCacheService";
import { CardService } from "~/services/CardService";
import { LeaderboardService } from "~/services/LeaderboardService";
import { canvasNativeOk, decode } from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;

/** A 4:3 picture: a red left half and a blue right half, with a yellow patch near the focus. */
async function twoToned(): Promise<Image> {
  const canvas = createCanvas(640, 480);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e02020";
  ctx.fillRect(0, 0, 320, 480);
  ctx.fillStyle = "#2040e0";
  ctx.fillRect(320, 0, 320, 480);
  return loadImage(await canvas.encode("png"));
}

/** Image source that serves `picture` for the frame URLs and `null` for everything else. */
function sourceOf(picture: Image | null, log: string[] = []): ImageSource {
  return {
    avatar: async () => null,
    asset: async (ref) => {
      log.push(ref);
      return isRemoteRef(ref) ? picture : null;
    },
  };
}

d("cover crop follows the focus", () => {
  test("a wide window shows the part of the picture the focus points at", async () => {
    const picture = await twoToned();
    const crop = (focus?: { x: number; y: number }) => {
      const canvas = createCanvas(200, 50);
      const ctx = canvas.getContext("2d");
      drawImageCover(ctx, picture, 0, 0, 200, 50, focus);
      const left = ctx.getImageData(4, 25, 1, 1).data;
      const right = ctx.getImageData(195, 25, 1, 1).data;
      return { left: [...left], right: [...right] };
    };
    // the 640 x 480 picture in a 4:1 window: the window is 640 x 160 (full width), so only the
    // vertical position moves; a tall window shows the horizontal one
    const centered = crop();
    expect(centered.left[0]).toBeGreaterThan(200);
    expect(centered.right[2]).toBeGreaterThan(200);

    const tall = (focusX: number) => {
      const canvas = createCanvas(60, 100);
      const ctx = canvas.getContext("2d");
      drawImageCover(ctx, picture, 0, 0, 60, 100, { x: focusX, y: 0.5 });
      return [...ctx.getImageData(30, 50, 1, 1).data];
    };
    // a 3:5 window of 288 x 480 pixels: with the focus on the left it is red, on the right blue
    expect(tall(0.1)[0]).toBeGreaterThan(200);
    expect(tall(0.9)[2]).toBeGreaterThan(200);
    expect(tall(0.5).slice(0, 3)).not.toEqual(tall(0.1).slice(0, 3));
    // a focus at the edge never leaves the picture
    expect(tall(0)[0]).toBeGreaterThan(200);
    expect(tall(1)[2]).toBeGreaterThan(200);
  });
});

d("the veil under the texts", () => {
  test("a shaded zone is darker than the same area unshaded, the rest is untouched", async () => {
    const picture = await twoToned();
    const palette = resolvePalette();
    const paint = (
      shade: Array<{ x: number; y: number; w: number; h: number; strength: number }>,
    ) => {
      const canvas = createCanvas(400, 200);
      const ctx = canvas.getContext("2d");
      paintBackdrop(ctx, palette, {
        width: 400,
        height: 200,
        radius: 12,
        image: picture,
        gradient: ["#000000", "#222222", "#000000"],
        focus: [0.5, 0.5],
        shade,
        overlay: 0.2,
        focal: { x: 40, y: 40 },
        accent: "#f85b1a",
        seed: 1,
        speedLines: false,
      });
      const luma = (x: number, y: number) => {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return 0.299 * r! + 0.587 * g! + 0.114 * b!;
      };
      return { inside: luma(120, 80), outside: luma(300, 40) };
    };
    const plain = paint([]);
    const shaded = paint([{ x: 70, y: 40, w: 100, h: 80, strength: 0.7 }]);
    expect(shaded.inside).toBeLessThan(plain.inside * 0.75);
    expect(Math.abs(shaded.outside - plain.outside)).toBeLessThan(6);
  });
});

d("backdrop of a card", () => {
  test("the frame comes first, then the backgrounds, then nothing", async () => {
    const picture = await twoToned();
    const frame = pickFrameBackdrop({ purpose: "tier", seed: "m", label: "Super Saiyan God" })!;
    const log: string[] = [];
    const first = await loadBackdrop(sourceOf(picture, log), frame, ["assets/banners/b.jpg"]);
    expect(first.framed).toBe(true);
    expect(first.focus).toEqual(frame.focus);
    expect(log).toEqual([frame.url]);

    // the frame is down (CDN outage): the first background that decodes takes over
    const log2: string[] = [];
    const banner: ImageSource = {
      avatar: async () => null,
      asset: async (ref) => {
        log2.push(ref);
        return ref === "assets/banners/b.jpg" ? picture : null;
      },
    };
    const second = await loadBackdrop(banner, frame, [
      "assets/banners/a.jpg",
      "assets/banners/b.jpg",
    ]);
    expect(second.framed).toBe(false);
    expect(second.focus).toBeUndefined();
    expect(log2).toEqual([frame.url, "assets/banners/a.jpg", "assets/banners/b.jpg"]);

    const none = await loadBackdrop(sourceOf(null), frame, []);
    expect(none).toEqual({ image: null, framed: false });
    const throwing: ImageSource = {
      avatar: async () => null,
      asset: async () => {
        throw new Error("boom");
      },
    };
    expect((await loadBackdrop(throwing, frame, [])).image).toBeNull();
    expect((await loadBackdrop(sourceOf(picture), null, [])).framed).toBe(false);
  });

  test("cards draw with a frame, with a dead frame and without one", async () => {
    const picture = await twoToned();
    const frame = pickFrameBackdrop({ purpose: "profile", seed: "m", race: "saiyan" })!;
    const profile = (images: ImageSource, withFrame: boolean) =>
      renderProfileCard(
        {
          name: "Son Goku",
          xp: 5000,
          zeni: 100,
          rank: 1,
          backgrounds: [],
          labels: PROFILE_LABELS.fr,
          frame: withFrame ? frame : null,
        },
        { images, scale: 1 },
      );
    const withFrame = await decode((await profile(sourceOf(picture), true)).buffer);
    const dead = await decode((await profile(sourceOf(null), true)).buffer);
    const gradient = await decode((await profile(sourceOf(picture), false)).buffer);
    // a card with a frame is not the gradient card; a dead frame is the gradient card
    expect(withFrame.at(960, 200)).not.toEqual(gradient.at(960, 200));
    expect(dead.at(960, 200)).toEqual(gradient.at(960, 200));
    expect(withFrame.width).toBe(1000);

    const tier = await renderTierCard(
      {
        name: "Goku",
        fromLevel: 1,
        toLevel: 2,
        labels: { title: "T", level: "L", newRole: "N" },
        frame,
      },
      { images: sourceOf(picture), scale: 1 },
    );
    expect(tier.width).toBe(1000);
    const board = await renderLeaderboardCard(
      { entries: [{ id: "1", name: "A", value: 10 }], title: "Top", frame },
      { images: sourceOf(picture), scale: 1 },
    );
    expect(board.height).toBe(640);
  });
});

// ─── The frame cache of canvas-kit ───────────────────────────────────────────────────────────

d("frame loading", () => {
  const directories: string[] = [];
  afterEach(() => {
    clearRemoteImageCache();
    delete process.env.SHENRON_FRAME_CACHE_DIR;
    for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  async function serve(): Promise<{ url: string; hits: () => number; stop: () => void }> {
    const canvas = createCanvas(64, 48);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#33aa55";
    ctx.fillRect(0, 0, 64, 48);
    const bytes = new Uint8Array(await canvas.encode("png"));
    let hits = 0;
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/missing.webp") return new Response("no", { status: 404 });
        if (path === "/huge.webp") return new Response(new Uint8Array(2 * 1024 * 1024));
        hits++;
        return new Response(bytes, { headers: { "content-type": "image/png" } });
      },
    });
    return {
      url: `http://localhost:${server.port}`,
      hits: () => hits,
      stop: () => void server.stop(true),
    };
  }

  test("a frame is downloaded once, kept on disk and read from there after a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shenron-frame-cache-"));
    directories.push(dir);
    process.env.SHENRON_FRAME_CACHE_DIR = dir;
    const server = await serve();
    try {
      const url = `${server.url}/DB/ep001/frame-00001.webp`;
      const first = await loadFrameImage(url);
      expect(first?.width).toBe(64);
      expect(await loadFrameImage(url)).toBe(first); // memory
      await Bun.sleep(100); // the disk copy is written in the background
      expect(readdirSync(dir).filter((name) => name.endsWith(".img"))).toHaveLength(1);
      clearRemoteImageCache(); // a restart
      server.stop(); // and the CDN is gone
      const again = await loadFrameImage(url);
      expect(again?.width).toBe(64);
      expect(server.hits()).toBe(1);
    } finally {
      server.stop();
    }
  });

  test("a missing, an oversized and an unreachable frame resolve null, without being asked again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "shenron-frame-cache-"));
    directories.push(dir);
    process.env.SHENRON_FRAME_CACHE_DIR = dir;
    const server = await serve();
    try {
      expect(await loadFrameImage(`${server.url}/missing.webp`)).toBeNull();
      expect(await loadFrameImage(`${server.url}/huge.webp`)).toBeNull();
      expect(readdirSync(dir)).toHaveLength(0); // nothing wrong is written to the disk
    } finally {
      server.stop();
    }
    expect(await loadFrameImage("http://localhost:1/never.webp")).toBeNull();
  });

  test("the shared loaders send a URL to the frame cache and a path to the disk", async () => {
    expect(isRemoteRef("https://cdn.dragonballfr.com/a.webp")).toBe(true);
    expect(isRemoteRef("assets/banners/banner-02.jpg")).toBe(false);
    const server = await serve();
    const dir = mkdtempSync(join(tmpdir(), "shenron-frame-cache-"));
    directories.push(dir);
    process.env.SHENRON_FRAME_CACHE_DIR = dir;
    try {
      const url = `${server.url}/DBZ/ep095/frame-00002.webp`;
      expect((await loadAsset(url))?.width).toBe(64);
      expect((await defaultImages.asset(url))?.width).toBe(64);
      expect((await new BackgroundCacheService().get(url))?.width).toBe(64);
      expect(server.hits()).toBe(1);
      expect(await loadAsset("assets/does-not-exist.png")).toBeNull();
    } finally {
      server.stop();
    }
  });
});

// ─── The services ────────────────────────────────────────────────────────────────────────────

/** A background cache that records what the renderer asks for and serves one picture. */
class RecordingBackgrounds extends BackgroundCacheService {
  readonly asked: string[] = [];
  constructor(private readonly picture: Image) {
    super();
  }
  override async get(path: string): Promise<Image | null> {
    this.asked.push(path);
    return isRemoteRef(path) || path.startsWith("assets/banners/") ? this.picture : null;
  }
}

const member = (id: string) =>
  ({
    id,
    username: "goku",
    displayName: "Son Goku",
    displayAvatarURL: () => "https://cdn.example/a.png",
  }) as never;

d("services pick the frame", () => {
  const input = { xp: 5000, zeni: 100, messageCount: 12 };

  test("a default profile card shows the frame of its race, a card with a banner does not", async () => {
    const backgrounds = new RecordingBackgrounds(await twoToned());
    const cards = new CardService(backgrounds);
    const saiyan = { id: "saiyan" as const, label: "Saiyan" };
    const card = await cards.renderCard({ ...input, discordUser: member("42"), race: saiyan });
    expect(card.width).toBe(2000);
    const frame = pickFrameBackdrop({ purpose: "profile", seed: "42", race: "saiyan" })!;
    expect(backgrounds.asked[0]).toBe(frame.url);

    backgrounds.asked.length = 0;
    await cards.renderCard({
      ...input,
      discordUser: member("42"),
      race: saiyan,
      bannerPath: "assets/banners/banner-08.jpg",
    });
    expect(backgrounds.asked.some(isRemoteRef)).toBe(false);
    expect(backgrounds.asked[0]).toBe("assets/banners/banner-08.jpg");

    // a purchased theme keeps its own banner too, and the owner can switch frames off
    backgrounds.asked.length = 0;
    await cards.renderCard({ ...input, discordUser: member("42"), cardKey: "goku" });
    await cards.renderCard({ ...input, discordUser: member("42"), episodeFrame: false });
    expect(backgrounds.asked.some(isRemoteRef)).toBe(false);
  });

  test("the leaderboard shows the frame of the day", async () => {
    const backgrounds = new RecordingBackgrounds(await twoToned());
    const board = new LeaderboardService(backgrounds);
    const card = await board.renderCard(
      [{ id: "1", username: "Goku", avatarURL: "https://cdn.example/a.png", xp: 10, zeni: 5 }],
      { title: "Top", page: 1, totalPages: 1 },
    );
    expect(card.height).toBe(1280);
    const today = pickFrameBackdrop({ purpose: "leaderboard", seed: "leaderboard" })!;
    expect(backgrounds.asked[0]).toBe(today.url);
    expect(defaultCatalog.frames.some((entry) => today.url.endsWith(entry.p))).toBe(true);
  });
});
