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

  test("local-services mode keeps production keys but isolates state and credentials", () => {
    const site = deriveDev(
      "site",
      parseEnv(
        "DATABASE_URL=postgres://prod\nREDIS_URL=redis://prod\nSHENRON_API_URL=https://api.prod\nNEXT_PUBLIC_CDN_URL=https://cdn.prod\nSHENRON_ADMIN_TOKEN=prod-admin\nBETTER_AUTH_SECRET=prod-auth",
      ),
      undefined,
      true,
      {
        authSecret: "local-auth",
        adminToken: "local-admin",
        userSecret: "local-user",
      },
    );
    expect(site.get("DATABASE_URL")).toBe(
      "postgresql://shenron:shenron_local_only@127.0.0.1:5432/shenron_site_local",
    );
    expect(site.get("REDIS_URL")).toBe("redis://127.0.0.1:6379/0");
    expect(site.get("SHENRON_API_URL")).toBe("http://127.0.0.1:5006");
    expect(site.get("NEXT_PUBLIC_CDN_URL")).toBe("http://localhost:8080");
    expect(site.get("SHENRON_ADMIN_TOKEN")).toBe("local-admin");
    expect(site.get("BETTER_AUTH_SECRET")).toBe("local-auth");
    expect(site.get("DISCORD_CLIENT_SECRET")).toBeUndefined();

    const bot = deriveDev(
      "bot",
      parseEnv(
        "DATABASE_URL=postgres://prod\nAPI_ADMIN_TOKEN=prod-admin\nAPI_USER_SECRET=prod-user",
      ),
      undefined,
      true,
      {
        authSecret: "local-auth",
        adminToken: "local-admin",
        userSecret: "local-user",
      },
    );
    expect(bot.get("DATABASE_URL")).toBe(site.get("DATABASE_URL"));
    expect(bot.get("API_ADMIN_TOKEN")).toBe(site.get("SHENRON_ADMIN_TOKEN"));
    expect(bot.get("API_USER_SECRET")).toBe("local-user");
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
