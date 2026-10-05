/**
 * discord-rest.ts — Le minimum vital pour parler à l'API Discord depuis un script.
 *
 * Pas de gateway, pas de discord.js : un script d'ops n'a pas à ouvrir une
 * seconde connexion temps réel à côté du bot en production. Le transport est
 * celui d'Aphrody (`discordFetch` de `@aphrody/discord-kit/rest` : jeton,
 * délai, erreurs typées `DiscordRESTError`) ; ce module n'ajoute que ce qu'un
 * script long exige en plus — attendre sur chaque 429 la durée annoncée par
 * Discord (le kit ne rejoue qu'une fois), rejouer les 5xx, et un parallélisme
 * borné qui préserve l'ordre des résultats.
 */
import { discordFetch, DiscordRESTError } from "@aphrody/discord-kit/rest";

export { DiscordRESTError };

/** Le jeton vient du `.env` du bot, jamais d'un argument (historique du shell). */
export async function jetonDiscord(persona = "GRAND_PRETRE"): Promise<string> {
  const cle = `DISCORD_TOKEN_${persona}`;
  const direct = process.env[cle]?.trim();
  if (direct) return direct;
  const chemin = new URL("../../.env", import.meta.url).pathname;
  const texte = await Bun.file(chemin)
    .text()
    .catch(() => "");
  const ligne = texte.split("\n").find((l) => l.trim().startsWith(`${cle}=`));
  const valeur = ligne
    ?.split("=")
    .slice(1)
    .join("=")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!valeur) throw new Error(`${cle} introuvable (env ou apps/bot/.env)`);
  return valeur;
}

export interface OptionsAppel {
  readonly methode?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  readonly corps?: unknown;
  readonly essais?: number;
}

export type ClientDiscord = <T>(chemin: string, options?: OptionsAppel) => Promise<T>;

/**
 * Construit un client lié à un jeton, qui respecte `retry_after` plutôt que de le subir.
 * Une erreur HTTP sort en `DiscordRESTError` (statut, code Discord) ; `transport`
 * remplace `fetch` (tests).
 */
export function clientDiscord(token: string, transport?: typeof fetch): ClientDiscord {
  return async function appel<T>(chemin: string, options: OptionsAppel = {}): Promise<T> {
    const { methode = "GET", corps, essais = 5 } = options;
    for (let essai = 1; ; essai++) {
      try {
        const { data } = await discordFetch<T>(chemin, {
          mode: "Bot",
          token,
          method: methode,
          body: corps,
          fetch: transport,
        });
        return data;
      } catch (err) {
        if (!(err instanceof DiscordRESTError)) throw err;
        if (err.status === 429) {
          await Bun.sleep(Math.ceil((err.retryAfter ?? 1) * 1000) + 250);
          continue;
        }
        // 4xx hors 429 : la requête est fautive, la rejouer ne la corrigera pas.
        if (err.status < 500 || essai >= essais) {
          err.message = `${methode} ${chemin} → HTTP ${err.status} ${err.message}`;
          throw err;
        }
        await Bun.sleep(500 * essai);
      }
    }
  };
}

/** Parallélisme borné, en préservant l'ordre des résultats. */
export async function enParallele<E, S>(
  elements: readonly E[],
  concurrence: number,
  travail: (element: E, index: number) => Promise<S>,
): Promise<S[]> {
  const resultats: S[] = Array.from({ length: elements.length }) as S[];
  let curseur = 0;
  const ouvriers = Array.from(
    { length: Math.max(1, Math.min(concurrence, elements.length || 1)) },
    async () => {
      for (;;) {
        const i = curseur++;
        if (i >= elements.length) return;
        resultats[i] = await travail(elements[i] as E, i);
      }
    },
  );
  await Promise.all(ouvriers);
  return resultats;
}
