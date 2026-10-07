// SPDX-License-Identifier: Apache-2.0
import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enrichCatalogue } from "../src/dragon-ball/catalogue";
import { enrichDragonBallCatalogue } from "../src/dragon-ball/enrichment";

const root = await mkdtemp(join(tmpdir(), "dragon-ball-editorial-"));
afterAll(() => rm(root, { recursive: true, force: true }));
const input = {
  collections: [
    { slug: "dragonball_jp_kanzenban", ouvrages: [{ did: "db-1", parution: "reviewed-date" }] },
  ],
};

test("existing publication metadata enriches a derivative without changing reviewed dates", () => {
  const result = enrichCatalogue(input);
  expect(result.collections[0]?.ouvrages[0]).toMatchObject({
    isbn: "4-08-873444-0",
    parution: "reviewed-date",
  });
  expect(input.collections[0]?.ouvrages[0]).not.toHaveProperty("isbn");
  expect(() => enrichCatalogue({ collections: [{ slug: "bad" }] })).toThrow("Invalid");
});

test("dry-run never deposits and freeze is checked before any output or database mutation", async () => {
  const cataloguePath = join(root, "catalogue.json"),
    outputPath = join(root, "derivative.json"),
    freezeFile = join(root, "freeze.json");
  await Bun.write(cataloguePath, JSON.stringify(input));
  await Bun.write(freezeFile, JSON.stringify({ frozen: true, reason: "Editorial review" }));
  let deposits = 0;
  const deposit = async () => {
    deposits++;
    return 1;
  };
  expect(
    (await enrichDragonBallCatalogue({ cataloguePath, outputPath, freezeFile, deposit })).status,
  ).toBe("planned");
  await expect(
    enrichDragonBallCatalogue({ cataloguePath, outputPath, freezeFile, deposit, apply: true }),
  ).rejects.toThrow();
  expect(deposits).toBe(0);
  expect(await Bun.file(outputPath).exists()).toBe(false);
});
