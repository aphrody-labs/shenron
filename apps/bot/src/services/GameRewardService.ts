/**
 * Versement des gains des mini-jeux, avec garde-fous anti-farm :
 *   - plafond de victoires récompensées par joueur sur 24 h glissantes, compté
 *     dans le grand livre `action_logs` (survit aux redémarrages) ;
 *   - plafond par paire de joueurs en duel (anti-collusion, en mémoire).
 * Au-delà, la partie reste jouable mais ne rapporte que de l'XP de participation.
 *
 * XP of the games (`grantGameXp`): a share of the tier span (`lib/game-xp.ts`), credited through
 * `LevelService.addXP` with `source: "game"` and NEVER multiplied (no role, race, night or Zenkai
 * multiplier: the 2026-10-22 inflation came from those), capped at a share of the span over a
 * rolling 24 h counted in the `XP_GAIN` ledger.
 */
import { singleton, inject } from "tsyringe";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { DatabaseService } from "~/db/index";
import { actionLogs } from "~/db/schema";
import { EconomyService } from "~/services/EconomyService";
import { LevelService } from "~/services/LevelService";
import { SettingsService } from "~/services/SettingsService";
import { LogService } from "~/services/LogService";
import { container } from "tsyringe";
import { Client } from "discordx";
import { EmbedBuilder, type GuildMember } from "discord.js";
import { formatZeni } from "@aphrody/shenron-config/zeni";
import { env } from "~/lib/env";
import { logger } from "~/lib/logger";
import { resolveLevelChannel } from "~/lib/announce";
import { levelFromXp } from "~/lib/xp";
import { loadXpGainLimits, singleGainCeiling } from "~/lib/xp-boosts";
import {
  GAME_XP_WINDOW_MS,
  gameXpAward,
  gameXpWithinCap,
  loadGameXpConfig,
  type GameXpConfig,
  type GameXpGrant,
  type GameXpOutcome,
} from "~/lib/game-xp";
import {
  DAY_MS,
  GAME_DAILY_REWARD_CAP_DEFAULT,
  GAME_PAIR_REWARD_CAP_DEFAULT,
  SlidingWindowCounter,
  pairKey,
  rewardBlockReason,
  settleStakes,
  type RewardBlock,
  type StakeSettlement,
} from "~/services/games/anti-farm";

export type { GameXpGrant, GameXpOutcome } from "~/lib/game-xp";

export interface GrantResult {
  paid: number;
  blocked: RewardBlock | null;
  /**
   * XP given with the result: the win when it is paid, mere participation when a cap blocks it
   * (never both). `xp.xp` is 0 when the feature is off or the daily XP cap is reached.
   */
  xp: GameXpGrant;
}

export interface GameXpInput {
  userId: string;
  outcome: GameXpOutcome;
  /** Game name, for the logs. */
  game?: string;
  /** The member, to place the tier roles of a level-up. Resolved from the guild when absent. */
  member?: GuildMember;
  /**
   * Opponent of a duel. A `win` against the same opponent more than `games.pair_reward_cap`
   * times over 24 h only counts as participation (anti-collusion).
   */
  opponentId?: string;
}

const NO_XP: GameXpGrant = { xp: 0, capped: false, levelUp: false, oldLevel: 0, newLevel: 0 };

@singleton()
export class GameRewardService {
  private readonly pairs = new SlidingWindowCounter(DAY_MS);
  /** Versements en cours (entre la lecture du compteur et l'écriture du grand livre). */
  private readonly inflight = new Map<string, number>();
  /** Tail of the XP queue of each member: two results settled together read the cap in turn. */
  private readonly xpQueue = new Map<string, Promise<unknown>>();

  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(SettingsService) private settings: SettingsService,
    @inject(EconomyService) private eco: EconomyService,
    @inject(LevelService) private levels: LevelService,
  ) {}

  async rewardedWinsLastDay(userId: string, now = Date.now()): Promise<number> {
    const rows = await this.dbs.db
      .select({ n: sql<number>`count(*)` })
      .from(actionLogs)
      .where(
        and(
          eq(actionLogs.userId, userId),
          eq(actionLogs.action, "ZENI_GAIN"),
          like(actionLogs.meta, '%"kind":"game"%'),
          gte(actionLogs.createdAt, new Date(now - DAY_MS)),
        ),
      );
    return Number(rows[0]?.n ?? 0);
  }

  /** Game XP received over the last 24 h (the `XP_GAIN` ledger, `source: "game"`). */
  async gameXpLastDay(userId: string, now = Date.now()): Promise<number> {
    const rows = await this.dbs.db
      .select({
        total: sql<number>`coalesce(sum(case when json_valid(${actionLogs.meta}) then json_extract(${actionLogs.meta}, '$.amount') else 0 end), 0)`,
      })
      .from(actionLogs)
      .where(
        and(
          eq(actionLogs.userId, userId),
          eq(actionLogs.action, "XP_GAIN"),
          like(actionLogs.meta, '%"source":"game"%'),
          gte(actionLogs.createdAt, new Date(now - GAME_XP_WINDOW_MS)),
        ),
      );
    return Math.max(0, Number(rows[0]?.total ?? 0));
  }

  /**
   * Journal du salon casino : chaque gain versé ou refusé par un plafond.
   * Best-effort — un salon absent ne bloque jamais un versement.
   */
  private async logGame(input: {
    userId: string;
    game?: string;
    amount: number;
    opponentId?: string;
    result: GrantResult;
  }) {
    try {
      if (!container.isRegistered(Client, true)) return;
      const balance = await this.eco.getBalance(input.userId);
      const embed = new EmbedBuilder()
        .setColor(input.result.blocked ? 0x94a3b8 : 0xf5b52e)
        .setTitle(
          input.result.blocked
            ? `Gain bloqué · ${input.game ?? "mini-jeu"}`
            : `Gain versé · ${input.game ?? "mini-jeu"}`,
        )
        .addFields(
          { name: "Joueur", value: `<@${input.userId}>`, inline: true },
          {
            name: input.result.blocked ? "Gain refusé" : "Gain",
            value: formatZeni(input.result.blocked ? input.amount : input.result.paid),
            inline: true,
          },
          { name: "Solde", value: formatZeni(balance), inline: true },
        )
        .setTimestamp(new Date());
      if (input.result.xp.xp > 0) {
        embed.addFields({ name: "XP", value: `+${input.result.xp.xp}`, inline: true });
      }
      if (input.opponentId)
        embed.addFields({ name: "Adversaire", value: `<@${input.opponentId}>`, inline: true });
      if (input.result.blocked) {
        embed.addFields({
          name: "Plafond",
          value:
            input.result.blocked === "daily-cap"
              ? "Victoires payées sur 24 h atteintes"
              : "Victoires payées contre ce même adversaire atteintes",
        });
      }
      await container.resolve(LogService).send(container.resolve(Client), "games", embed);
    } catch {
      /* pas de client ou de salon casino configuré */
    }
  }

  /**
   * Verse `amount` (gain de base) si aucun plafond n'est atteint, et l'XP du résultat : la
   * victoire si elle est payée, la participation sinon (plafond quotidien ou de paire).
   */
  async grantWin(input: {
    userId: string;
    amount: number;
    opponentId?: string;
    /** Nom du jeu, pour le journal du salon casino. */
    game?: string;
    /** Le membre, pour placer les rôles de palier d'un passage de niveau. */
    member?: GuildMember;
  }): Promise<GrantResult> {
    const zeni = await this.payWin(input);
    const xp = await this.creditGameXp({
      userId: input.userId,
      outcome: zeni.blocked ? "play" : "win",
      game: input.game,
      member: input.member,
    });
    const result: GrantResult = { ...zeni, xp };
    void this.logGame({ ...input, result });
    return result;
  }

  private async payWin(input: {
    userId: string;
    amount: number;
    opponentId?: string;
  }): Promise<{ paid: number; blocked: RewardBlock | null }> {
    const now = Date.now();
    const pending = this.inflight.get(input.userId) ?? 0;
    this.inflight.set(input.userId, pending + 1);
    try {
      const [dailyCap, pairCap, ledgerCount] = await Promise.all([
        this.settings.getInt("games.daily_reward_cap", GAME_DAILY_REWARD_CAP_DEFAULT),
        this.settings.getInt("games.pair_reward_cap", GAME_PAIR_REWARD_CAP_DEFAULT),
        this.rewardedWinsLastDay(input.userId, now),
      ]);
      const key = input.opponentId ? pairKey(input.userId, input.opponentId) : undefined;
      const blocked = rewardBlockReason({
        dailyCount: ledgerCount + pending,
        dailyCap,
        pairCount: key ? this.pairs.count(key, now) : undefined,
        pairCap,
      });
      if (blocked) return { paid: 0, blocked };
      if (key) this.pairs.record(key, now);
      if (input.amount <= 0) return { paid: 0, blocked: null };
      await this.eco.addZeni(input.userId, input.amount, { kind: "game" });
      return { paid: input.amount, blocked: null };
    } finally {
      const left = (this.inflight.get(input.userId) ?? 1) - 1;
      if (left <= 0) this.inflight.delete(input.userId);
      else this.inflight.set(input.userId, left);
    }
  }

  /**
   * Gives the XP of a game result: `win`, `draw`, `podium` (top three of a ranked game) or
   * `play` (participation). Use `grantWin` for a win that also pays zeni: it calls this one.
   *
   * The amount is a share of the tier span (see `lib/game-xp.ts`), credited with
   * `source: "game"` and `propagateFusion: false`, with NO multiplier of any kind. A level-up
   * runs the usual flow (tier roles, tier zeni, the single level announcement). Never throws:
   * a failure is logged and reads as 0 XP, so it cannot lose a payment.
   */
  async grantGameXp(input: GameXpInput): Promise<GameXpGrant> {
    let { outcome } = input;
    if (outcome === "win" && input.opponentId) {
      // Staked duels and the like do not go through `grantWin`: same anti-collusion cap.
      const pairCap = await this.settings.getInt(
        "games.pair_reward_cap",
        GAME_PAIR_REWARD_CAP_DEFAULT,
      );
      const key = pairKey(input.userId, input.opponentId);
      const now = Date.now();
      if (this.pairs.count(key, now) >= Math.max(0, pairCap)) outcome = "play";
      else this.pairs.record(key, now);
    }
    return this.creditGameXp({ ...input, outcome });
  }

  /** Runs `task` after the previous XP task of the same member. */
  private serial<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.xpQueue.get(userId) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.catch(() => undefined);
    this.xpQueue.set(userId, tail);
    // Drop the entry once its tail is the last one, so the map does not grow with members.
    void tail.finally(() => {
      if (this.xpQueue.get(userId) === tail) this.xpQueue.delete(userId);
    });
    return run;
  }

  private async creditGameXp(input: GameXpInput): Promise<GameXpGrant> {
    try {
      const cfg = await loadGameXpConfig(this.settings);
      if (!cfg.enabled) return { ...NO_XP };
      return await this.serial(input.userId, () => this.creditSerial(input, cfg));
    } catch (err) {
      logger.error({ err, userId: input.userId, game: input.game }, "game XP credit failed");
      return { ...NO_XP };
    }
  }

  private async creditSerial(input: GameXpInput, cfg: GameXpConfig): Promise<GameXpGrant> {
    const now = Date.now();
    const row = await this.levels.findUser(input.userId);
    const current = row?.xp ?? 0;
    const level = levelFromXp(current);
    const award = gameXpAward(current, input.outcome, cfg);
    const used = await this.gameXpLastDay(input.userId, now);
    const within = gameXpWithinCap(award, used, current, cfg);
    if (within.xp <= 0) {
      return { xp: 0, capped: within.capped, levelUp: false, oldLevel: level, newLevel: level };
    }
    // A single gain above the anti-cheat ceiling would be clipped and flagged: never ask for it.
    const ceiling = singleGainCeiling(await loadXpGainLimits(this.settings), "game");
    const amount = Math.min(within.xp, ceiling);
    const res = await this.levels.addXP(input.userId, amount, {
      source: "game",
      propagateFusion: false,
    });
    const grant: GameXpGrant = {
      xp: res.granted,
      // A frozen account is not a cap: only the daily cap and the anti-cheat limits are.
      capped: within.capped || (res.blocked !== "frozen" && res.granted < award),
      levelUp: res.levelUp,
      oldLevel: res.oldLevel,
      newLevel: res.newLevel,
    };
    if (res.levelUp) await this.announceLevelUp(input, res);
    return grant;
  }

  /** Tier roles, tier zeni and the single announcement of `LevelService.handleLevelUp`. */
  private async announceLevelUp(
    input: GameXpInput,
    res: { oldLevel: number; newLevel: number; levelZeni: number },
  ): Promise<void> {
    try {
      const client = container.isRegistered(Client, true) ? container.resolve(Client) : null;
      const guild = client?.guilds.cache.get(env.GUILD_ID) ?? client?.guilds.cache.first();
      const member =
        input.member ??
        guild?.members.cache.get(input.userId) ??
        (await guild?.members.fetch(input.userId).catch(() => null)) ??
        null;
      if (!member) {
        logger.warn(
          { userId: input.userId, newLevel: res.newLevel, game: input.game },
          "game level-up without a GuildMember: tier role not placed",
        );
        return;
      }
      const announce = client ? await resolveLevelChannel(client, member.guild) : null;
      await this.levels.handleLevelUp(
        member,
        res.newLevel,
        announce ?? undefined,
        res.oldLevel,
        res.levelZeni,
      );
    } catch (err) {
      logger.error({ err, userId: input.userId, game: input.game }, "game level-up flow failed");
    }
  }

  /**
   * Séquestre la mise des deux joueurs au lancement d'un duel. Si le second
   * débit échoue, le premier est rendu. `false` = duel impossible.
   */
  async escrowStakes(a: string, b: string, stake: number): Promise<boolean> {
    if (stake <= 0) return true;
    if (!(await this.eco.removeZeni(a, stake))) return false;
    if (!(await this.eco.removeZeni(b, stake))) {
      await this.eco.addZeni(a, stake, { kind: "stake" });
      return false;
    }
    return true;
  }

  /** Restitue un pot séquestré (somme nulle, sans multiplicateur ni fusion). */
  async payStakes(
    kind: StakeSettlement,
    winnerId: string,
    loserId: string,
    stake: number,
  ): Promise<void> {
    const split = settleStakes(kind, stake);
    if (split.winner > 0) await this.eco.addZeni(winnerId, split.winner, { kind: "stake" });
    if (split.loser > 0) await this.eco.addZeni(loserId, split.loser, { kind: "stake" });
  }
}
