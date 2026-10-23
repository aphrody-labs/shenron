import { injectable, inject } from "tsyringe";
import { Bot, ButtonComponent, Discord, Guard, Slash, SlashChoice, SlashOption } from "discordx";
import { userTransformer } from "~/lib/slash-user";
import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type CommandInteraction,
  type Message,
  type User,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { EconomyService } from "~/services/EconomyService";
import { ZENI_GAME_WIN, ZENI_GAME_LOSS_PENALTY } from "~/lib/constants";
import { formatZeni, formatZeniDelta } from "~/lib/zeni";
import { SettingsService } from "~/services/SettingsService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { GameRewardService } from "~/services/GameRewardService";
import { buildChallengeMessage, challengeIdPattern, parseChallengeId } from "~/lib/challenge";
import { DBZ_COLORS } from "~/lib/embeds";
import { logger } from "~/lib/logger";
import { renderBingoCard } from "~/lib/game-cards";
import { REWARD_BLOCK_LABELS } from "~/services/games/anti-farm";
import {
  ActivePlayers,
  ChallengeBoard,
  DUEL_MAX_STAKE_DEFAULT,
  closedChallenge,
  duelStakeError,
  opponentError,
  playerRewardLine,
  resolveChallengeClick,
  rewardText,
  runMessageGame,
  statusColor,
  type EndReason,
  type MoveOutcome,
} from "~/services/games/duel";
import { GameSessionsService } from "~/services/games/sessions";
import {
  DIFFICULTY_LABELS,
  parseGameDifficulty,
  type GameDifficulty,
} from "~/services/games/difficulty";
import {
  BINGO_DEFAULT_TIMEOUT_MS,
  BINGO_LEVELS,
  bingoLossPenalty,
  bingoReward,
  bingoTimeLimitMs,
  compareBingoGuess,
  narrowBingoRange,
  randomBingoTarget,
  type BingoRange,
} from "~/services/games/bingo";

interface PendingChallenge {
  level: GameDifficulty;
  challengerId: string;
  opponentId: string;
  stake: number;
}

interface BingoSession {
  id: string;
  level: GameDifficulty;
  min: number;
  max: number;
  target: number;
  range: BingoRange;
  guesses: Array<{ value: number; hint: "higher" | "lower" | "match" }>;
  attempts: Map<string, number>;
  maxAttempts: number;
  players: string[];
  endsAt: number;
  stake: number;
  winReward: number;
  lossPenalty: number;
  lastMove: string | null;
}

const challenges = new ChallengeBoard<PendingChallenge>();
/** Une seule partie de bingo à la fois par joueur. */
const activePlayers = new ActivePlayers();
const GUESS_RE = /^\d{1,7}$/;

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@injectable()
export class BingoCommand {
  constructor(
    @inject(EconomyService) private eco: EconomyService,
    @inject(SettingsService) private settings: SettingsService,
    @inject(MessageTemplateService) private msg: MessageTemplateService,
    @inject(GameRewardService) private rewards: GameRewardService,
    @inject(GameSessionsService) private journal: GameSessionsService,
  ) {}

  @Slash({ name: "bingo", description: "Devine le nombre mystère en un nombre d'essais limité" })
  async bingo(
    @SlashChoice({ name: "bot", value: "bot" })
    @SlashChoice({ name: "joueur", value: "joueur" })
    @SlashOption({
      name: "mode",
      description: "bot/joueur",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    mode: "bot" | "joueur",
    @SlashOption(
      {
        name: "adversaire",
        description: "Adversaire (mode joueur)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      userTransformer,
    )
    opponent: User | undefined,
    @SlashChoice({ name: "facile", value: "facile" })
    @SlashChoice({ name: "normal", value: "normal" })
    @SlashChoice({ name: "difficile", value: "difficile" })
    @SlashOption({
      name: "difficulte",
      description:
        "Facile, normal (défaut) ou difficile : plage plus large, moins d'essais, plus de zénis",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    difficulte: string | undefined,
    @SlashOption({
      name: "mise",
      description: "Mise en zénis du duel (séquestrée, le gagnant remporte le pot et le bonus)",
      type: ApplicationCommandOptionType.Integer,
      required: false,
      minValue: 1,
      maxValue: 1_000_000,
    })
    mise: number | undefined,
    interaction: CommandInteraction,
  ) {
    const channel = interaction.channel;
    if (!channel?.isSendable()) {
      await interaction.reply({ content: "Non supporté ici.", flags: MessageFlags.Ephemeral });
      return;
    }
    const userId = interaction.user.id;
    if (activePlayers.has(userId)) {
      await interaction.reply({
        content: "Tu as déjà une partie de bingo en cours.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const level = parseGameDifficulty(difficulte);
    const cfg = BINGO_LEVELS[level];
    const [baseWin, baseLoss, baseMs] = await Promise.all([
      this.settings.getInt("zeni.game.win", ZENI_GAME_WIN),
      this.settings.getInt("zeni.game.loss_penalty", ZENI_GAME_LOSS_PENALTY),
      this.settings.getInt("game.bingo.limit_ms", BINGO_DEFAULT_TIMEOUT_MS),
    ]);

    if (mode === "bot") {
      if (mise !== undefined) {
        await interaction.reply({
          content: "Les mises sont réservées aux duels. En solo, le gain dépend de la difficulté.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!activePlayers.reserve([userId])) return;
      const session = this.createSession(interaction.id, level, [userId], {
        stake: 0,
        winReward: bingoReward(baseWin, level),
        lossPenalty: bingoLossPenalty(baseLoss, level),
        durationMs: bingoTimeLimitMs(level, baseMs),
      });
      this.journal.open({ id: session.id, game: "bingo", players: [userId], stake: 0 });
      try {
        const response = await interaction.reply({
          ...(await this.boardPayload(session, "playing")),
          withResponse: true,
        });
        this.start(channel, session, response.resource?.message ?? null, interaction.client);
      } catch (err) {
        activePlayers.release([userId]);
        this.journal.close(session.id);
        throw err;
      }
      return;
    }

    // ── Duel ───────────────────────────────────────────────────────
    const invalid = opponentError(userId, opponent);
    if (invalid || !opponent) {
      await interaction.reply({
        content: invalid ?? "Adversaire invalide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (activePlayers.has(opponent.id)) {
      await interaction.reply({
        content: `${opponent} a déjà une partie de bingo en cours.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const stake = mise ?? Math.max(0, baseLoss);
    const stakeError = await duelStakeError(
      {
        getBalance: (id) => this.eco.getBalance(id),
        maxStake: () => this.settings.getInt("game.max_stake", DUEL_MAX_STAKE_DEFAULT),
      },
      userId,
      opponent,
      stake,
    );
    if (stakeError) {
      await interaction.reply({ content: stakeError, flags: MessageFlags.Ephemeral });
      return;
    }
    challenges.open(interaction.id, {
      level,
      challengerId: userId,
      opponentId: opponent.id,
      stake,
    });
    const bonus = bingoReward(baseWin, level);
    await interaction.reply(
      buildChallengeMessage({
        scope: "bingo",
        key: interaction.id,
        challenger: interaction.user,
        opponent,
        gameTitle: `Bingo · Duel ${DIFFICULTY_LABELS[level].toLowerCase()}`,
        color: DBZ_COLORS.goku,
        stake:
          stake > 0
            ? `Mise **${formatZeni(stake)}** par joueur, séquestrée · le gagnant remporte **${formatZeni(stake * 2)}** + bonus **${formatZeni(bonus)}**`
            : `Gagnant **${formatZeniDelta(bonus)}**`,
        extraFields: [
          { name: "Plage", value: `${cfg.min} → ${cfg.max}`, inline: true },
          { name: "Essais", value: `${cfg.maxAttempts} par joueur`, inline: true },
        ],
      }),
    );
  }

  @ButtonComponent({ id: challengeIdPattern("bingo") })
  async onChallengeButton(interaction: ButtonInteraction) {
    const parsed = parseChallengeId(interaction.customId);
    if (!parsed) return;
    const challenge = await resolveChallengeClick(
      interaction,
      challenges,
      parsed.key,
      parsed.action,
      "Bingo",
    );
    if (!challenge) return;

    const channel = interaction.channel;
    const players = [challenge.challengerId, challenge.opponentId];
    if (!channel?.isSendable() || !activePlayers.reserve(players)) {
      await interaction.update(
        closedChallenge(
          "Bingo",
          "cancelled",
          "Un des joueurs a déjà une partie de bingo en cours.",
        ),
      );
      return;
    }
    await interaction.update({
      content: "",
      embeds: [
        new EmbedBuilder()
          .setTitle("Bingo · Duel accepté")
          .setDescription(
            `<@${challenge.opponentId}> relève le défi. Le premier qui trouve le nombre gagne.`,
          )
          .setColor(DBZ_COLORS.goku),
      ],
      components: [],
    });
    const escrowed = await this.rewards.escrowStakes(
      challenge.challengerId,
      challenge.opponentId,
      challenge.stake,
    );
    if (!escrowed) {
      activePlayers.release(players);
      await interaction.editReply(
        closedChallenge(
          "Bingo",
          "cancelled",
          "Un des joueurs n'a plus assez de zénis pour couvrir la mise.",
        ),
      );
      return;
    }
    const [baseWin, timeoutMs] = await Promise.all([
      this.settings.getInt("zeni.game.win", ZENI_GAME_WIN),
      this.settings.getInt("game.challenge_timeout_ms", 5 * 60_000),
    ]);
    const session = this.createSession(parsed.key, challenge.level, players, {
      stake: challenge.stake,
      winReward: bingoReward(baseWin, challenge.level),
      lossPenalty: 0,
      durationMs: timeoutMs,
    });
    this.journal.open({ id: session.id, game: "bingo", players, stake: challenge.stake });
    try {
      const board = await channel.send(await this.boardPayload(session, "playing"));
      this.start(channel, session, board, interaction.client);
    } catch (err) {
      activePlayers.release(players);
      this.journal.close(session.id);
      await this.rewards.payStakes("cancel", players[0]!, players[1]!, challenge.stake);
      throw err;
    }
  }

  private createSession(
    id: string,
    level: GameDifficulty,
    players: string[],
    opts: { stake: number; winReward: number; lossPenalty: number; durationMs: number },
  ): BingoSession {
    const cfg = BINGO_LEVELS[level];
    return {
      id,
      level,
      min: cfg.min,
      max: cfg.max,
      target: randomBingoTarget(cfg.min, cfg.max),
      range: { lo: cfg.min, hi: cfg.max },
      guesses: [],
      attempts: new Map(),
      maxAttempts: cfg.maxAttempts,
      players,
      endsAt: Date.now() + opts.durationMs,
      stake: opts.stake,
      winReward: opts.winReward,
      lossPenalty: opts.lossPenalty,
      lastMove: null,
    };
  }

  /** Boucle commune solo/duel (`runMessageGame`). */
  private start(
    channel: Parameters<typeof runMessageGame>[0]["channel"],
    session: BingoSession,
    firstBoard: Message | null,
    client: Message["client"],
  ): void {
    if (firstBoard) this.journal.board(session.id, firstBoard.channelId, firstBoard.id);
    runMessageGame({
      scope: "bingo",
      channel,
      players: session.players,
      endsAt: session.endsAt,
      firstBoard,
      accepts: (content) => GUESS_RE.test(content),
      play: (m) => this.play(session, m),
      render: (status, result) => this.boardPayload(session, status, result),
      settle: (reason, winnerId) => {
        // Journal fermé avant le versement : jamais de remboursement en double.
        this.journal.close(session.id);
        return this.settle(session, reason, winnerId, client);
      },
      onFinished: () => activePlayers.release(session.players),
      onBoard: (board) => this.journal.board(session.id, board.channelId, board.id),
    });
  }

  private play(session: BingoSession, m: Message): MoveOutcome {
    const uid = m.author.id;
    const used = session.attempts.get(uid) ?? 0;
    if (used >= session.maxAttempts) return { kind: "ignored" };
    const guess = Number.parseInt(m.content.trim(), 10);
    const who = `<@${uid}>`;
    const hint = compareBingoGuess(guess, session.target, session.min, session.max);
    if (hint === "out-of-range") {
      session.lastMove = `${who} : **${guess}** est hors plage, essai non compté.`;
      return { kind: "playing" };
    }
    session.attempts.set(uid, used + 1);
    session.guesses.push({ value: guess, hint });
    session.range = narrowBingoRange(session.range, guess, hint);
    if (hint === "match") return { kind: "won", winnerId: uid };
    session.lastMove = `${who} : **${guess}**, c'est plus ${hint === "higher" ? "haut" : "bas"}.`;
    if (session.players.every((p) => (session.attempts.get(p) ?? 0) >= session.maxAttempts)) {
      return { kind: "lost" };
    }
    return { kind: "playing" };
  }

  private async settle(
    session: BingoSession,
    reason: EndReason,
    winnerId: string | undefined,
    client: Message["client"],
  ): Promise<string[]> {
    const duel = session.players.length === 2;
    const [a, b] = session.players as [string, string?];
    const lang = await this.settings.getLanguage();
    const label = duel ? "bingo (duel)" : "bingo";
    // Participation counts only after a real guess: opening a game and walking away earns nothing.
    const played = (userId: string) => (session.attempts.get(userId) ?? 0) > 0;
    if (reason !== "won" || !winnerId) {
      const head = reason === "timeout" ? "Temps écoulé." : "Plus aucun essai.";
      if (duel) {
        if (session.stake > 0) await this.rewards.payStakes("draw", a, b!, session.stake);
        const xpLines: string[] = [];
        for (const userId of session.players) {
          if (!played(userId)) continue;
          const xp = await this.rewards.grantGameXp({ userId, outcome: "draw", game: label });
          const line = playerRewardLine(lang, userId, xp);
          if (line) xpLines.push(line);
        }
        const stakeLine =
          session.stake > 0 ? ["Mises rendues."] : xpLines.length === 0 ? ["Aucun gain."] : [];
        return [head, ...stakeLine, ...xpLines];
      }
      const charged =
        session.lossPenalty > 0 && (await this.eco.removeZeni(a, session.lossPenalty));
      const xp = played(a)
        ? await this.rewards.grantGameXp({ userId: a, outcome: "play", game: label })
        : undefined;
      const line = playerRewardLine(lang, a, xp, charged ? -session.lossPenalty : 0);
      return line ? [head, line] : [head];
    }

    const lines: string[] = [];
    const loserId = duel ? (winnerId === a ? b! : a) : undefined;
    if (duel && session.stake > 0) {
      await this.rewards.payStakes("win", winnerId, loserId!, session.stake);
      lines.push(`<@${winnerId}> remporte le pot : **${formatZeniDelta(session.stake * 2)}**`);
    }
    const grant = await this.rewards.grantWin({
      userId: winnerId,
      amount: session.winReward,
      opponentId: loserId,
      game: label,
    });
    if (grant.paid > 0) {
      // Solo: one line with the XP and the zeni. Duel: the zeni are a bonus on top of the pot.
      lines.push(
        duel
          ? `Bonus **${formatZeniDelta(grant.paid)}**`
          : `<@${winnerId}> ${rewardText(lang, { xp: grant.xp, zeni: grant.paid })}`,
      );
      await this.msg.publish(
        "zeni_game_win",
        { user: `<@${winnerId}>`, zeni: grant.paid, game: label },
        client,
      );
    } else if (grant.blocked) {
      lines.push(`Bonus non versé : ${REWARD_BLOCK_LABELS[grant.blocked]}.`);
    }
    if (duel || grant.paid === 0) {
      const winnerLine = playerRewardLine(lang, winnerId, grant.xp);
      if (winnerLine) lines.push(winnerLine);
    }
    if (loserId && played(loserId)) {
      const xp = await this.rewards.grantGameXp({ userId: loserId, outcome: "play", game: label });
      const loserLine = playerRewardLine(lang, loserId, xp);
      if (loserLine) lines.push(loserLine);
    }
    return lines;
  }

  private async boardPayload(
    session: BingoSession,
    status: "playing" | "won" | "lost",
    result?: string[],
  ): Promise<{ embeds: EmbedBuilder[]; files: AttachmentBuilder[] }> {
    const solo = session.players.length === 1;
    const { level } = session;
    const players = solo
      ? `Joueur : <@${session.players[0]}>`
      : `<@${session.players[0]}> contre <@${session.players[1]}>`;
    const description = [players, ""];
    if (status === "playing") {
      description.push(`**Intervalle possible :** ${session.range.lo} → ${session.range.hi}`);
    } else {
      description.push(`**Nombre mystère :** ${session.target}`);
    }
    if (session.lastMove) description.push(session.lastMove);

    const attemptsValue = session.players
      .map(
        (p) =>
          `${solo ? "" : `<@${p}> : `}${session.attempts.get(p) ?? 0} / ${session.maxAttempts}`,
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle(
        status === "won"
          ? "Bingo · Victoire"
          : status === "lost"
            ? "Bingo · Défaite"
            : `Bingo · ${DIFFICULTY_LABELS[level]}`,
      )
      .setDescription(description.join("\n"))
      .setColor(statusColor(status))
      .addFields(
        { name: "Difficulté", value: DIFFICULTY_LABELS[level], inline: true },
        { name: "Plage", value: `${session.min} → ${session.max}`, inline: true },
        { name: "Essais", value: attemptsValue, inline: true },
      );
    if (status === "playing") {
      const gain = solo
        ? `**${formatZeniDelta(session.winReward)}**${session.lossPenalty > 0 ? ` · défaite **${formatZeniDelta(-session.lossPenalty)}**` : ""}`
        : `Pot **${formatZeni(session.stake * 2)}** + bonus **${formatZeni(session.winReward)}**`;
      embed.addFields(
        {
          name: "Fin de partie",
          value: `<t:${Math.floor(session.endsAt / 1000)}:R>`,
          inline: true,
        },
        { name: "Gain", value: gain, inline: true },
      );
      embed.setFooter({ text: "Envoie un nombre dans ce salon." });
    } else if (result?.length) {
      embed.addFields({ name: "Résultat", value: result.join("\n") });
    }

    const files: AttachmentBuilder[] = [];
    try {
      const soloUsed = solo ? (session.attempts.get(session.players[0]!) ?? 0) : null;
      const png = await renderBingoCard({
        min: session.min,
        max: session.max,
        range: session.range,
        guesses: session.guesses,
        attemptsUsed: soloUsed,
        maxAttempts: solo ? session.maxAttempts : null,
        status,
        level,
        target: status === "playing" ? undefined : session.target,
        lastHint: session.guesses.at(-1)?.hint ?? null,
      });
      if (png.length > 0) {
        files.push(new AttachmentBuilder(png, { name: "bingo.png" }));
        embed.setImage("attachment://bingo.png");
      }
    } catch (err) {
      logger.debug({ err }, "bingo: rendu de la carte indisponible");
    }
    return { embeds: [embed], files };
  }
}
