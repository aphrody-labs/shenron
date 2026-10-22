import "./setup"; // must be first
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActivePlayers,
  ChallengeBoard,
  duelStakeError,
  grantLine,
  opponentError,
  stakeSummary,
} from "../src/services/games/duel";
import {
  GameSessionJournal,
  STALE_AFTER_MS,
  journalPathFor,
} from "../src/services/games/session-journal";

const A = "111111111111111111";
const B = "222222222222222222";
const C = "333333333333333333";

describe("ChallengeBoard", () => {
  test("only the opponent accepts, once", () => {
    const board = new ChallengeBoard<{ challengerId: string; opponentId: string }>();
    board.open("k", { challengerId: A, opponentId: B });
    expect(board.take("k", C, "accept").kind).toBe("not-addressed");
    expect(board.take("k", A, "accept").kind).toBe("not-addressed");
    expect(board.take("k", B, "accept").kind).toBe("accepted");
    // A double click finds nothing left.
    expect(board.take("k", B, "accept").kind).toBe("missing");
  });

  test("the challenger may withdraw, the opponent may decline", () => {
    const board = new ChallengeBoard<{ challengerId: string; opponentId: string }>();
    board.open("w", { challengerId: A, opponentId: B });
    expect(board.take("w", A, "decline").kind).toBe("withdrawn");
    board.open("d", { challengerId: A, opponentId: B });
    expect(board.take("d", B, "decline").kind).toBe("declined");
    expect(board.size).toBe(0);
  });

  test("an expired challenge is gone", () => {
    const board = new ChallengeBoard<{ challengerId: string; opponentId: string }>(1_000);
    board.open("e", { challengerId: A, opponentId: B }, 0);
    expect(board.involves(A, 500)).toBe(true);
    expect(board.take("e", B, "accept", 2_000).kind).toBe("missing");
  });
});

describe("ActivePlayers", () => {
  test("reserves all or nothing", () => {
    const players = new ActivePlayers();
    expect(players.reserve([A])).toBe(true);
    expect(players.reserve([A, B])).toBe(false);
    expect(players.has(B)).toBe(false);
    players.release([A]);
    expect(players.reserve([A, B])).toBe(true);
  });
});

describe("duel validation", () => {
  const opponent = { id: B, toString: () => `<@${B}>` };
  const deps = (balances: Record<string, number>, max = 1_000) => ({
    getBalance: async (id: string) => balances[id] ?? 0,
    maxStake: async () => max,
  });

  test("enforces the max stake on every game", async () => {
    expect(await duelStakeError(deps({ [A]: 5_000, [B]: 5_000 }), A, opponent, 2_000)).toContain(
      "Mise maximale",
    );
  });

  test("checks both balances", async () => {
    expect(await duelStakeError(deps({ [A]: 10, [B]: 500 }), A, opponent, 100)).toContain(
      "Tu n'as que",
    );
    expect(await duelStakeError(deps({ [A]: 500, [B]: 10 }), A, opponent, 100)).toContain(
      `<@${B}>`,
    );
    expect(await duelStakeError(deps({ [A]: 500, [B]: 500 }), A, opponent, 100)).toBeNull();
    expect(await duelStakeError(deps({}), A, opponent, 0)).toBeNull();
  });

  test("rejects bots, self and missing opponents", () => {
    expect(opponentError(A, undefined)).not.toBeNull();
    expect(opponentError(A, { id: B, bot: true })).not.toBeNull();
    expect(opponentError(A, { id: A, bot: false })).not.toBeNull();
    expect(opponentError(A, { id: B, bot: false })).toBeNull();
  });

  test("result and stake lines", () => {
    expect(grantLine({ paid: 50, blocked: null }, A)).toContain(`<@${A}>`);
    expect(grantLine({ paid: 0, blocked: "daily-cap" }, A)).toContain("plafond quotidien");
    expect(grantLine({ paid: 0, blocked: null }, A)).toBe("Aucun gain.");
    expect(stakeSummary(100, 50)).toContain("pot");
    expect(stakeSummary(0, 50, 10)).toContain("Perdant");
  });
});

describe("GameSessionJournal", () => {
  const dir = mkdtempSync(join(tmpdir(), "shenron-games-journal-"));
  const path = join(dir, "game-sessions.json");

  test("no path, no persistence", () => {
    expect(journalPathFor(":memory:")).toBeNull();
    const journal = new GameSessionJournal(null);
    journal.open({ id: "x", game: "morpion", players: [A], stake: 0 });
    expect(journal.entries()).toEqual([]);
  });

  test("sessions of a live boot are never taken", () => {
    const owner = new GameSessionJournal(path);
    const other = new GameSessionJournal(path);
    owner.open({ id: "g1", game: "pendu", players: [A, B], stake: 100 });
    other.heartbeat();
    expect(other.takeOrphans()).toEqual([]);
    expect(owner.entries().map((e) => e.id)).toEqual(["g1"]);
  });

  test("sessions of a dead boot are taken once, closed sessions never", () => {
    const old = new GameSessionJournal(path);
    const start = Date.now();
    old.open({ id: "g2", game: "bingo", players: [A, B], stake: 40 }, start);
    old.open({ id: "g3", game: "morpion", players: [C], stake: 0 }, start);
    old.close("g3");
    old.update("g2", { channelId: "c", messageId: "m" });
    const fresh = new GameSessionJournal(path);
    const later = start + STALE_AFTER_MS + 1_000;
    const orphans = fresh.takeOrphans(later).filter((e) => e.bootId === old.bootId);
    expect(orphans.map((e) => [e.id, e.stake, e.messageId])).toEqual([["g2", 40, "m"]]);
    expect(fresh.takeOrphans(later).filter((e) => e.bootId === old.bootId)).toEqual([]);
  });
});
