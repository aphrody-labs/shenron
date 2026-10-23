import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAX_BYTES,
  GAME_CARD_WIDTH,
  LEADERBOARD_CARD_SIZE,
  PROFILE_CARD_SIZE,
  renderLeaderboardCard,
  renderProfileCard,
  renderTierCard,
  type ImageSource,
  type RenderedCard,
} from "~/render";
import {
  emptyImages,
  NAMES,
  PROFILE_LABELS,
  sampleCards,
  syntheticImages,
} from "~/render/fixtures";
import { UI_COLORS } from "~/render/tokens.generated";
import {
  canvasNativeOk,
  countNear,
  decode,
  hexToRgb,
  isPng,
  isWebp,
  busyness,
} from "./render-helpers";

const d = canvasNativeOk ? describe : describe.skip;
const images = syntheticImages();

/** Logical size of each sample card (the PNG is `scale` times larger). */
const LOGICAL: Record<string, [number, number]> = {
  "profile-photo": [PROFILE_CARD_SIZE.width, PROFILE_CARD_SIZE.height],
  "profile-gradient": [PROFILE_CARD_SIZE.width, PROFILE_CARD_SIZE.height],
  "profile-ja": [PROFILE_CARD_SIZE.width, PROFILE_CARD_SIZE.height],
  "leaderboard-podium": [LEADERBOARD_CARD_SIZE.width, LEADERBOARD_CARD_SIZE.height],
  "leaderboard-list": [LEADERBOARD_CARD_SIZE.width, LEADERBOARD_CARD_SIZE.height],
  "tier-role": [1000, 400],
  "tier-plain": [1000, 400],
  balance: [900, 320],
  "shop-item": [800, 360],
  "shop-board": [1200, 600],
};

const throwing: ImageSource = {
  avatar: async () => {
    throw new Error("network down");
  },
  asset: async () => {
    throw new Error("disk gone");
  },
};

d("every card", () => {
  for (const card of sampleCards()) {
    test(`${card.name}: sharp 2x PNG, sized, non-empty, bounded`, async () => {
      const rendered = await card.render({ images });
      expect(rendered.format).toBe("png");
      expect(rendered.contentType).toBe("image/png");
      expect(isPng(rendered.buffer)).toBe(true);
      expect(rendered.scale).toBe(2);
      expect(rendered.bytes).toBe(rendered.buffer.length);
      expect(rendered.bytes).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
      expect(rendered.bytes).toBeGreaterThan(20_000);

      const logical = LOGICAL[card.name];
      if (logical) {
        expect([rendered.width, rendered.height]).toEqual([logical[0] * 2, logical[1] * 2]);
      } else {
        // game cards: fixed width, height follows the blocks
        expect(rendered.width).toBe(GAME_CARD_WIDTH * 2);
        expect(rendered.height % 2).toBe(0);
      }

      const pixels = await decode(rendered.buffer);
      expect([pixels.width, pixels.height]).toEqual([rendered.width, rendered.height]);
      // rounded corner is transparent, the middle of the card is opaque
      expect(pixels.at(0, 0)[3]).toBe(0);
      expect(pixels.at(pixels.width >> 1, pixels.height >> 1)[3]).toBe(255);
      expect(busyness(pixels)).toBeGreaterThan(0.2);
    });

    test(`${card.name}: renders without avatars or backgrounds`, async () => {
      const rendered = await card.render({ images: emptyImages });
      const pixels = await decode(rendered.buffer);
      expect(busyness(pixels)).toBeGreaterThan(0.2);
    });

    test(`${card.name}: a throwing image source never throws`, async () => {
      const rendered = await card.render({ images: throwing });
      expect(isPng(rendered.buffer)).toBe(true);
    });
  }

  test("the same data draws the same bytes", async () => {
    const [first] = sampleCards();
    const a = await first!.render({ images });
    const b = await first!.render({ images });
    expect(a.buffer.equals(b.buffer)).toBe(true);
  });
});

d("palette", () => {
  test("the XP gauge is the accent colour, exactly", async () => {
    const rendered = await renderProfileCard(
      {
        name: "Gauge",
        xp: 1,
        zeni: 0,
        theme: { accent: "#00e5ff" },
        progress: {
          level: 3,
          floor: 0,
          next: { level: 4, xp: 100 },
          into: 60,
          span: 100,
          ratio: 0.6,
          remaining: 40,
        },
        labels: PROFILE_LABELS.fr,
      },
      { images: emptyImages },
    );
    const pixels = await decode(rendered.buffer);
    // gauge: x 238..960, y 282..310 (logical); 60 % fill, sampled in its flat middle band
    const [r, g, b, a] = pixels.at(490 * 2, Math.round(297.5 * 2));
    expect([r, g, b, a]).toEqual([...hexToRgb("#00e5ff"), 255]);
  });

  test("the gauge keeps the site orange without any theme", async () => {
    const rendered = await renderProfileCard(
      {
        name: "Orange",
        xp: 1,
        zeni: 0,
        progress: {
          level: 3,
          floor: 0,
          next: { level: 4, xp: 100 },
          into: 60,
          span: 100,
          ratio: 0.6,
          remaining: 40,
        },
        labels: PROFILE_LABELS.fr,
      },
      { images: emptyImages },
    );
    const pixels = await decode(rendered.buffer);
    expect(pixels.at(490 * 2, Math.round(297.5 * 2)).slice(0, 3)).toEqual(
      hexToRgb(UI_COLORS.orange),
    );
  });

  test("leaderboard titles and values are in the site gold", async () => {
    const board = sampleCards().find((card) => card.name === "leaderboard-podium");
    const pixels = await decode((await board!.render({ images })).buffer);
    expect(countNear(pixels, UI_COLORS.amber, 2)).toBeGreaterThan(2_000);
  });

  test("a palette patch recolours the card", async () => {
    const tier = (palette?: { amber: string }) =>
      renderTierCard(
        {
          name: "Patch",
          fromLevel: 1,
          toLevel: 2,
          labels: { title: "T", level: "L", newRole: "R" },
        },
        { images: emptyImages, palette },
      );
    const plain = await decode((await tier()).buffer);
    const patched = await decode((await tier({ amber: "#ff00aa" })).buffer);
    expect(countNear(plain, UI_COLORS.amber, 2)).toBeGreaterThan(500);
    expect(countNear(patched, "#ff00aa", 2)).toBeGreaterThan(500);
    expect(countNear(patched, UI_COLORS.amber, 2)).toBe(0);
  });
});

d("options", () => {
  test("scale 1 halves the bitmap", async () => {
    const rendered = await renderTierCard(
      { name: "S", fromLevel: 1, toLevel: 2, labels: { title: "T", level: "L", newRole: "R" } },
      { images: emptyImages, scale: 1 },
    );
    expect([rendered.width, rendered.height]).toEqual([1000, 400]);
  });

  test("a tiny byte budget falls back to lossy WebP, still a decodable card", async () => {
    const [profile] = sampleCards();
    const rendered: RenderedCard = await profile!.render({ images, maxBytes: 1_000 });
    expect(rendered.format).toBe("webp");
    expect(rendered.contentType).toBe("image/webp");
    expect(rendered.extension).toBe("webp");
    expect(isWebp(rendered.buffer)).toBe(true);
    expect((await decode(rendered.buffer)).width).toBe(2000);
  });

  test("format webp is honoured", async () => {
    const [profile] = sampleCards();
    const rendered = await profile!.render({ images, format: "webp" });
    expect(isWebp(rendered.buffer)).toBe(true);
  });

  test("the leaderboard ranks follow firstRank and the podium follows the page", async () => {
    const entries = NAMES.map((name, i) => ({ id: String(i), name, value: 1000 - i }));
    const base = { entries, title: "Board" };
    const podium = await renderLeaderboardCard({ ...base, firstRank: 1 }, { images: emptyImages });
    const second = await renderLeaderboardCard({ ...base, firstRank: 11 }, { images: emptyImages });
    const forced = await renderLeaderboardCard(
      { ...base, firstRank: 1, podium: false },
      { images: emptyImages },
    );
    expect(podium.buffer.equals(second.buffer)).toBe(false);
    expect(podium.buffer.equals(forced.buffer)).toBe(false);
  });

  test("an empty or short board still renders", async () => {
    const none = await renderLeaderboardCard({ entries: [], title: "Empty" }, { images });
    const one = await renderLeaderboardCard(
      { entries: [{ id: "1", name: "Solo", value: 5 }], title: "One" },
      { images },
    );
    expect(isPng(none.buffer) && isPng(one.buffer)).toBe(true);
  });

  test("hostile text is truncated, not overflowing or throwing", async () => {
    const long = "W".repeat(300);
    const rendered = await renderProfileCard(
      {
        name: long,
        title: long,
        xp: Number.NaN,
        zeni: -5,
        messages: Number.POSITIVE_INFINITY,
        rank: 10 ** 9,
        badge: "\u{1F468}‍\u{1F469}‍\u{1F467}",
        race: { label: long },
        tier: { label: long },
        color: "not a colour",
        labels: PROFILE_LABELS.en,
      },
      { images },
    );
    expect(isPng(rendered.buffer)).toBe(true);
  });
});
