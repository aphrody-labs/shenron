import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlagsBits,
  type CommandInteraction,
  type User,
} from "discord.js";
import { eq } from "drizzle-orm";
import { GuildOnly } from "~/guards/GuildOnly";
import { userTransformer } from "~/lib/slash-user";
import { DatabaseService } from "~/db/index";
import { users } from "~/db/schema";
import { SettingsService } from "~/services/SettingsService";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { AchievementService } from "~/services/AchievementService";
import { CommandPermissionsService } from "~/services/CommandPermissionsService";
import {
  brandedEmbed,
  COLORS,
  errorEmbed,
  errorText,
  shenronEmbed,
  successEmbed,
  truncate,
} from "~/lib/embeds";
import type { Database } from "bun:sqlite";

/** Human-readable size of a byte count (KB under one MB). */
export function formatBytes(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/** Row count of every user table of the database (`null` when a count fails). */
export function sqliteTableCounts(sqlite: Database): Array<{ table: string; rows: number | null }> {
  const tables = sqlite
    .query(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;
  return tables
    .filter(({ name }) => !name.startsWith("__"))
    .map(({ name }) => {
      try {
        const row = sqlite
          .query(`SELECT COUNT(*) AS c FROM "${name.replaceAll('"', '""')}"`)
          .get() as {
          c: number;
        } | null;
        return { table: name, rows: Number(row?.c ?? 0) };
      } catch {
        return { table: name, rows: null };
      }
    });
}

/**
 * Outils admin transverses : reload des caches runtime, stats DB, reset
 * complet d'un membre. Visibles par défaut des seuls administrateurs ; l'accès
 * fin reste défini par les règles persistées du dashboard.
 */
@Discord()
@Bot("shenron")
@Guard(GuildOnly)
@SlashGroup({
  name: "admin",
  description: "Admin: outils transverses (reload caches, stats DB, reset membre)",
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
})
@SlashGroup("admin")
@injectable()
export class AdminCommands {
  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(SettingsService) private settings: SettingsService,
    @inject(MessageTemplateService) private templates: MessageTemplateService,
    @inject(AchievementService) private ach: AchievementService,
    @inject(CommandPermissionsService) private permissions: CommandPermissionsService,
  ) {}

  @Slash({
    name: "reload",
    description: "Recharger tous les caches runtime (settings, templates, permissions, succès)",
  })
  async reload(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t0 = Date.now();
    try {
      this.settings.invalidate();
      this.permissions.invalidate();
      await this.templates.invalidate();
      await this.ach.refresh();
      await interaction.editReply({
        embeds: [
          successEmbed(
            "Caches rechargés",
            `Settings, templates, permissions et triggers de succès rechargés en ${Date.now() - t0} ms.`,
          ),
        ],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed("Rechargement échoué", errorText(err))] });
    }
  }

  @Slash({ name: "db-stats", description: "Statistiques rapides de la base SQLite" })
  async dbStats(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const counts = sqliteTableCounts(this.dbs.sqlite);
    let dbSize = "—";
    try {
      const size = this.dbs.sqlite
        .query("SELECT page_count * page_size AS s FROM pragma_page_count(), pragma_page_size()")
        .get() as { s: number } | null;
      dbSize = formatBytes(Number(size?.s ?? 0));
    } catch {}

    const width = Math.max(5, ...counts.map((c) => c.table.length));
    const lines = counts.map(
      (c) => `${c.table.padEnd(width)} ${c.rows === null ? "—" : c.rows.toLocaleString("fr-FR")}`,
    );
    const totalRows = counts.reduce((sum, c) => sum + (c.rows ?? 0), 0);
    const embed = shenronEmbed({
      header: "ADMINISTRATION",
      title: "📊 Base SQLite du bot",
      color: COLORS.info,
      description: [
        `Fichier : **${dbSize}** · **${counts.length}** tables · **${totalRows.toLocaleString("fr-FR")}** lignes`,
        `\`\`\`\n${truncate(lines.join("\n"), 3800)}\n\`\`\``,
      ].join("\n"),
    });
    await interaction.editReply({ embeds: [embed] });
  }

  @Slash({
    name: "reset-user",
    description:
      "DANGER: supprimer entièrement un membre de la DB (cascade XP/zeni/inventaire/succès)",
  })
  async resetUser(
    @SlashOption(
      {
        name: "membre",
        description: "Membre à wipe",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      userTransformer,
    )
    target: User,
    @SlashOption({
      name: "confirm",
      description: "Tapez 'CONFIRM' pour valider la suppression irréversible",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    confirm: string,
    interaction: CommandInteraction,
  ) {
    if (confirm.trim() !== "CONFIRM") {
      await interaction.reply({
        embeds: [
          errorEmbed(
            "Confirmation invalide",
            "Tape exactement `CONFIRM` (en majuscules) pour valider.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await this.dbs.db
        .delete(users)
        .where(eq(users.id, target.id))
        .returning({ id: users.id });
      await interaction.editReply({
        embeds: [
          result.length > 0
            ? successEmbed(
                "Membre supprimé",
                `<@${target.id}> et toutes ses données (XP, zeni, inventaire, succès) ont été supprimés.\n\nLes logs modération sont conservés.`,
              )
            : brandedEmbed({
                title: "Membre absent",
                description: `<@${target.id}> n'avait aucune donnée en base.`,
                kind: "muted",
              }),
        ],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed("Suppression échouée", errorText(err))] });
    }
  }
}
