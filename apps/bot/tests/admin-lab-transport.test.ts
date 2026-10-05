import { describe, expect, test } from "bun:test";
import { postAdminLabMessage } from "../src/lib/admin-lab";

/** Faux Discord local : aucune connexion réseau, chaque requête est gardée. */
function fauxDiscord() {
  const requetes: Array<{ url: string; method: string; auth: string | null; corps: unknown }> = [];
  const transport = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const brut = typeof init?.body === "string" ? init.body : null;
    requetes.push({
      url: String(input instanceof Request ? input.url : input),
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      corps: brut ? JSON.parse(brut) : null,
    });
    return Response.json({ id: `m${requetes.length}`, channel_id: "123" });
  }) as typeof fetch;
  return { transport, requetes };
}

describe("admin-lab — transports Aphrody", () => {
  test("un texte seul part par DiscordChannel (@aphrody/messaging)", async () => {
    const { transport, requetes } = fauxDiscord();
    const sent = await postAdminLabMessage("jeton", "123", { content: "Rapport prêt" }, transport);
    expect(sent.id).toBe("m1");
    expect(requetes).toHaveLength(1);
    expect(requetes[0]!.url).toBe("https://discord.com/api/v10/channels/123/messages");
    expect(requetes[0]!.method).toBe("POST");
    expect(requetes[0]!.auth).toBe("Bot jeton");
    expect(requetes[0]!.corps).toEqual({ content: "Rapport prêt" });
  });

  test("des embeds partent par le REST de @aphrody/discord-kit, contenu compris", async () => {
    const { transport, requetes } = fauxDiscord();
    const embeds = [{ title: "🎯 Objectif", description: "fait" }];
    const sent = await postAdminLabMessage(
      "jeton",
      "123",
      { content: "voir ci-dessous", embeds },
      transport,
    );
    expect(sent.id).toBe("m1");
    expect(requetes[0]!.url).toBe("https://discord.com/api/v10/channels/123/messages");
    expect(requetes[0]!.auth).toBe("Bot jeton");
    expect(requetes[0]!.corps).toEqual({ content: "voir ci-dessous", embeds });
  });
});
