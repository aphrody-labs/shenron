/**
 * Ranking: one total order (value descending, then id) for /top, /profil and the API.
 * Before, ties changed places from one page to the next and the /profil rank ("strictly
 * greater") did not match the /top position.
 */
import "./setup"; // must be first
import { beforeEach, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { users } from "~/db/schema";

const { LevelService } = await import("~/services/LevelService");
const { EconomyService } = await import("~/services/EconomyService");

const dbs = container.resolve(DatabaseService);
const levels = container.resolve(LevelService);
const eco = container.resolve(EconomyService);

beforeEach(() => {
  dbs.db.delete(users).run();
});

const ids = (n: number, prefix = "lb") =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(3, "0")}`);

describe("top XP", () => {
  test("les ex æquo gardent un ordre stable et les pages ne se recoupent pas", async () => {
    const all = ids(25);
    // Inserted out of order: the result must not depend on insertion order.
    await dbs.db.insert(users).values(all.toReversed().map((id) => ({ id, xp: 500 })));
    const pages = [
      await levels.top(10, 0),
      await levels.top(10, 10),
      await levels.top(10, 20),
    ].flat();
    expect(pages.map((u) => u.id)).toEqual(all);
    expect(new Set(pages.map((u) => u.id)).size).toBe(25);
  });

  test("le rang de /profil est la position de /top, ex æquo compris", async () => {
    const all = ids(12);
    await dbs.db.insert(users).values(all.map((id, i) => ({ id, xp: i < 6 ? 900 : 100 + i })));
    const top = await levels.top(50, 0);
    for (const [index, row] of top.entries()) {
      expect(await levels.rankOf(row.id)).toBe(index + 1);
    }
    expect(top[0]!.xp).toBe(900);
    expect(top.at(-1)!.xp).toBe(106);
  });

  test("un membre à 0 XP n'est ni classé ni compté", async () => {
    await dbs.db.insert(users).values([
      { id: "lb-a", xp: 10 },
      { id: "lb-zero", xp: 0 },
    ]);
    expect(await levels.rankOf("lb-zero")).toBeNull();
    expect(await levels.totalUsers()).toBe(1);
    expect((await levels.top(10)).map((u) => u.id)).toEqual(["lb-a"]);
  });

  test("consulter le rang d'un inconnu ne crée pas sa ligne", async () => {
    expect(await levels.rankOf("lb-ghost")).toBeNull();
    expect(await levels.findUser("lb-ghost")).toBeUndefined();
  });
});

describe("top zéni", () => {
  test("solde > 0 seulement, ex æquo départagés par identifiant", async () => {
    await dbs.db.insert(users).values([
      { id: "lb-z3", zeni: 50 },
      { id: "lb-z1", zeni: 50 },
      { id: "lb-z2", zeni: 80 },
      { id: "lb-z0", zeni: 0 },
    ]);
    expect((await eco.topRich(10)).map((u) => u.id)).toEqual(["lb-z2", "lb-z1", "lb-z3"]);
    expect((await eco.topRich(1, 1)).map((u) => u.id)).toEqual(["lb-z1"]);
  });
});
