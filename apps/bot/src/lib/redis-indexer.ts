/**
 * redis-indexer.ts — Gestionnaire de l'indexation Redis (salons, utilisateurs, messages).
 *
 * Spawne un Bun Worker en arrière-plan (indexation parallèle, hors event-loop) et lui pousse :
 *   - tous les salons,
 *   - les utilisateurs (déduits des AUTEURS de messages -> aucun intent privilégié GuildMembers requis ;
 *     en bonus, la liste des membres si l'intent est disponible),
 *   - un backfill PROFOND des messages (pagination, pas seulement les 50 derniers) + le temps réel.
 *
 * Cf. piège CLAUDE.md : sans l'intent MessageContent, `content` est vide pour les messages qui ne
 * mentionnent pas le bot — mais l'indexation des métadonnées (auteur, salon, date) reste valable.
 */
import { Client, ChannelType } from "discord.js";
import { injectable, singleton } from "tsyringe";
import { startBundledWorker } from "~/lib/bundled-worker";

export interface IndexedAuthor {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
}

@singleton()
@injectable()
export class RedisIndexerService {
  private worker: Worker | null = null;
  /** True once the worker posted its handshake; a startup error before that is fatal. */
  private workerReady = false;
  /** Why the worker is unusable, for the error raised by every indexation attempt. */
  private workerFailure: string | null = null;
  private isIndexationActive = false;
  /** Backfill max de messages par salon (pagination). Le temps réel couvre tout le nouveau flux ;
   *  ce backfill profond (8x l'ancien cap de 50) tourne au boot + cron sans marteler l'API Discord.
   *  0 = illimité (déconseillé sur gros serveurs). Surcharge via REDIS_INDEX_MAX_MESSAGES. */
  private readonly maxBackfill = Number(process.env.REDIS_INDEX_MAX_MESSAGES ?? 400);
  /** Dernier passage de journalisation d'échec, et échecs tus depuis. */
  private dernierEchec = 0;
  private echecsTus = 0;

  /**
   * Journalise un échec d'indexation au plus une fois par minute.
   *
   * Quand Redis est injoignable, chaque lot échoue : le 2026-08-21, la même
   * ligne est sortie ~8 500 fois en douze heures, noyant tout le reste du
   * journal du bot. Le regroupement conserve l'information (et le compte des
   * occurrences tues) sans rendre `journalctl -u shenron` inutilisable.
   */
  private logEchec(type: string, error?: unknown) {
    this.echecsTus += 1;
    const maintenant = Date.now();
    if (maintenant - this.dernierEchec < 60_000) return;
    const repetitions =
      this.echecsTus > 1 ? ` (${this.echecsTus} échec(s) depuis le dernier message)` : "";
    console.error(
      `[REDIS INDEXER] Erreur type ${type}${repetitions} :`,
      error || "Échec d'insertion",
    );
    this.dernierEchec = maintenant;
    this.echecsTus = 0;
  }

  constructor() {
    this.initWorker();
  }

  /** Overridable: tests inject a fake worker. See `lib/bundled-worker.ts` for the binary layout. */
  protected createWorker(): Worker {
    return startBundledWorker("indexer.ts");
  }

  /** The worker cannot index: remember why, so every attempt fails loudly instead of "succeeding". */
  private failWorker(cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    this.workerFailure = reason;
    this.worker?.terminate();
    this.worker = null;
    console.error(`[REDIS INDEXER] Worker indisponible, aucune indexation possible : ${reason}`);
  }

  private initWorker() {
    try {
      const worker = this.createWorker();
      this.worker = worker;
      worker.addEventListener("message", (event) => {
        const { status, type, count, error } = event.data;
        if (status === "ready") {
          this.workerReady = true;
        } else if (status === "success") {
          console.log(`[REDIS INDEXER] ${type} : ${count} items indexés.`);
        } else {
          this.logEchec(type, error);
        }
      });
      worker.addEventListener("error", (event) => {
        if (this.workerReady) {
          console.error(`[REDIS INDEXER] Erreur globale du Worker :`, event.message);
        } else {
          this.failWorker(event.message || "le module du worker ne se charge pas");
        }
      });
    } catch (e) {
      this.failWorker(e);
    }
  }

  /** Indexation complète de tous les serveurs connectés. */
  async indexAll(client: Client) {
    if (this.isIndexationActive) {
      console.warn("[REDIS INDEXER] Une indexation est déjà en cours.");
      return;
    }
    if (!this.worker) {
      // Not a quiet return: a caller that logs success without a consumer hides the outage.
      throw new Error(`[REDIS INDEXER] worker unavailable: ${this.workerFailure ?? "not started"}`);
    }
    const worker = this.worker;
    this.isIndexationActive = true;
    let completed = false;
    console.log("[REDIS INDEXER] Démarrage de l'indexation complète...");

    try {
      for (const guild of client.guilds.cache.values()) {
        // 1. Salons
        const channels = Array.from(guild.channels.cache.values()).map((ch) => ({
          id: ch.id,
          name: ch.name || "",
          type: String(ch.type),
          parentId: ch.parentId,
        }));
        if (channels.length > 0) {
          worker.postMessage({ type: "INDEX_CHANNELS", data: channels }, []);
        }

        // 2. Membres (bonus, seulement si l'intent GuildMembers est dispo — sinon ignoré sans erreur).
        try {
          const membersList = await guild.members.fetch();
          const users = Array.from(membersList.values()).map((m) => ({
            id: m.user.id,
            username: m.user.username,
            displayName: m.displayName,
            bot: m.user.bot,
            joinedAt: m.joinedAt?.toISOString() || null,
          }));
          for (let i = 0; i < users.length; i += 100) {
            worker.postMessage({ type: "INDEX_USERS", data: users.slice(i, i + 100) }, []);
          }
        } catch {
          // Pas d'intent GuildMembers -> on s'appuiera sur les auteurs de messages (ci-dessous).
        }

        // 3. Messages : backfill PROFOND par pagination (et non plus 50 max) sur les salons textuels.
        const textChannels = guild.channels.cache.filter(
          (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement,
        );
        for (const [, ch] of textChannels) {
          if (!ch.isTextBased()) continue;
          let before: string | undefined;
          let fetched = 0;
          try {
            while (this.maxBackfill === 0 || fetched < this.maxBackfill) {
              const batch = await ch.messages.fetch({ limit: 100, before });
              if (batch.size === 0) break;
              const messages = Array.from(batch.values()).map((m) => ({
                id: m.id,
                content: m.content || "",
                authorId: m.author.id,
                channelId: m.channelId,
                createdAt: m.createdAt.toISOString(),
                authorName: m.author.username,
                authorDisplay: m.member?.displayName ?? m.author.globalName ?? m.author.username,
                authorBot: m.author.bot,
              }));
              worker.postMessage({ type: "INDEX_MESSAGES", data: messages }, []);
              fetched += batch.size;
              before = batch.last()?.id; // le plus ancien du lot -> page vers le passé
              if (batch.size < 100) break;
            }
          } catch {
            // permissions de lecture manquantes sur ce salon -> on ignore
          }
        }
      }
      // The worker may have died while batches were being posted: nobody consumed them.
      if (!this.worker) {
        throw new Error(
          `[REDIS INDEXER] worker lost during indexation: ${this.workerFailure ?? "unknown"}`,
        );
      }
      completed = true;
    } catch (err) {
      console.error("[REDIS INDEXER] Erreur fatale durant l'indexation :", err);
      throw err;
    } finally {
      this.isIndexationActive = false;
      if (completed) console.log("[REDIS INDEXER] Indexation complète achevée.");
    }
  }

  /** Indexation temps-réel d'un message unique (+ son auteur). */
  indexSingleMessage(
    msgId: string,
    content: string,
    authorId: string,
    channelId: string,
    createdAt: Date,
    author?: IndexedAuthor,
  ) {
    if (!this.worker) return;
    this.worker.postMessage(
      {
        type: "INDEX_MESSAGES",
        data: [
          {
            id: msgId,
            content,
            authorId,
            channelId,
            createdAt: createdAt.toISOString(),
            authorName: author?.username,
            authorDisplay: author?.displayName,
            authorBot: author?.bot,
          },
        ],
      },
      [],
    );
  }
}
