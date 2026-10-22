import { inject, injectable } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlagsBits,
  type CommandInteraction,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { isBotOwner } from "~/lib/env";
import {
  AdminReportGoalService,
  REPORT_SEVERITY_COLORS,
  type ReportSeverity,
} from "~/services/AdminReportGoalService";
import {
  COLORS,
  SHENRON_SEPARATORS,
  SHENRON_THEME,
  errorEmbed,
  errorText,
  shenronEmbed,
  successEmbed,
  truncate,
} from "~/lib/embeds";

/** Number of entries shown by `/report liste` and `/goal liste`. */
const LIST_LIMIT = 8;

/** `text` clipped to `max` characters, with an ellipsis only when something was cut. */
const excerpt = (text: string, max: number) => truncate(text.replace(/\s+/g, " ").trim(), max);

const frDate = (ms: number) => new Date(ms).toLocaleDateString("fr-FR");

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@SlashGroup({
  name: "report",
  description: "Signalement d'erreurs, bugs ou manques sur le site, le bot ou le canon",
})
@SlashGroup("report")
@injectable()
export class ReportCommands {
  constructor(@inject(AdminReportGoalService) private service: AdminReportGoalService) {}

  @Slash({
    name: "creer",
    description:
      "Signaler une erreur, un bug ou un manque (synchronisé en temps réel en Markdown et DB)",
  })
  async create(
    @SlashChoice({ name: "Site web (Next.js)", value: "site" })
    @SlashChoice({ name: "Bot Discord", value: "bot" })
    @SlashChoice({ name: "Wiki / Données", value: "wiki" })
    @SlashChoice({ name: "Doctrine Canon", value: "canon" })
    @SlashChoice({ name: "Databooks / OCR", value: "databook" })
    @SlashChoice({ name: "Autre", value: "other" })
    @SlashOption({
      name: "categorie",
      description: "Domaine du signalement",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    category: "site" | "bot" | "wiki" | "canon" | "databook" | "other",
    @SlashOption({
      name: "titre",
      description: "Titre clair et concis du problème",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 200,
    })
    title: string,
    @SlashOption({
      name: "description",
      description: "Détails de l'erreur ou du manque",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 2000,
    })
    description: string,
    @SlashChoice({ name: "Critique (P0 - Bloquant)", value: "critical" })
    @SlashChoice({ name: "Majeur (P1 - Important)", value: "major" })
    @SlashChoice({ name: "Mineur (P2 - Défaut normal)", value: "minor" })
    @SlashChoice({ name: "Suggestion (P3 - Amélioration)", value: "suggestion" })
    @SlashOption({
      name: "severite",
      description: "Niveau d'impact",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    severity: ReportSeverity | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();
    const level = severity ?? "minor";

    try {
      const rep = await this.service.createReport({
        userId: interaction.user.id,
        userTag: interaction.user.username,
        category,
        title,
        description,
        severity: level,
      });

      await interaction.editReply({
        embeds: [
          shenronEmbed({
            header: "SIGNALEMENTS",
            title: `🚨 Signalement #${rep.id} enregistré !`,
            color: REPORT_SEVERITY_COLORS[level],
            description: [
              `**Catégorie :** \`${category.toUpperCase()}\``,
              `**Titre :** ${title}`,
              `**Description :** ${description}`,
              `**Sévérité :** \`${level.toUpperCase()}\``,
              "",
              SHENRON_SEPARATORS.solid,
              `• Synchronisé en DB (\`admin_reports\`)`,
              `• Inscrit dans \`var/reports/ADMIN-REPORTS.md\``,
              `• Transmis aux agents dans le salon admin.`,
            ].join("\n"),
          }),
        ],
      });
    } catch (e) {
      await interaction.editReply({ embeds: [errorEmbed("Signalement refusé", errorText(e))] });
    }
  }

  @Slash({
    name: "liste",
    description: "Afficher les signalements en cours ou l'historique complet",
  })
  async list(
    @SlashChoice({ name: "Ouverts / En attente", value: "open" })
    @SlashChoice({ name: "Tous les signalements", value: "all" })
    @SlashChoice({ name: "Résolus uniquement", value: "resolved" })
    @SlashOption({
      name: "statut",
      description: "Filtrer par statut",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    status: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();

    const filter = status ?? "open";
    const reports = this.service.listReports(filter);
    if (reports.length === 0) {
      await interaction.editReply({
        embeds: [
          shenronEmbed({
            header: "SIGNALEMENTS",
            title: "📋 Registre des signalements",
            color: COLORS.muted,
            description: `✅ Aucun signalement correspondant (\`${filter}\`).`,
          }),
        ],
      });
      return;
    }

    const lines = reports.slice(0, LIST_LIMIT).map((r) => {
      const by = r.user_tag ? `@${r.user_tag}` : `<@${r.user_id}>`;
      return `**#${r.id} [${r.category.toUpperCase()}]** ${excerpt(r.title, 120)} (\`${r.severity}\` · ${r.status})\n> ${excerpt(r.description, 110)} *(par ${by} le ${frDate(r.created_at)})*`;
    });

    await interaction.editReply({
      embeds: [
        shenronEmbed({
          header: "SIGNALEMENTS",
          title: `📋 Registre des signalements (${reports.length})`,
          color: SHENRON_THEME.saiyanBlue,
          description: lines.join("\n\n"),
          footer:
            reports.length > LIST_LIMIT
              ? `${LIST_LIMIT} plus récents affichés · registre complet : var/reports/ADMIN-REPORTS.md`
              : "Registre complet : var/reports/ADMIN-REPORTS.md",
        }),
      ],
    });
  }

  @Slash({
    name: "resoudre",
    description: "Staff : marquer un signalement comme résolu avec notes d'intervention",
  })
  async resolve(
    @SlashOption({
      name: "id",
      description: "Numéro ID du signalement",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
    })
    id: number,
    @SlashOption({
      name: "notes",
      description: "Ce qui a été corrigé ou ajusté",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 1500,
    })
    notes: string,
    interaction: CommandInteraction,
  ) {
    // `/report creer` is open to every member; closing a report is a staff action.
    const isStaff =
      isBotOwner(interaction.user.id) ||
      (interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers) ?? false);
    if (!isStaff) {
      await interaction.reply({
        embeds: [
          errorEmbed("Action réservée au staff", "Seul le staff peut clore un signalement."),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply();

    try {
      const rep = await this.service.resolveReport(id, notes, `@${interaction.user.username}`);
      await interaction.editReply({
        embeds: [
          rep
            ? successEmbed(
                `Signalement #${id} résolu`,
                `**${excerpt(rep.title, 200)}**\nMis à jour en base et dans \`var/reports/ADMIN-REPORTS.md\`.`,
              )
            : errorEmbed("Signalement introuvable", `Aucun signalement #${id}.`),
        ],
      });
    } catch (e) {
      await interaction.editReply({ embeds: [errorEmbed("Résolution échouée", errorText(e))] });
    }
  }
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly)
@SlashGroup({
  name: "goal",
  description: "Définition des objectifs et feuille de route pour les agents de code",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
@SlashGroup("goal")
@injectable()
export class GoalCommands {
  constructor(@inject(AdminReportGoalService) private service: AdminReportGoalService) {}

  @Slash({
    name: "fixer",
    description:
      "Déterminer un objectif prioritaire pour la prochaine session (synchronisé en Markdown)",
  })
  async setGoal(
    @SlashOption({
      name: "titre",
      description: "Titre clair de l'objectif",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 200,
    })
    title: string,
    @SlashOption({
      name: "description",
      description: "Spécifications de ce qu'il faut faire",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 2000,
    })
    description: string,
    @SlashChoice({ name: "P0 (Priorité absolue / Urgence)", value: "p0" })
    @SlashChoice({ name: "P1 (Priorité haute)", value: "p1" })
    @SlashChoice({ name: "P2 (Normal)", value: "p2" })
    @SlashChoice({ name: "P3 (Secondaire / Backlog)", value: "p3" })
    @SlashOption({
      name: "priorite",
      description: "Niveau de priorité",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    priority: "p0" | "p1" | "p2" | "p3" | undefined,
    @SlashChoice({ name: "Prochaine session (next_session)", value: "next_session" })
    @SlashChoice({ name: "Session en cours", value: "session_current" })
    @SlashOption({
      name: "session_cible",
      description: "Fenêtre temporelle d'exécution",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    targetSession: string | undefined,
    @SlashChoice({ name: "Tous les agents (all_agents)", value: "all_agents" })
    @SlashChoice({ name: "Claude Code", value: "claude" })
    @SlashChoice({ name: "AGY (Antigravity)", value: "agy" })
    @SlashChoice({ name: "Codex", value: "codex" })
    @SlashOption({
      name: "assigne_a",
      description: "Agent ciblé",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    assignedTo: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();
    const prio = priority ?? "p1";
    const session = targetSession ?? "next_session";
    const assignee = assignedTo ?? "all_agents";

    try {
      const goal = await this.service.createGoal({
        userId: interaction.user.id,
        userTag: interaction.user.username,
        title,
        description,
        priority: prio,
        targetSession: session,
        assignedTo: assignee,
      });

      await interaction.editReply({
        embeds: [
          shenronEmbed({
            header: "FEUILLE DE ROUTE",
            title: `🎯 Objectif #${goal.id} programmé pour la session !`,
            color: SHENRON_THEME.gold,
            description: [
              `**Titre :** ${title}`,
              `**Description :** ${description}`,
              `**Priorité :** \`${prio.toUpperCase()}\``,
              `**Session cible :** \`${session}\``,
              `**Assigné à :** \`${assignee}\``,
              "",
              SHENRON_SEPARATORS.solid,
              `• Synchronisé en temps réel dans \`var/reports/GOALS.md\``,
              `• Enregistré en base (\`admin_goals\`)`,
              `• Pris en charge par les agents (Claude, AGY, Codex) dès la prochaine session.`,
            ].join("\n"),
          }),
        ],
      });
    } catch (e) {
      await interaction.editReply({ embeds: [errorEmbed("Objectif refusé", errorText(e))] });
    }
  }

  @Slash({
    name: "liste",
    description: "Afficher les objectifs actifs ou l'historique complet",
  })
  async list(
    @SlashChoice({ name: "Objectifs actifs", value: "pending" })
    @SlashChoice({ name: "Tous les objectifs", value: "all" })
    @SlashChoice({ name: "Objectifs complétés", value: "completed" })
    @SlashOption({
      name: "statut",
      description: "Filtrer par statut",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    status: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();

    const filter = status ?? "pending";
    const goals = this.service.listGoals(filter);
    if (goals.length === 0) {
      await interaction.editReply({
        embeds: [
          shenronEmbed({
            header: "FEUILLE DE ROUTE",
            title: "🎯 Feuille de route & objectifs",
            color: COLORS.muted,
            description: `✅ Aucun objectif correspondant (\`${filter}\`).`,
          }),
        ],
      });
      return;
    }

    const lines = goals.slice(0, LIST_LIMIT).map((g) => {
      return `**#${g.id} [${g.priority.toUpperCase()}]** ${excerpt(g.title, 120)} (\`${g.target_session}\` · assigné à \`${g.assigned_to}\`)\n> ${excerpt(g.description, 110)} *(statut : ${g.status})*`;
    });

    await interaction.editReply({
      embeds: [
        shenronEmbed({
          header: "FEUILLE DE ROUTE",
          title: `🎯 Feuille de route & objectifs (${goals.length})`,
          color: SHENRON_THEME.kiGreen,
          description: lines.join("\n\n"),
          footer:
            goals.length > LIST_LIMIT
              ? `${LIST_LIMIT} plus récents affichés · plan complet : var/reports/GOALS.md`
              : "Plan complet : var/reports/GOALS.md",
        }),
      ],
    });
  }

  @Slash({
    name: "accompli",
    description: "Marquer un objectif comme complété avec un bilan de session",
  })
  async complete(
    @SlashOption({
      name: "id",
      description: "Numéro ID de l'objectif",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
    })
    id: number,
    @SlashOption({
      name: "bilan",
      description: "Résumé des réalisations",
      type: ApplicationCommandOptionType.String,
      required: false,
      maxLength: 1500,
    })
    notes: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();

    try {
      const goal = await this.service.completeGoal(id, notes);
      await interaction.editReply({
        embeds: [
          goal
            ? successEmbed(
                `Objectif #${id} accompli 🏆`,
                `**${excerpt(goal.title, 200)}**\nMis à jour dans \`var/reports/GOALS.md\`.`,
              )
            : errorEmbed("Objectif introuvable", `Aucun objectif #${id}.`),
        ],
      });
    } catch (e) {
      await interaction.editReply({ embeds: [errorEmbed("Mise à jour échouée", errorText(e))] });
    }
  }
}
