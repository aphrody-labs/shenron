import { inject, injectable } from "tsyringe";
import { NotBot } from "@aphrody/discord-kit";
import { Bot, Discord, Guard, On, type ArgsOf } from "discordx";
import { DatabaseService } from "~/db/index";
import { TrainingService } from "~/services/TrainingService";
import { AdminReportGoalService } from "~/services/AdminReportGoalService";
import { ADMIN_LAB_CHANNEL_ID } from "~/lib/admin-lab";
import { logger } from "~/lib/logger";
import { env, isBotOwner } from "~/lib/env";
import { PermissionFlagsBits, type APIEmbed, type Message } from "discord.js";
import { resolveDiscordAi, APHRODY_DISCORD } from "@aphrody/shenron-config/discord-ai";
import { COLORS, SHENRON_THEME, errorText, shenronEmbed, truncate } from "~/lib/embeds";
import { canonTierColor, embeddingsLabel } from "~/commands/admin/Train";

/** Default and bounds of the `!eval [n]` sample size. */
const EVAL_DEFAULT = 25;
const EVAL_MAX = 500;

/** Sample size of `!eval <arg>`: default when absent or invalid, clamped to `[1, EVAL_MAX]`. */
export function evalSampleSize(arg: string): number {
  const n = Number.parseInt(arg, 10);
  if (!Number.isFinite(n) || n <= 0) return EVAL_DEFAULT;
  return Math.min(n, EVAL_MAX);
}

/** `<title> [| <description>]` of `!goal` / `!report`; `null` without a title. */
export function parseTitleAndDescription(
  arg: string,
): { title: string; description: string } | null {
  const sep = arg.indexOf("|");
  const title = (sep === -1 ? arg : arg.slice(0, sep)).trim();
  const description = sep === -1 ? "" : arg.slice(sep + 1).trim();
  if (!title) return null;
  return { title: truncate(title, 200), description: truncate(description || title, 2000) };
}

/** A lab panel as a plain API embed (the shape `message.reply` sends). */
function panel(opts: Parameters<typeof shenronEmbed>[0]): APIEmbed {
  return shenronEmbed({ header: "LAB IA ADMIN", ...opts }).toJSON();
}

const pct = (value: number | undefined) => `\`${((value ?? 0) * 100).toFixed(1)}%\``;
const online = (status: "online" | "offline") =>
  status === "online" ? "🟢 En ligne" : "🔴 Hors-ligne";

/**
 * AdminLabListener — Écoute et automatisation en temps réel du salon admin (🤖・lab-ia-admin).
 *
 * 1. Archive chaque message échangé dans SQLite (admin_lab_messages).
 * 2. Répond instantanément aux commandes rapides d'administration :
 *    - `!eval` ou `!train` : lance une passe d'évaluation RAG en direct.
 *    - `!status` ou `!statut` : affiche l'état temps réel du RAG, des APIs et des services.
 *    - `!goal <titre> [| <description>]` : fixe un objectif et synchronise var/reports/GOALS.md.
 *    - `!report <titre> [| <description>]` : consigne un signalement et synchronise var/reports/ADMIN-REPORTS.md.
 *    - `!help` : liste les commandes disponibles dans le salon.
 * 3. Répond aux questions de lore/canon adressées à Shenron de façon sobre et sourcée.
 */
@Discord()
@Bot("shenron")
@injectable()
export class AdminLabListener {
  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(TrainingService) private training: TrainingService,
    @inject(AdminReportGoalService) private reportGoal: AdminReportGoalService,
  ) {}

  @On({ event: "messageCreate" })
  @Guard(NotBot)
  async onMessage([message]: ArgsOf<"messageCreate">) {
    const isLabGuild =
      message.guildId === env.GUILD_ID ||
      message.guildId === APHRODY_DISCORD.guildId ||
      env.ADDITIONAL_GUILD_IDS.includes(message.guildId ?? "");
    const isLabChannel =
      Boolean(ADMIN_LAB_CHANNEL_ID) &&
      (message.channelId === ADMIN_LAB_CHANNEL_ID ||
        message.channelId === APHRODY_DISCORD.adminConsoleChannelId ||
        message.channelId === APHRODY_DISCORD.startHereChannelId);

    if (!isLabGuild || !isLabChannel || message.author.bot || message.webhookId) return;
    const authorized =
      isBotOwner(message.author.id) ||
      message.member?.permissions.has(PermissionFlagsBits.Administrator);
    if (!authorized) return;

    // 1. Archivage local immédiat du message
    try {
      this.dbs.sqlite
        .query(
          `INSERT INTO admin_lab_messages (message_id, user_id, user_tag, content, has_attachments, created_at)
					 VALUES (?, ?, ?, ?, ?, ?)
					 ON CONFLICT(message_id) DO UPDATE SET content = excluded.content`,
        )
        .run(
          message.id,
          message.author.id,
          message.author.tag,
          message.content,
          message.attachments.size > 0 ? 1 : 0,
          Date.now(),
        );
    } catch (err) {
      logger.warn({ err }, "[AdminLabListener] Erreur archivage message lab");
    }

    const text = message.content.trim();
    if (!text) return;

    // 2. Commandes rapides avec préfixe '!'
    if (text.startsWith("!")) {
      const [cmd = "", ...restArgs] = text.slice(1).split(/\s+/);
      const handled = await this.runQuickCommand(
        message,
        cmd.toLowerCase(),
        restArgs.join(" ").trim(),
      );
      if (handled) return;
    }

    // The shared chat relay owns general-channel questions, avoiding duplicate replies.
    if (message.channelId === resolveDiscordAi(process.env).generalChannelId) return;

    // 3. Question canonique adressée à Shenron (si mention directe ou mot clé 'shenron')
    const mentionsBot = message.mentions.has(message.client.user?.id ?? "");
    const startsWithShenron = text.toLowerCase().startsWith("shenron");
    if (mentionsBot || startsWithShenron) await this.answerCanon(message, text);
  }

  /** Runs a `!command`; `false` when the command is not a lab command. */
  private async runQuickCommand(message: Message, cmd: string, arg: string): Promise<boolean> {
    // One failing command (network, database) must answer, not become an unhandled rejection.
    const guarded = async (label: string, work: () => Promise<void>) => {
      try {
        await work();
      } catch (err) {
        logger.warn({ err, cmd }, "[AdminLabListener] commande rapide en échec");
        await message
          .reply({ content: `❌ ${label} : ${errorText(err, 1500)}` })
          .catch(() => undefined);
      }
    };

    switch (cmd) {
      case "eval":
      case "train":
        await this.evalCommand(message, evalSampleSize(arg));
        return true;
      case "status":
      case "statut":
        await guarded("État du système indisponible", () => this.statusCommand(message));
        return true;
      case "goal":
        await guarded("Objectif non enregistré", () => this.goalCommand(message, arg));
        return true;
      case "report":
        await guarded("Signalement non enregistré", () => this.reportCommand(message, arg));
        return true;
      case "help":
      case "aide":
        await guarded("Aide indisponible", () => this.helpCommand(message));
        return true;
      default:
        return false;
    }
  }

  private async evalCommand(message: Message, sampleSize: number) {
    const replyMsg = await message
      .reply({ content: `⏳ Exécution du banc d'évaluation RAG (${sampleSize} cas)...` })
      .catch(() => null);
    if (!replyMsg) return;

    try {
      const metrics = await this.training.evaluateRag(sampleSize);
      await replyMsg.edit({
        content: "",
        embeds: [
          panel({
            color: metrics.sidecarActive ? COLORS.success : COLORS.warning,
            title: "🎯 RÉSULTATS ÉVALUATION RAG EN DIRECT",
            description: [
              `Évaluation exécutée sur **${metrics.cases}** requêtes dorées en **${metrics.durationMs}ms**.`,
              "",
              `• **Recall@1 :** ${pct(metrics.recall[1])}`,
              `• **Recall@3 :** ${pct(metrics.recall[3])}`,
              `• **Recall@5 :** ${pct(metrics.recall[5])}`,
              `• **Recall@10 :** ${pct(metrics.recall[10])}`,
              `• **MRR :** ${pct(metrics.mrr)}`,
              `• **nDCG@10 :** ${pct(metrics.ndcg)}`,
              `• **Embeddings :** ${embeddingsLabel(metrics.sidecarActive, process.env.RAG_BACKEND === "aphrody")}`,
              `• **Misses :** \`${metrics.misses.length} cas en échec\``,
            ].join("\n"),
          }),
        ],
      });
    } catch (err) {
      await replyMsg
        .edit({ content: `❌ Erreur lors de l'évaluation : ${errorText(err, 1500)}` })
        .catch(() => undefined);
    }
  }

  private async statusCommand(message: Message) {
    const stats = await this.training.getStats();
    const remoteRag = process.env.RAG_BACKEND === "aphrody";
    await message.reply({
      embeds: [
        panel({
          color: SHENRON_THEME.saiyanBlue,
          title: "📡 ÉTAT DU SYSTÈME SHENRON & LAB IA",
          description: [
            "**Base de Données & Modèle :**",
            `• Chunks RAG : \`${stats.totalChunks.toLocaleString("fr-FR")}\``,
            `• Vecteurs : \`${stats.totalVectors.toLocaleString("fr-FR")}\``,
            `• Cas du banc doré : \`${stats.totalGoldCases}\``,
            `• Retours d'entraînement : \`${stats.totalFeedbacks}\` (${stats.pendingFeedbacks} en attente)`,
            "",
            "**Services & Connectivité :**",
            `• ${remoteRag ? "Embeddings Aphrody" : "Embeddings E5 (aphrody-shenron-embed)"} : ${online(stats.sidecarStatus)}`,
            `• API Site Next.js : ${online(stats.siteApiStatus)}`,
            `• API Bot Shenron : ${online(stats.botApiStatus)}`,
          ].join("\n"),
        }),
      ],
    });
  }

  private async goalCommand(message: Message, arg: string) {
    const parsed = parseTitleAndDescription(arg);
    if (!parsed) {
      await message.reply({
        content:
          "Usage : `!goal <Titre> [| <Description>]`\nExemple : `!goal Optimiser le reranker | Affiner les seuils de similarité pour DB Daima`",
      });
      return;
    }
    const res = await this.reportGoal.createGoal({
      userId: message.author.id,
      userTag: message.author.tag,
      title: parsed.title,
      description: parsed.description,
      priority: "p1",
      targetSession: "next_session",
    });
    await message.reply({
      embeds: [
        panel({
          color: COLORS.success,
          title: `🎯 Objectif #${res.id} enregistré`,
          description: [
            `**Titre :** ${parsed.title}`,
            `**Description :** ${parsed.description}`,
            "",
            "✓ Synchronisé en direct dans `var/reports/GOALS.md`.",
            "✓ Pris en compte pour la prochaine session des agents.",
          ].join("\n"),
        }),
      ],
    });
  }

  private async reportCommand(message: Message, arg: string) {
    const parsed = parseTitleAndDescription(arg);
    if (!parsed) {
      await message.reply({
        content:
          "Usage : `!report <Titre> [| <Description>]`\nExemple : `!report Manque fiche Glorio | Daima épisode 1 n'a pas encore de fiche complète`",
      });
      return;
    }
    const res = await this.reportGoal.createReport({
      userId: message.author.id,
      userTag: message.author.tag,
      category: "wiki",
      title: parsed.title,
      description: parsed.description,
      severity: "minor",
    });
    await message.reply({
      embeds: [
        panel({
          color: COLORS.warning,
          title: `⚠️ Signalement #${res.id} consigné`,
          description: [
            `**Titre :** ${parsed.title}`,
            `**Description :** ${parsed.description}`,
            "",
            "✓ Synchronisé en direct dans `var/reports/ADMIN-REPORTS.md`.",
            "✓ Priorisé pour traitement par l'équipe et les agents.",
          ].join("\n"),
        }),
      ],
    });
  }

  private async helpCommand(message: Message) {
    await message.reply({
      embeds: [
        panel({
          color: COLORS.info,
          title: "🛠️ COMMANDES DU SALON LAB IA ADMIN",
          description: [
            "Ce salon est réservé aux administrateurs pour piloter l'entraînement et la doctrine.",
            "",
            `• \`!eval [nombre]\` : Lance une passe d'évaluation RAG immédiate (${EVAL_DEFAULT} cas par défaut, ${EVAL_MAX} max).`,
            "• `!status` : Diagnostic de santé de tous les services (RAG, sidecar, API site/bot).",
            "• `!goal <titre> [| <desc>]` : Fixe un objectif pour les prochaines sessions d'agents.",
            "• `!report <titre> [| <desc>]` : Signale une erreur ou un manque sur le site/bot.",
            "• `!help` : Affiche ce récapitulatif.",
            "",
            "Vous pouvez également utiliser les commandes slash complètes : `/train`, `/goal`, `/report`.",
          ].join("\n"),
        }),
      ],
    });
  }

  private async answerCanon(message: Message, text: string) {
    const cleanQuery = text
      .replace(/<@!?[0-9]+>/g, "")
      .replace(/^shenron[\s,:]*/i, "")
      .trim();
    if (cleanQuery.length < 3) return;
    try {
      const canonRes = await this.training.inspectCanon(cleanQuery);
      if (!canonRes) return;
      await message.reply({
        embeds: [
          panel({
            header: "CANONICITÉ",
            // The verdict is a sentence: the short tier label fits the title limit.
            color: canonTierColor(canonRes.tier),
            title: `📜 Canonicité : ${canonRes.tierLabel}`,
            description: [
              canonRes.verdict,
              "",
              `• **Niveau :** \`${canonRes.tierLabel}\` (Score: ${canonRes.score}/100)`,
              `• **Nature :** ${canonRes.nature}`,
              canonRes.toriyamaQuote
                ? `• **Akira Toriyama :** *« ${canonRes.toriyamaQuote.text} »* (${canonRes.toriyamaQuote.source})`
                : "",
              `• **Preuves :** ${canonRes.referencesCount} références, ${canonRes.planchesCount} planches manga`,
            ]
              .filter(Boolean)
              .join("\n"),
          }),
        ],
      });
    } catch (err) {
      logger.debug({ err }, "[AdminLabListener] Erreur réponse canonique");
    }
  }
}
