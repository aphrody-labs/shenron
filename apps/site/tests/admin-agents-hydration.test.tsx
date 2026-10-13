import { describe, expect, test } from "bun:test";

async function renderInTimezone(timezone: string): Promise<string> {
  const actions = `${import.meta.dir}/../src/app/admin/agents/_actions.ts`;
  const component = `${import.meta.dir}/../src/app/admin/agents/AgentKeysManager.tsx`;
  const source = `
    import { mock } from "bun:test";
    import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    mock.module(${JSON.stringify(actions)}, () => ({
      createAgentKeyAction() {}, revokeAgentKeyAction() {}, updateScopesAction() {}
    }));
    const { AgentKeysManager } = await import(${JSON.stringify(component)});
    const keys = [{ id: "fixture", name: "Fixture", prefix: "fixture", scopes: ["read"],
      note: null, createdBy: null, createdAt: "2026-10-13T12:30:00.000Z",
      lastUsedAt: "2026-01-13T12:30:00.000Z", revokedAt: null,
      rateLimitPerHour: null, calls24h: 0 }];
    console.log(renderToStaticMarkup(createElement(AgentKeysManager,
      { keys, scopes: ["read"], scopeDescriptions: { read: "Fixture read" } })));
  `;
  const subprocess = Bun.spawn([process.execPath, "-e", source], {
    cwd: `${import.meta.dir}/..`,
    env: { ...process.env, TZ: timezone },
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const [markup, errors, exit] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);
  expect(errors).toBe("");
  expect(exit).toBe(0);
  return markup;
}

describe("agent key date hydration", () => {
  test("server UTC and browser Paris produce identical summer and winter dates", async () => {
    const [server, browser] = await Promise.all([
      renderInTimezone("UTC"),
      renderInTimezone("Europe/Paris"),
    ]);
    expect(server).toBe(browser);
    expect(server).toContain("14:30");
    expect(server).toContain("13:30");
  });
});
