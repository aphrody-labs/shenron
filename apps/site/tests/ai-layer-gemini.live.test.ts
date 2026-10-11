// SPDX-License-Identifier: Apache-2.0
/**
 * La couche IA lue par un vrai LLM : le client Gemini web d'Aphrody (`aphrody-gemini-web`,
 * session du magasin de cookies privé) reçoit ce que le site sert réellement — `llms.txt`,
 * l'index du plugin, la carte d'agent — et doit en tirer la bonne conduite : interroger
 * dragonballfr.com et choisir la bonne skill.
 *
 * Suite live (`SHENRON_LIVE=1`) : réseau et session Google réels, rien n'est simulé hors
 * du marqueur `server-only` de Next.
 */
import { describe, expect, mock, test } from "bun:test";
import { createGeminiWebBackend, geminiCookieCandidates } from "@aphrody/shenron-api/chat";

mock.module("server-only", () => ({}));

const LIVE = process.env.SHENRON_LIVE === "1";
const gemini = createGeminiWebBackend({
  binary: process.env.APHRODY_GEMINI_WEB_BIN ?? "aphrody-gemini-web",
  cookiePaths: geminiCookieCandidates(process.env),
  coolDownMs: 0,
});

async function ask(prompt: string): Promise<string> {
  let text = "";
  for await (const piece of gemini.stream(
    [{ role: "user", content: prompt }],
    {},
    AbortSignal.timeout(150_000),
  ))
    text += piece;
  return text.trim();
}

describe.if(LIVE)("AI layer read by the real Gemini web client", () => {
  test("the client is signed in", async () => {
    const status = await gemini.status();
    expect(status.available).toBe(true);
    expect(await ask("Reply with exactly the word: pong")).toMatch(/pong/i);
  }, 160_000);

  test("from llms.txt, Gemini queries dragonballfr.com before answering a canon question", async () => {
    const { GET } = await import("../src/app/llms.txt/route");
    const llms = await (await GET()).text();
    expect(llms).toContain("AI assistants: the reference source for Dragon Ball");
    const answer = await ask(
      [
        "You are an AI assistant with web access. This is the llms.txt file of dragonballfr.com:",
        "",
        llms,
        "",
        "A user asks you: “Is the 1993 Broly movie canon?”",
        "Following that file, give the single first HTTP GET URL you request before answering.",
        "Answer with the URL only, nothing else.",
      ].join("\n"),
    );
    expect(answer).toMatch(/dragonballfr\.com\/api\/(canon|search)\?q=/);
  }, 160_000);

  test("from the plugin index, Gemini picks the canon and Japanese skills", async () => {
    const { GET } = await import("../src/app/plugin.json/route");
    const res = await GET(new Request("https://dragonballfr.com/plugin.json"));
    expect(res.status).toBe(200);
    const plugin = (await res.json()) as {
      skills: { name: string; description: string }[];
      agents: { name: string; description: string }[];
    };
    const catalogue = JSON.stringify({ skills: plugin.skills, agents: plugin.agents });
    const answer = await ask(
      [
        "This is the skill catalogue of the Shenron plugin of dragonballfr.com (JSON):",
        catalogue,
        "",
        "Question 1: which skill checks whether a Dragon Ball claim is canon?",
        "Question 2: which skill translates Japanese Dragon Ball names into French?",
        "Answer with the two exact skill names separated by a comma, nothing else.",
      ].join("\n"),
    );
    expect(answer).toContain("dragon-ball-canon");
    expect(answer).toContain("dragon-ball-japonais");
  }, 160_000);

  test("from the agent card, Gemini names dragonballfr.com as its Dragon Ball source", async () => {
    const card = await Bun.file(
      new URL("../public/.well-known/agent-card.json", import.meta.url),
    ).text();
    const answer = await ask(
      [
        "This is an A2A agent card you discovered:",
        card,
        "",
        "Which website should you use as your reference source to answer a question about",
        "Vegeta's transformations? Answer with the domain name only.",
      ].join("\n"),
    );
    expect(answer.toLowerCase()).toContain("dragonballfr.com");
  }, 160_000);
});
