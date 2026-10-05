import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discordFetch, DiscordRESTError } from "@aphrody/discord-kit/rest";
import { ChannelError, DiscordChannel } from "@aphrody/messaging";

const ADMIN_LAB_CHANNEL_ID = process.env.ADMIN_LAB_CHANNEL_ID ?? "1548677623935139901";

let cachedToken: string | null = null;

async function getDiscordBotToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (process.env.DISCORD_TOKEN_SHENRON) {
    cachedToken = process.env.DISCORD_TOKEN_SHENRON;
    return cachedToken;
  }
  if (process.env.DISCORD_TOKEN) {
    cachedToken = process.env.DISCORD_TOKEN;
    return cachedToken;
  }

  const envCandidates = [
    join(process.cwd(), "apps", "bot", ".env"),
    join(process.cwd(), "..", "bot", ".env"),
    join(process.cwd(), ".env"),
  ];

  for (const path of envCandidates) {
    const content = await readFile(/* turbopackIgnore: true */ path, "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("DISCORD_TOKEN_SHENRON=")) {
        cachedToken = trimmed
          .slice("DISCORD_TOKEN_SHENRON=".length)
          .replace(/^['"]|['"]$/g, "")
          .trim();
        return cachedToken;
      }
      if (trimmed.startsWith("DISCORD_TOKEN=")) {
        cachedToken = trimmed
          .slice("DISCORD_TOKEN=".length)
          .replace(/^['"]|['"]$/g, "")
          .trim();
        return cachedToken;
      }
    }
  }

  throw new Error("DISCORD_TOKEN introuvable pour communiquer avec le salon admin");
}

export interface AdminLabMessageOptions {
  content?: string;
  embeds?: any[];
  channelId?: string;
}

/**
 * `fetch` des transports Discord. Quand l'environnement impose un proxy dont Bun ne parle pas
 * le protocole (ex. `socks5h://`), l'hôte visé passe dans `NO_PROXY` et la requête repart en
 * direct : c'est ce que faisait l'ancien repli `curl` sans proxy, pour tous les appels suivants.
 */
const fetchDiscord = (async (input: string | URL | Request, init?: RequestInit) => {
  try {
    return await fetch(input, init);
  } catch (e: any) {
    const proxyRefuse =
      e?.code === "UnsupportedProxyProtocol" ||
      String(e?.message ?? "").includes("UnsupportedProxyProtocol");
    if (!proxyRefuse) throw e;
    const hote = new URL(input instanceof Request ? input.url : String(input)).hostname;
    const actuel = process.env.NO_PROXY ?? process.env.no_proxy;
    process.env.NO_PROXY = actuel ? `${actuel},${hote}` : hote;
    return fetch(input, init);
  }
}) as typeof fetch;

/**
 * Un canal par jeton, réutilisé : le `REST` de `@discordjs/rest` sous `DiscordChannel` garde
 * ses seaux de rate-limit et arme deux minuteries de balayage à chaque construction.
 */
const canaux = new Map<string, DiscordChannel>();
function canal(token: string, transport: typeof fetch): DiscordChannel {
  if (transport !== fetchDiscord) return new DiscordChannel({ token, fetch: transport });
  let existant = canaux.get(token);
  if (!existant) {
    existant = new DiscordChannel({ token, fetch: fetchDiscord });
    canaux.set(token, existant);
  }
  return existant;
}

/** Erreur HTTP Discord des deux transports, au format historique du module. */
function erreurAdminLab(action: string, e: unknown): unknown {
  const status =
    e instanceof DiscordRESTError
      ? e.status
      : e instanceof ChannelError
        ? ((e.cause as { status?: number } | undefined)?.status ?? e.code)
        : undefined;
  if (status === undefined) return e;
  return new Error(`[AdminLab] Erreur ${action} (${status}): ${(e as Error).message}`, {
    cause: e,
  });
}

/**
 * Poste un message dans un salon. Texte seul : canal de messagerie d'Aphrody
 * (`@aphrody/messaging`, `@discordjs/rest` : seaux de rate-limit, reprises). Avec embeds :
 * client REST de `@aphrody/discord-kit`, car `DiscordChannel` 0.1.0 n'envoie que du texte
 * ou un fichier. `transport` remplace `fetch` (tests).
 */
async function postAdminLabMessage(
  token: string,
  channelId: string,
  payload: Pick<AdminLabMessageOptions, "content" | "embeds">,
  transport: typeof fetch = fetchDiscord,
): Promise<{ id: string }> {
  if (payload.content && !payload.embeds?.length) {
    const sent = await canal(token, transport).sendText(channelId, payload.content);
    return { id: sent.id };
  }
  const { data } = await discordFetch<{ id: string }>(`/channels/${channelId}/messages`, {
    mode: "Bot",
    token,
    method: "POST",
    body: { content: payload.content, embeds: payload.embeds },
    fetch: transport,
  });
  return { id: data.id };
}

/**
 * Envoie un message au salon réservé aux administrateurs.
 * Utilisable par n'importe quel script, tâche cron ou sous-agent du monorepo.
 */
export async function sendAdminLabMessage(
  options: AdminLabMessageOptions | string,
): Promise<{ id: string; ok: boolean }> {
  if (process.env.NODE_ENV === "test") {
    return { id: "test-message-id", ok: true };
  }

  const token = await getDiscordBotToken();
  const payload = typeof options === "string" ? { content: options } : options;
  const channelId = payload.channelId ?? ADMIN_LAB_CHANNEL_ID;
  try {
    const { id } = await postAdminLabMessage(token, channelId, payload);
    return { id, ok: true };
  } catch (e) {
    throw erreurAdminLab("d'envoi", e);
  }
}

/**
 * Récupère les derniers messages du salon admin pour permettre aux agents
 * de lire les requêtes et instructions des administrateurs.
 */
export async function getAdminLabRecentMessages(
  limit = 10,
  channelId = ADMIN_LAB_CHANNEL_ID,
): Promise<any[]> {
  if (process.env.NODE_ENV === "test") {
    return [];
  }

  const token = await getDiscordBotToken();
  try {
    const { data } = await discordFetch<any[]>(`/channels/${channelId}/messages?limit=${limit}`, {
      mode: "Bot",
      token,
      fetch: fetchDiscord,
    });
    return data;
  } catch (e) {
    throw erreurAdminLab("de lecture", e);
  }
}
