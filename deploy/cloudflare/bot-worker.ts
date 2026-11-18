// SPDX-License-Identifier: Apache-2.0
/**
 * Serverless Cloudflare Worker for the Shenron Discord bot (`bot.dragonballfr.com`).
 * Handles Discord Ed25519 HTTP Interactions, health/API endpoints, and Cron Triggers
 * without any VPS gateway process or local SQLite file.
 */
import {
  DISCORD_RESPONSE_TYPE,
  createDiscordInteractionHandler,
  createDiscordRest,
  type DiscordInteractionPayload,
} from "../../packages/discord-kit/src/cloudflare";

export interface BotWorkerEnv {
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_TOKEN?: string;
  APPLICATION_ID?: string;
  SHENRON_PUBLIC_SITE_URL?: string;
  API_ADMIN_TOKEN?: string;
  SHENRON_BILLING_OUTBOX_TOKEN?: string;
  SHENRON_AI_URL?: string;
  SHENRON_AI_HTTP_TOKEN?: string;
  AI_SERVICE?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  CDN?: R2Bucket;
}

interface R2Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function timingSafeBearerEqual(authHeader: string, expectedToken: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(authHeader)),
    crypto.subtle.digest("SHA-256", enc.encode(`Bearer ${expectedToken}`)),
  ]);
  const subtle = crypto.subtle as unknown as {
    timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(a, b);
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  let diff = viewA.length ^ viewB.length;
  for (let i = 0; i < viewA.length; i += 1) diff |= viewA[i]! ^ viewB[i]!;
  return diff === 0;
}

function siteOrigin(env: BotWorkerEnv): string {
  return (env.SHENRON_PUBLIC_SITE_URL?.trim() || "https://dragonballfr.com").replace(/\/+$/, "");
}

function optionValue(interaction: DiscordInteractionPayload, name: string): string {
  const opt = interaction.data?.options?.find((o) => o.name === name);
  return typeof opt?.value === "string" ? opt.value.trim() : "";
}

export function createBotWorkerRouter(env: BotWorkerEnv) {
  const publicKey = env.DISCORD_PUBLIC_KEY?.trim() ?? "";
  const interactions = createDiscordInteractionHandler({
    publicKey,
    commands: {
      ping: () => ({
        type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Shenron edge actif (Cloudflare Workers)." },
      }),
      wiki: async (interaction) => {
        const query = optionValue(interaction, "recherche") || optionValue(interaction, "query");
        const base = siteOrigin(env);
        const url = query ? `${base}/wiki?q=${encodeURIComponent(query)}` : `${base}/wiki`;
        return {
          type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: query
              ? `Resultat wiki pour **${query}** : ${url}`
              : `Encyclopedie Dragon Ball : ${url}`,
          },
        };
      },
      site: () => ({
        type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: siteOrigin(env) },
      }),
      ask: async (interaction) => {
        const question = optionValue(interaction, "question") || optionValue(interaction, "q");
        if (!question) {
          return {
            type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "Pose une question avec l'option `question`.", flags: 64 },
          };
        }
        const aiUrl = env.SHENRON_AI_URL?.trim();
        if (!aiUrl && !env.AI_SERVICE) {
          return {
            type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `${siteOrigin(env)}/ask?q=${encodeURIComponent(question)}` },
          };
        }
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          const aiToken = env.SHENRON_AI_HTTP_TOKEN?.trim();
          if (aiToken) headers.Authorization = `Bearer ${aiToken}`;
          const targetUrl = `${(aiUrl || "https://ai.dragonballfr.com").replace(/\/+$/, "")}/v1/chat/completions`;
          const fetcher = env.AI_SERVICE ? env.AI_SERVICE.fetch.bind(env.AI_SERVICE) : fetch;
          const res = await fetcher(targetUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  role: "system",
                  content:
                    "Tu es Shenron, l'assistant officiel de dragonballfr.com. Reponds en francais avec precision et concision.",
                },
                { role: "user", content: question },
              ],
              max_tokens: 400,
            }),
            signal: AbortSignal.timeout(2500),
          });
          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const answer = data.choices?.[0]?.message?.content?.trim();
          return {
            type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: answer ? answer.slice(0, 1900) : `${siteOrigin(env)}/ask`,
            },
          };
        } catch {
          return {
            type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `${siteOrigin(env)}/ask?q=${encodeURIComponent(question)}` },
          };
        }
      },
    },
    fallback: (interaction) => ({
      type: DISCORD_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: `Commande \`${interaction.data?.name ?? "inconnue"}\` : consulte ${siteOrigin(env)}`,
        flags: 64,
      },
    }),
  });
  return { interactions };
}

export async function handleBotWorker(request: Request, env: BotWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.pathname === "/health" ||
    url.pathname === "/api/health" ||
    url.pathname === "/api/health/check"
  ) {
    return json({
      status: "ok",
      service: "shenron-bot",
      runtime: "cloudflare-workers",
      interactionsConfigured: Boolean(env.DISCORD_PUBLIC_KEY?.trim()),
      site: siteOrigin(env),
    });
  }
  if (url.pathname === "/interactions" || url.pathname === "/api/interactions") {
    if (!env.DISCORD_PUBLIC_KEY?.trim()) {
      return json({ error: "discord_public_key_missing" }, 503);
    }
    return createBotWorkerRouter(env).interactions(request);
  }
  if (url.pathname === "/api/commands/sync" && request.method === "POST") {
    const admin = env.API_ADMIN_TOKEN?.trim();
    const auth = request.headers.get("Authorization")?.trim() ?? "";
    if (!admin || !(await timingSafeBearerEqual(auth, admin))) {
      return json({ error: "unauthorized" }, 401);
    }
    const token = env.DISCORD_TOKEN?.trim();
    const appId = env.APPLICATION_ID?.trim();
    if (!token || !appId) return json({ error: "discord_credentials_missing" }, 503);
    const rest = createDiscordRest(token);
    const synced = await rest.request("PUT", `/applications/${appId}/commands`, [
      { name: "ping", description: "Verifie la latence edge de Shenron" },
      { name: "site", description: "Lien direct vers dragonballfr.com" },
      {
        name: "wiki",
        description: "Rechercher dans le wiki Dragon Ball",
        options: [{ name: "recherche", description: "Terme", type: 3, required: false }],
      },
      {
        name: "ask",
        description: "Poser une question a Shenron",
        options: [
          { name: "question", description: "Question Dragon Ball", type: 3, required: true },
        ],
      },
    ]);
    return json({ ok: true, count: Array.isArray(synced) ? synced.length : 0 });
  }
  return json({ error: "not_found" }, 404);
}

export async function handleBotScheduled(
  event: { cron: string; scheduledTime: number },
  env: BotWorkerEnv,
): Promise<void> {
  const base = siteOrigin(env);
  const tasks: Promise<unknown>[] = [];
  const outboxToken = env.SHENRON_BILLING_OUTBOX_TOKEN?.trim();
  if (outboxToken) {
    tasks.push(
      fetch(`${base}/api/cron/billing-outbox`, {
        method: "POST",
        headers: { Authorization: `Bearer ${outboxToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cron: event.cron, scheduledTime: event.scheduledTime }),
      }).catch(() => {}),
    );
  }
  if (event.cron === "0 * * * *") {
    tasks.push(fetch(`${base}/api/health`).catch(() => {}));
  }
  await Promise.allSettled(tasks);
}

export default {
  fetch(request: Request, env: BotWorkerEnv): Promise<Response> {
    return handleBotWorker(request, env);
  },
  scheduled(
    event: { cron: string; scheduledTime: number },
    env: BotWorkerEnv,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ): void {
    ctx.waitUntil(handleBotScheduled(event, env));
  },
};
