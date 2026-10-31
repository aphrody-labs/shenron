// SPDX-License-Identifier: Apache-2.0
/**
 * Salon admin du lab IA (Discord), partagé par le bot et le site.
 *
 * Le salon vient de `resolveDiscordAi` (`ADMIN_LAB_CHANNEL_ID`, sinon le salon général de la
 * guilde Aphrody). Les transports Discord (`@aphrody/discord-kit`, `@aphrody/messaging`) sont
 * fournis par l'application qui les déclare : ce paquet ne les importe pas.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveDiscordAi } from "@aphrody/shenron-config/discord-ai";

export interface AdminLabMessageOptions {
  content?: string;
  embeds?: any[];
  channelId?: string;
}

/** Le sous-ensemble de `discordFetch` (`@aphrody/discord-kit/rest`) utilisé ici. */
export type AdminLabDiscordFetch = <T>(
  path: string,
  opts: { mode: "Bot"; token: string; method?: string; body?: unknown; fetch?: typeof fetch },
) => Promise<{ data: T }>;

/** Le sous-ensemble de `DiscordChannel` (`@aphrody/messaging`) utilisé ici. */
export interface AdminLabChannel {
  sendText(channelId: string, content: string): Promise<{ id: string }>;
}

export interface AdminLabTransports {
  discordFetch: AdminLabDiscordFetch;
  /** Construit un canal de messagerie texte pour un jeton. */
  createChannel(opts: { token: string; fetch: typeof fetch }): AdminLabChannel;
  /** Statut HTTP d'une erreur des deux transports, `undefined` pour une autre erreur. */
  httpStatus(error: unknown): number | string | undefined;
  /** Fichiers `.env` supplémentaires où chercher le jeton du bot. */
  envFiles?: readonly string[];
}

export interface AdminLab {
  readonly channelId: string | undefined;
  postAdminLabMessage(
    token: string,
    channelId: string,
    payload: Pick<AdminLabMessageOptions, "content" | "embeds">,
    transport?: typeof fetch,
  ): Promise<{ id: string }>;
  sendAdminLabMessage(
    options: AdminLabMessageOptions | string,
  ): Promise<{ id: string; ok: boolean }>;
  getAdminLabRecentMessages(limit?: number, channelId?: string): Promise<any[]>;
}

/** Salon admin résolu depuis l'environnement, sans identifiant codé en dur. */
export function adminLabChannelId(env?: Record<string, string | undefined>) {
  return resolveDiscordAi(env ?? process.env).adminChannelId;
}

/**
 * `fetch` des transports Discord. Quand l'environnement impose un proxy dont Bun ne parle pas
 * le protocole (ex. `socks5h://`), l'hôte visé passe dans `NO_PROXY` et la requête repart en
 * direct : c'est ce que faisait l'ancien repli `curl` sans proxy, pour tous les appels suivants.
 */
export const fetchDiscord = (async (input: string | URL | Request, init?: RequestInit) => {
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

const TOKEN_KEYS = ["DISCORD_TOKEN_SHENRON", "DISCORD_TOKEN"] as const;

export function createAdminLab(transports: AdminLabTransports): AdminLab {
  const channelId = adminLabChannelId();
  let cachedToken: string | null = null;

  async function getDiscordBotToken(): Promise<string> {
    if (cachedToken) return cachedToken;
    for (const key of TOKEN_KEYS) {
      const value = process.env[key];
      if (value) return (cachedToken = value);
    }
    const candidates = [
      join(process.cwd(), "apps", "bot", ".env"),
      join(process.cwd(), "..", "bot", ".env"),
      join(process.cwd(), ".env"),
      ...(transports.envFiles ?? []),
    ];
    for (const path of candidates) {
      const content = await readFile(/* turbopackIgnore: true */ path, "utf8").catch(() => "");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        const key = TOKEN_KEYS.find((k) => trimmed.startsWith(`${k}=`));
        if (!key) continue;
        return (cachedToken = trimmed
          .slice(key.length + 1)
          .replace(/^['"]|['"]$/g, "")
          .trim());
      }
    }
    throw new Error("DISCORD_TOKEN introuvable pour communiquer avec le salon admin");
  }

  /**
   * Un canal par jeton, réutilisé : le `REST` de `@discordjs/rest` sous `DiscordChannel` garde
   * ses seaux de rate-limit et arme deux minuteries de balayage à chaque construction.
   */
  const canaux = new Map<string, AdminLabChannel>();
  function canal(token: string, transport: typeof fetch): AdminLabChannel {
    if (transport !== fetchDiscord) return transports.createChannel({ token, fetch: transport });
    let existant = canaux.get(token);
    if (!existant) {
      existant = transports.createChannel({ token, fetch: fetchDiscord });
      canaux.set(token, existant);
    }
    return existant;
  }

  /** Erreur HTTP Discord des deux transports, au format historique du module. */
  function erreurAdminLab(action: string, e: unknown): unknown {
    const status = transports.httpStatus(e);
    if (status === undefined) return e;
    return new Error(`[AdminLab] Erreur ${action} (${status}): ${(e as Error).message}`, {
      cause: e,
    });
  }

  function requireChannel(id: string | undefined): string {
    if (!id) throw new Error("ADMIN_LAB_CHANNEL_ID is required outside the Aphrody guild");
    return id;
  }

  /**
   * Poste un message dans un salon. Texte seul : canal de messagerie d'Aphrody
   * (`@aphrody/messaging`, `@discordjs/rest` : seaux de rate-limit, reprises). Avec embeds :
   * client REST de `@aphrody/discord-kit`, car `DiscordChannel` 0.1.0 n'envoie que du texte
   * ou un fichier. `transport` remplace `fetch` (tests).
   */
  async function postAdminLabMessage(
    token: string,
    target: string,
    payload: Pick<AdminLabMessageOptions, "content" | "embeds">,
    transport: typeof fetch = fetchDiscord,
  ): Promise<{ id: string }> {
    if (payload.content && !payload.embeds?.length) {
      const sent = await canal(token, transport).sendText(target, payload.content);
      return { id: sent.id };
    }
    const { data } = await transports.discordFetch<{ id: string }>(`/channels/${target}/messages`, {
      mode: "Bot",
      token,
      method: "POST",
      body: { content: payload.content, embeds: payload.embeds },
      fetch: transport,
    });
    return { id: data.id };
  }

  return {
    channelId,
    postAdminLabMessage,

    /**
     * Envoie un message au salon réservé aux administrateurs.
     * Utilisable par n'importe quel script, tâche cron ou sous-agent du monorepo.
     */
    async sendAdminLabMessage(options) {
      if (process.env.NODE_ENV === "test") return { id: "test-message-id", ok: true };
      const token = await getDiscordBotToken();
      const payload = typeof options === "string" ? { content: options } : options;
      const target = requireChannel(payload.channelId ?? channelId);
      try {
        const { id } = await postAdminLabMessage(token, target, payload);
        return { id, ok: true };
      } catch (e) {
        throw erreurAdminLab("d'envoi", e);
      }
    },

    /**
     * Récupère les derniers messages du salon admin pour permettre aux agents
     * de lire les requêtes et instructions des administrateurs.
     */
    async getAdminLabRecentMessages(limit = 10, target = channelId) {
      if (process.env.NODE_ENV === "test") return [];
      const token = await getDiscordBotToken();
      const id = requireChannel(target);
      try {
        const { data } = await transports.discordFetch<any[]>(
          `/channels/${id}/messages?limit=${limit}`,
          { mode: "Bot", token, fetch: fetchDiscord },
        );
        return data;
      } catch (e) {
        throw erreurAdminLab("de lecture", e);
      }
    },
  };
}
