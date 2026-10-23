/**
 * The profile card is drawn in a render worker, where the server's level curve
 * (`setLevelThresholds`, main thread only) does not exist. CardService therefore hands the worker
 * the progress computed on the main thread; without it a 20 billion XP member read "level 10, MAX".
 */
import "./setup"; // must be first
import { expect, spyOn, test } from "bun:test";
import type { User } from "discord.js";
import { container } from "tsyringe";
import * as render from "~/render";
import { getLevelThresholds, setLevelThresholds } from "~/lib/xp";
import { CardService } from "~/services/CardService";

const member = {
  id: "1527405876695142620",
  username: "omar",
  displayName: "Omar",
  displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
} as unknown as User;

test("the profile card carries the progress of the server's curve, not the worker's default", async () => {
  const saved = [...getLevelThresholds()];
  setLevelThresholds([
    { level: 1, xp: 10 },
    { level: 18, xp: 10_000_000_000 },
    { level: 19, xp: 40_000_000_000 },
  ]);
  const spy = spyOn(render, "renderCardOnPool").mockResolvedValue({
    buffer: Buffer.alloc(0),
  } as never);
  try {
    await container.resolve(CardService).renderCard({
      discordUser: member,
      xp: 20_638_923_484,
      zeni: 27_500,
      messageCount: 6_000,
      episodeFrame: false,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const input = spy.mock.calls[0]![1] as {
      progress?: { level: number; next?: { level: number } };
    };
    expect(input.progress?.level).toBe(18);
    expect(input.progress?.next?.level).toBe(19);
  } finally {
    spy.mockRestore();
    setLevelThresholds(saved);
  }
});
