import { describe, expect, test } from "bun:test";
import { clientDiscord, DiscordRESTError, enParallele } from "../scripts/lib/discord-rest";

/** Transport scripté : rend les réponses dans l'ordre et garde chaque requête. */
function transport(reponses: Array<() => Response>) {
  const requetes: Array<{ url: string; init: RequestInit }> = [];
  const fetchScripte = (async (url: string | URL | Request, init?: RequestInit) => {
    requetes.push({ url: String(url), init: init ?? {} });
    const suivante = reponses.shift();
    if (!suivante) throw new Error("requête inattendue");
    return suivante();
  }) as typeof fetch;
  return { fetchScripte, requetes };
}

const json =
  (corps: unknown, status = 200) =>
  () =>
    Response.json(corps, { status });

describe("scripts/lib/discord-rest — client des scripts au-dessus du kit", () => {
  test("jeton Bot, API v10 et corps JSON passent par le transport du kit", async () => {
    const { fetchScripte, requetes } = transport([json({ id: "42" })]);
    const api = clientDiscord("jeton-de-test", fetchScripte);
    const cree = await api<{ id: string }>("/channels/1/messages", {
      methode: "POST",
      corps: { content: "salut" },
    });
    expect(cree.id).toBe("42");
    expect(requetes[0]!.url).toBe("https://discord.com/api/v10/channels/1/messages");
    expect(requetes[0]!.init.method).toBe("POST");
    const entetes = requetes[0]!.init.headers as Record<string, string>;
    expect(entetes.Authorization).toBe("Bot jeton-de-test");
    expect(JSON.parse(String(requetes[0]!.init.body))).toEqual({ content: "salut" });
  });

  test("un 429 répété est attendu puis rejoué jusqu'au succès", async () => {
    const limite = json({ message: "You are being rate limited.", retry_after: 0 }, 429);
    const { fetchScripte, requetes } = transport([limite, limite, json([{ id: "1" }])]);
    const api = clientDiscord("t", fetchScripte);
    expect(await api<Array<{ id: string }>>("/guilds/1/channels")).toEqual([{ id: "1" }]);
    expect(requetes).toHaveLength(3);
  });

  test("un 4xx n'est pas rejoué et sort en DiscordRESTError", async () => {
    const { fetchScripte, requetes } = transport([
      json({ message: "Missing Access", code: 50001 }, 403),
    ]);
    const api = clientDiscord("t", fetchScripte);
    const erreur = await api("/channels/9").catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(DiscordRESTError);
    expect((erreur as DiscordRESTError).status).toBe(403);
    expect((erreur as DiscordRESTError).code).toBe(50001);
    expect((erreur as Error).message).toBe("GET /channels/9 → HTTP 403 Missing Access");
    expect(requetes).toHaveLength(1);
  });

  test("un 5xx est rejoué dans la limite des essais", async () => {
    const panne = json({ message: "Internal Server Error" }, 502);
    const { fetchScripte, requetes } = transport([panne, json({ ok: true })]);
    const api = clientDiscord("t", fetchScripte);
    expect(await api<{ ok: boolean }>("/users/@me", { essais: 2 })).toEqual({ ok: true });
    expect(requetes).toHaveLength(2);

    const toujours = transport([panne, panne]);
    const erreur = await clientDiscord("t", toujours.fetchScripte)("/users/@me", {
      essais: 2,
    }).catch((e: unknown) => e);
    expect((erreur as DiscordRESTError).status).toBe(502);
  });

  test("enParallele borne la concurrence et garde l'ordre", async () => {
    let actifs = 0;
    let pic = 0;
    const sortie = await enParallele([30, 5, 20, 1], 2, async (ms, i) => {
      pic = Math.max(pic, ++actifs);
      await Bun.sleep(ms);
      actifs--;
      return i;
    });
    expect(sortie).toEqual([0, 1, 2, 3]);
    expect(pic).toBe(2);
  });
});
