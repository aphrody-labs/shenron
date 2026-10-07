// SPDX-License-Identifier: Apache-2.0
import { nativeFixture } from "./native-fixture";
import { describe, expect, it } from "bun:test";
import { AphrodyTranslateService } from "../../src/aphrody/translate";
import { GoogleTranslateService } from "../../src/bxc/services";

const fixture = nativeFixture;

describe("Rust translation consumer contract", () => {
  it("preserves a requested Japanese target and option-like source text in its CLI request", async () => {
    const nativeExecutor = fixture(
      "translate-success",
      `
const args = process.argv.slice(2);
if (args[0] !== "translate" || !args.includes("--json") || args[args.length - 2] !== "--") process.exit(2);
console.log(JSON.stringify({ translatedText: args.at(-1), target: args[args.indexOf("--target") + 1], detectedSource: args[args.indexOf("--source") + 1], provider: "aphrody-translate" }));
`,
    );
    const result = await new AphrodyTranslateService({ nativeExecutor }).translate(
      "--Hello",
      "ja",
      "en",
    );
    expect(result).toEqual({
      translatedText: "--Hello",
      target: "ja",
      detectedSource: "en",
      provider: "aphrody-translate",
    });
  });

  it("propagates owner failures instead of returning untranslated input or starting another provider", async () => {
    const nativeExecutor = fixture(
      "translate-failure",
      'console.error("backend unavailable"); process.exit(7);',
    );
    await expect(
      new AphrodyTranslateService({ nativeExecutor }).translate("Hello", "fr", "en"),
    ).rejects.toThrow("exited 7: backend unavailable");
  });

  it("rejects output for a different language", async () => {
    const nativeExecutor = fixture(
      "translate-wrong-target",
      'console.log(JSON.stringify({translatedText:"Bonjour",target:"de",provider:"aphrody-translate"}));',
    );
    await expect(
      new AphrodyTranslateService({ nativeExecutor }).translate("Hello", "fr", "en"),
    ).rejects.toThrow("invalid target");
  });

  it("keeps the historical compatibility entry point's empty-input contract", async () => {
    expect(await new GoogleTranslateService().translate("  ", "fr", "en")).toEqual({
      translatedText: "  ",
      target: "fr",
      detectedSource: "en",
      provider: "cache",
    });
  });
});
