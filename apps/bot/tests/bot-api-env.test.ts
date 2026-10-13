// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { botApiEnvironment } from "../src/lib/bot-api-env";

describe("shared bot API credential aliases", () => {
  test("canonical credentials reach the bot's historical schema without mutating input", () => {
    const input = {
      SHENRON_ADMIN_TOKEN: " canonical-admin ",
      SHENRON_USER_SECRET: "canonical-user",
    };
    const resolved = botApiEnvironment(input);
    expect(resolved.API_ADMIN_TOKEN).toBe("canonical-admin");
    expect(resolved.API_USER_SECRET).toBe("canonical-user");
    expect(input).not.toHaveProperty("API_ADMIN_TOKEN");
  });
  test("legacy-only credentials remain supported and blank values stay absent", () => {
    expect(botApiEnvironment({ API_ADMIN_TOKEN: "legacy-admin" }).API_ADMIN_TOKEN).toBe(
      "legacy-admin",
    );
    expect(
      botApiEnvironment({ SHENRON_ADMIN_TOKEN: "  ", API_ADMIN_TOKEN: "legacy-admin" })
        .API_ADMIN_TOKEN,
    ).toBe("legacy-admin");
    expect(botApiEnvironment({ API_ADMIN_TOKEN: "null" }).API_ADMIN_TOKEN).toBeUndefined();
  });
  test("conflicting credentials fail with variable names only", () => {
    for (const [canonical, legacy] of [
      ["SHENRON_ADMIN_TOKEN", "API_ADMIN_TOKEN"],
      ["SHENRON_USER_SECRET", "API_USER_SECRET"],
    ]) {
      try {
        botApiEnvironment({ [canonical!]: "private-canonical", [legacy!]: "private-legacy" });
        throw new Error("expected conflict refusal");
      } catch (error) {
        const message = String(error);
        expect(message).toContain("alias mismatch");
        expect(message).not.toContain("private-canonical");
        expect(message).not.toContain("private-legacy");
      }
    }
  });
});
