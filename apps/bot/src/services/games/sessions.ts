/**
 * Lifecycle of the mini-game sessions across restarts.
 *
 * Every game registers its session in the journal while it runs. Orphans —
 * sessions of a process that stopped beating — are recovered here: escrowed
 * stakes go back to both players (`cancel`, zero-sum), and the board left on
 * screen is closed so nobody keeps playing a game that no longer exists.
 */
import { Client } from "discordx";
import { EmbedBuilder } from "discord.js";
import { container, inject, singleton } from "tsyringe";
import { COLORS } from "~/lib/embeds";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { formatZeni } from "@aphrody/shenron-config/zeni";
import { GameRewardService } from "~/services/GameRewardService";
import {
  GameSessionJournal,
  HEARTBEAT_MS,
  journalPathFor,
  type JournalEntry,
} from "./session-journal";

const GAME_TITLES: Record<string, string> = {
  morpion: "Morpion",
  pendu: "Pendu",
  bingo: "Bingo",
};

@singleton()
export class GameSessionsService {
  readonly journal = new GameSessionJournal(journalPathFor(env.DATABASE_PATH));
  private started = false;

  constructor(@inject(GameRewardService) private rewards: GameRewardService) {}

  /** Idempotent: heartbeat, then periodic recovery of orphaned sessions. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.journal.heartbeat();
    const tick = () => {
      this.journal.heartbeat();
      void this.recover();
    };
    setInterval(tick, HEARTBEAT_MS).unref?.();
    // First pass once the Gateway had time to log in (board edits need it).
    setTimeout(() => void this.recover(), 10_000).unref?.();
  }

  open(entry: Omit<JournalEntry, "bootId" | "startedAt">): void {
    this.start();
    this.journal.open(entry);
  }

  board(id: string, channelId: string, messageId: string): void {
    this.journal.update(id, { channelId, messageId });
  }

  close(id: string): void {
    this.journal.close(id);
  }

  /** Refunds and closes the sessions of dead processes. Never throws. */
  async recover(): Promise<number> {
    let orphans: JournalEntry[] = [];
    try {
      orphans = this.journal.takeOrphans();
    } catch (err) {
      logger.warn({ err }, "games: lecture du journal des parties en échec");
      return 0;
    }
    for (const entry of orphans) {
      try {
        const [a, b] = entry.players;
        if (entry.stake > 0 && a && b) {
          await this.rewards.payStakes("cancel", a, b, entry.stake);
        }
        await this.closeBoard(entry);
        logger.info(
          { game: entry.game, id: entry.id, stake: entry.stake },
          "games: partie interrompue par un redémarrage, mises rendues",
        );
      } catch (err) {
        logger.error({ err, entry }, "games: reprise d'une partie interrompue en échec");
      }
    }
    return orphans.length;
  }

  private async closeBoard(entry: JournalEntry): Promise<void> {
    if (!entry.channelId || !entry.messageId) return;
    if (!container.isRegistered(Client)) return;
    const client = container.resolve(Client);
    const channel = await client.channels.fetch(entry.channelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (!message?.editable) return;
    const players = entry.players.map((p) => `<@${p}>`).join(" contre ");
    const embed = new EmbedBuilder()
      .setTitle(`${GAME_TITLES[entry.game] ?? "Mini-jeu"} · Partie interrompue`)
      .setDescription(
        [
          players,
          "",
          "Le bot a redémarré pendant la partie.",
          entry.stake > 0
            ? `Mises rendues : **${formatZeni(entry.stake)}** à chaque joueur.`
            : "Aucun gain ni pénalité.",
        ].join("\n"),
      )
      .setColor(COLORS.muted)
      .setTimestamp(new Date());
    await message.edit({ embeds: [embed], components: [], files: [], attachments: [] });
  }
}

/**
 * Boot hook. discordx instantiates the command classes before the DI engine
 * is wired, so no constructor can start the heartbeat; the bot process starts
 * it here once its Discord client is registered, so orphans of the previous
 * run are refunded even if nobody plays.
 */
setTimeout(() => {
  if (container.isRegistered(Client, true)) container.resolve(GameSessionsService).start();
}, 15_000).unref?.();
