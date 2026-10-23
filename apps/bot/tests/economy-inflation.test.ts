/**
 * Inflation index: frozen accounts hold money that cannot move (one held 99.96 % of the
 * supply and pushed the index toward its ceiling by +2 % a day), and an empty supply must
 * not leave a spurious snapshot (ten of them dropped the index back to 1.0).
 */
import "./setup"; // must be first
import { beforeEach, describe, expect, test } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { users } from "~/db/schema";

const { InflationService } = await import("~/services/InflationService");

const dbs = container.resolve(DatabaseService);
const inflation = container.resolve(InflationService);

const rows = () =>
  dbs.sqlite.query("SELECT * FROM economy_index").all() as Array<{
    day: string;
    supply: number;
  }>;

beforeEach(() => {
  dbs.db.delete(users).run();
  dbs.sqlite.exec("DELETE FROM economy_index");
});

describe("moneySupply", () => {
  test("exclut les comptes gelés", async () => {
    await dbs.db.insert(users).values([
      { id: "inf-a", zeni: 1_000 },
      { id: "inf-b", zeni: 2_500 },
      { id: "inf-frozen", zeni: 999_999_948_999, zeniFrozen: true },
    ]);
    expect(inflation.moneySupply()).toBe(3_500);
    const point = await inflation.snapshot();
    expect(point?.supply).toBe(3_500);
    expect(rows()).toHaveLength(1);
    expect((await inflation.status()).supply).toBe(3_500);
  });
});

describe("snapshot", () => {
  test("n'écrit rien quand la masse monétaire vaut 0", async () => {
    await dbs.db.insert(users).values([{ id: "inf-only-frozen", zeni: 5_000, zeniFrozen: true }]);
    expect(inflation.moneySupply()).toBe(0);
    expect(await inflation.snapshot()).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  test("une base vide ne remplace pas le point du jour déjà pris", async () => {
    await dbs.db.insert(users).values([{ id: "inf-real", zeni: 4_000 }]);
    const first = await inflation.snapshot();
    expect(first?.supply).toBe(4_000);
    dbs.db.delete(users).run();
    expect(await inflation.snapshot()).toBeNull();
    expect(rows()).toEqual([expect.objectContaining({ supply: 4_000 })]);
  });
});
