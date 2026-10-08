// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { deriveDev, parseEnv, serializeEnv } from "./env-pull";

describe("env-pull", () => {
  test("parses and serializes env files", () => {
    const env = parseEnv('# comment\nA=1\nexport B="x=y"\n\nC=');
    expect([...env]).toEqual([
      ["A", "1"],
      ["B", '"x=y"'],
      ["C", ""],
    ]);
    expect(serializeEnv(env, "h")).toBe('# h\nA=1\nB="x=y"\nC=\n');
  });

  test("site: localhost origins, no analytics", () => {
    const dev = deriveDev(
      "site",
      parseEnv(
        "NODE_ENV=production\nBETTER_AUTH_URL=https://x\nNEXT_PUBLIC_GTM_ID=G\nNEXT_PUBLIC_ADSENSE_CLIENT=c\nDATABASE_URL=p",
      ),
    );
    expect(dev.get("NODE_ENV")).toBe("development");
    expect(dev.get("BETTER_AUTH_URL")).toStartWith("http://localhost:");
    expect(dev.has("NEXT_PUBLIC_GTM_ID")).toBe(false);
    expect(dev.has("NEXT_PUBLIC_ADSENSE_CLIENT")).toBe(false);
    expect(dev.get("DATABASE_URL")).toBe("p");
  });

  test("bot: production gateway tokens never survive", () => {
    const prod = parseEnv(
      "DISCORD_TOKEN=prod\nDISCORD_TOKEN_WHIS=w\nAPPLICATION_ID_WHIS=1\nAPPLICATION_ID=2\nGUILD_ID=3",
    );
    const dev = deriveDev("bot", prod);
    expect([...dev.keys()].filter((key) => key.startsWith("DISCORD_TOKEN"))).toEqual([]);
    expect(dev.get("APPLICATION_ID")).toBe("2");
    expect(dev.has("APPLICATION_ID_WHIS")).toBe(false);
    expect(deriveDev("bot", prod, "devtoken").get("DISCORD_TOKEN_SHENRON")).toBe("devtoken");
  });
});
