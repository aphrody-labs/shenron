/**
 * Sleepcall summaries: "3 h · 11 participants · …" instead of "3h à 11, …" (which reads like a
 * time range), and no summary at all when the call granted no XP.
 */
import "./setup"; // must be first
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { container } from "tsyringe";
import { VoiceXPEvent } from "~/events/VoiceXP";
import { formatElapsed } from "~/lib/duration";
import { tn } from "~/lib/i18n";
import { logger } from "~/lib/logger";
import { loadXpBoostConfig } from "~/lib/xp-boosts";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { SettingsService } from "~/services/SettingsService";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("elapsed time", () => {
  test("hours and minutes, spaced and unambiguous", () => {
    expect(formatElapsed(3 * HOUR, "fr")).toBe("3 h");
    expect(formatElapsed(3 * HOUR + 25 * MIN, "fr")).toBe("3 h 25 min");
    expect(formatElapsed(45 * MIN, "fr")).toBe("45 min");
    expect(formatElapsed(30_000, "fr")).toBe("30 s");
    expect(formatElapsed(26 * HOUR, "fr")).toBe("1 j 2 h");
  });

  test("minutes are rounded, never printed as 60 min", () => {
    expect(formatElapsed(2 * HOUR + 59 * MIN + 40_000, "fr")).toBe("3 h");
    expect(formatElapsed(59 * MIN + 31_000, "fr")).toBe("1 h");
  });

  test("English and Japanese units", () => {
    expect(formatElapsed(3 * HOUR + 25 * MIN, "en")).toBe("3 h 25 min");
    expect(formatElapsed(3 * HOUR + 25 * MIN, "ja")).toBe("3時間25分");
    expect(formatElapsed(45 * MIN, "ja")).toBe("45分");
  });
});

describe("summary text", () => {
  const templates = container.resolve(MessageTemplateService);

  test("duration, participants and XP are separated and read on their own", async () => {
    const rendered = await templates.render("sleepcall_end", {
      channelId: "99",
      duration: formatElapsed(3 * HOUR, "fr"),
      participants: 11,
      participantsLabel: tn("fr", "plural.participants", 11),
      xp: "1 234",
    });
    expect(rendered?.rendered).toBe(
      "☀️ Fin du sleepcall dans <#99> : 3 h · 11 participants · 1 234 XP gagnés au total.",
    );
    expect(rendered?.rendered).not.toMatch(/\d\s*à\s*\d/);
  });

  test("two people read '2 participants', one reads '1 participant'", () => {
    expect(tn("fr", "plural.participants", 2)).toBe("2 participants");
    expect(tn("fr", "plural.participants", 1)).toBe("1 participant");
  });
});

describe("closing a sleepcall", () => {
  const settings = container.resolve(SettingsService);
  const templates = container.resolve(MessageTemplateService);
  let published: Array<{ event: string; vars: Record<string, unknown> }>;
  let publish: ReturnType<typeof spyOn>;
  let warn: ReturnType<typeof spyOn>;

  beforeEach(() => {
    published = [];
    publish = spyOn(templates, "publish").mockImplementation((async (
      event: string,
      vars: Record<string, unknown>,
    ) => {
      published.push({ event, vars });
      return null;
    }) as never);
    warn = spyOn(logger, "warn");
  });
  afterEach(() => {
    publish.mockRestore();
    warn.mockRestore();
  });

  /** Closes one sleepcall that lasted `durationMs`, 11 participants, `xp` granted. */
  async function closeOne(durationMs: number, xp: number) {
    const event = container.resolve(VoiceXPEvent);
    const now = Date.now();
    const internals = event as unknown as {
      sleepcalls: Map<string, unknown>;
      closeSleepcalls(client: unknown, cfg: unknown, now: number): Promise<void>;
    };
    internals.sleepcalls.clear();
    internals.sleepcalls.set("chan-1", {
      channelId: "chan-1",
      startedAt: now - 10 * MIN - durationMs,
      lastSeenAt: now - 10 * MIN,
      participants: new Set(Array.from({ length: 11 }, (_, i) => `p${i}`)),
      xp,
    });
    const cfg = await loadXpBoostConfig(settings);
    await internals.closeSleepcalls(
      {},
      { ...cfg, sleepcall: { ...cfg.sleepcall, announce: true } },
      now,
    );
    return internals.sleepcalls.size;
  }

  test("a call that granted XP is announced with the readable duration", async () => {
    const left = await closeOne(3 * HOUR, 123_456);
    expect(left).toBe(0);
    expect(published).toHaveLength(1);
    const { event, vars } = published[0]!;
    expect(event).toBe("sleepcall_end");
    expect(vars.duration).toBe("3 h");
    expect(vars.participants).toBe(11);
    expect(vars.participantsLabel).toBe("11 participants");
    expect(String(vars.xp).replace(/\s/g, " ")).toBe("123 456");
  });

  test("a call without any XP is not announced, and the reason is logged", async () => {
    const left = await closeOne(45 * MIN, 0);
    expect(left).toBe(0);
    expect(published).toHaveLength(0);
    const skipped = warn.mock.calls.find((call: unknown[]) =>
      String(call.at(-1)).includes("sleepcall summary skipped"),
    );
    expect(skipped).toBeDefined();
    expect(skipped![0]).toMatchObject({ channelId: "chan-1", participants: 11 });
  });

  test("a call shorter than the summary threshold is silent whatever its XP", async () => {
    await closeOne(2 * MIN, 5_000);
    expect(published).toHaveLength(0);
  });
});
