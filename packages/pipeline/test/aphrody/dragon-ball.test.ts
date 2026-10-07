// SPDX-License-Identifier: Apache-2.0
import { nativeFixture } from "./native-fixture";
import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DragonballCnService } from "../../src/bxc/services";

const directory = mkdtempSync(join(tmpdir(), "aphrody-dragon-ball-consumer-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const fixture = nativeFixture;

describe("Native Dragon Ball consumer", () => {
  it("uses the native owner's fresh snapshot instead of an older product snapshot", async () => {
    const output = join(directory, "campaign");
    mkdirSync(join(output, "assets/dragonballcn"), { recursive: true });
    mkdirSync(join(output, "data/catalogues"), { recursive: true });
    writeFileSync(
      join(output, "assets/dragonballcn/index.json"),
      JSON.stringify({
        collections: [
          {
            slug: "dragonball_full_color",
            titre: "Full Color",
            ouvrages: [
              {
                did: "0-1",
                titre: "Native volume",
                url_fiche: "https://comic.dragonballcn.com/list/gain_1.php?did=0-1",
                premiere_edition: "1985",
                couverture: { source_url: "https://comic.dragonballcn.com/cover.jpg" },
              },
            ],
          },
        ],
      }),
    );
    writeFileSync(join(output, "data/catalogues/dragonballcn-inventaire.json"), "{}");
    const nativeExecutor = fixture(
      "native-owner",
      `
const args = process.argv.slice(2);
if (args.slice(0, 5).join(" ") !== "web dragon-ball crawl --source dragonballcn") process.exit(2);
if (args[args.indexOf("--profile") + 1] !== "shenron" || !args.includes("--with-gallery")) process.exit(3);
console.log(JSON.stringify({profile:"shenron",campaign:{schema:"aphrody-dragon-ball-crawl/v1",completed:true,errors:[]}}));
`,
    );
    const catalogue = await new DragonballCnService().crawl(
      { out: output },
      { nativeExecutor: nativeExecutor },
    );
    expect(catalogue[0]?.title).toBe("Native volume");
    expect(catalogue[0]?.coverUrl).toBe("https://comic.dragonballcn.com/cover.jpg");
  });

  it("keeps partial or malformed campaigns open and propagates native failures", async () => {
    for (const [name, report, error] of [
      [
        "partial",
        { campaign: { schema: "aphrody-dragon-ball-crawl/v1", completed: false, errors: [] } },
        "incomplete",
      ],
      ["invalid", { campaign: {} }, "invalid"],
      [
        "collection-error",
        {
          campaign: {
            schema: "aphrody-dragon-ball-crawl/v1",
            completed: true,
            errors: [["url", "403"]],
          },
        },
        "collection errors",
      ],
    ] as const) {
      const nativeExecutor = fixture(
        name,
        `console.log(${JSON.stringify(JSON.stringify(report))});`,
      );
      await expect(
        new DragonballCnService().crawl({}, { nativeExecutor: nativeExecutor }),
      ).rejects.toThrow(error);
    }
    const failure = fixture("failure", 'console.error("owner unavailable"); process.exit(7);');
    await expect(new DragonballCnService().crawl({}, { nativeExecutor: failure })).rejects.toThrow(
      "owner unavailable",
    );
  });
});
