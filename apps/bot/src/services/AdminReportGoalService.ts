import { inject, singleton } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { sendAdminLabMessage, type AdminLabMessageOptions } from "~/lib/admin-lab";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { truncate } from "~/lib/embeds";

export interface CreateReportInput {
  userId: string;
  userTag?: string;
  category: "site" | "bot" | "wiki" | "canon" | "databook" | "other";
  title: string;
  description: string;
  severity?: "critical" | "major" | "minor" | "suggestion";
}

export interface CreateGoalInput {
  userId: string;
  userTag?: string;
  title: string;
  description: string;
  priority?: "p0" | "p1" | "p2" | "p3";
  targetSession?: string;
  assignedTo?: string;
  notes?: string;
}

export type ReportSeverity = NonNullable<CreateReportInput["severity"]>;

/** Embed colour of a report severity (admin channel notification and command reply). */
export const REPORT_SEVERITY_COLORS: Record<ReportSeverity, number> = {
  critical: 0xef4444,
  major: 0xf97316,
  minor: 0x38bdf8,
  suggestion: 0xa78bfa,
};

/** Statuses still awaiting work, listed by the 'open' / 'pending' filters and the Markdown. */
const OPEN_REPORT_STATUSES = ["open", "in_progress"];
const ACTIVE_GOAL_STATUSES = ["pending", "in_progress"];

/** Text safe inside a Markdown table cell: no pipe nor line break may split the row. */
export function escapeMdCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replaceAll("|", "\\|")
    .trim();
}

const frDate = (ms: number) => new Date(ms).toLocaleDateString("fr-FR");
const frDateTime = (ms: number) => new Date(ms).toLocaleString("fr-FR");

/** Sends an embed payload to the admin channel. */
export type AdminLabNotifier = (options: AdminLabMessageOptions) => Promise<unknown>;

export interface AdminReportGoalOptions {
  /** Directory receiving ADMIN-REPORTS.md and GOALS.md (default: `<cwd>/var/reports`). */
  docsDir?: string;
  /** Admin channel notifier (default: `sendAdminLabMessage`). */
  notify?: AdminLabNotifier;
}

/** Production defaults: the agents' session entry protocol reads these files. */
const DEFAULT_ADMIN_DOCS_DIR = join(process.cwd(), "var", "reports");
/** Runtime SQLite database of the bot (source of the PostgreSQL `bot` mirror). */
const PRODUCTION_DB_PATH = resolve(import.meta.dir, "..", "..", "data", "bot.db");

/**
 * True when the process is the `bun test` runner. `Bun.main` is then the test file;
 * ops scripts that merely set NODE_ENV=test are not matched.
 */
export function isBunTestRunner(): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(Bun.main);
}

function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return real(a) === real(b);
}

@singleton()
export class AdminReportGoalService {
  private docsDir = DEFAULT_ADMIN_DOCS_DIR;
  private notify: AdminLabNotifier = sendAdminLabMessage;

  constructor(@inject(DatabaseService) private dbs: DatabaseService) {}

  /**
   * Builds an instance outside the DI container (tests, ops scripts) with an
   * isolated database, docs directory and notifier.
   */
  static create(
    dbs: DatabaseService,
    options: AdminReportGoalOptions = {},
  ): AdminReportGoalService {
    const service = new AdminReportGoalService(dbs);
    if (options.docsDir) service.docsDir = options.docsDir;
    if (options.notify) service.notify = options.notify;
    return service;
  }

  private get reportsMdPath() {
    return join(this.docsDir, "ADMIN-REPORTS.md");
  }

  private get goalsMdPath() {
    return join(this.docsDir, "GOALS.md");
  }

  /**
   * Refuses any write when `bun test` runs against production resources: the
   * runtime bot.db (mirrored to PostgreSQL) or the repository docs read by agents.
   */
  private assertNotProductionUnderTest(): void {
    if (!isBunTestRunner()) return;
    const filename = this.dbs.sqlite.filename;
    if (filename && samePath(filename, PRODUCTION_DB_PATH)) {
      throw new Error(
        "[AdminReportGoalService] refus : bun test sur la base de production (apps/bot/data/bot.db). Utiliser DatabaseService.forPath(<fichier temporaire>).",
      );
    }
    if (samePath(this.docsDir, DEFAULT_ADMIN_DOCS_DIR)) {
      throw new Error(
        "[AdminReportGoalService] refus : bun test sur var/reports/ de production. Utiliser AdminReportGoalService.create(dbs, { docsDir }).",
      );
    }
  }

  /** Notifies the admin channel, never from the test runner with the real notifier. */
  private async notifyAdmin(options: AdminLabMessageOptions): Promise<void> {
    if (isBunTestRunner() && this.notify === sendAdminLabMessage) return;
    await this.notify(options);
  }

  /**
   * Crée un nouveau rapport de bug/manque, le persiste en base,
   * met à jour var/reports/ADMIN-REPORTS.md et notifie le salon admin.
   */
  async createReport(input: CreateReportInput) {
    this.assertNotProductionUnderTest();
    const res = this.dbs.sqlite
      .query(
        `INSERT INTO admin_reports (user_id, user_tag, category, title, description, severity, status, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
				 RETURNING *`,
      )
      .get(
        input.userId,
        input.userTag ?? null,
        input.category,
        input.title,
        input.description,
        input.severity ?? "minor",
        Date.now(),
      ) as any;

    await this.syncReportsMarkdown();

    // Notification Discord dans le salon admin (bornée aux limites d'un embed)
    try {
      await this.notifyAdmin({
        embeds: [
          {
            color: REPORT_SEVERITY_COLORS[input.severity ?? "minor"],
            title: truncate(
              `🚨 Signalement #${res.id} [${input.category.toUpperCase()}] : ${input.title}`,
              256,
            ),
            description: [
              `> ${truncate(input.description, 3500)}`,
              "",
              `• **Sévérité :** \`${(input.severity ?? "minor").toUpperCase()}\``,
              `• **Auteur :** <@${input.userId}> (${input.userTag ?? "Admin"})`,
              `• **Statut :** \`OUVERT\``,
              `• **Fichier synchronisé :** \`var/reports/ADMIN-REPORTS.md\``,
            ].join("\n"),
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (e) {
      console.error("[AdminReportGoalService] Échec notification report:", e);
    }

    return res;
  }

  /**
   * Résout un rapport existant et resynchronise le Markdown.
   */
  async resolveReport(id: number, resolutionNotes: string, resolverTag?: string) {
    this.assertNotProductionUnderTest();
    const report = this.dbs.sqlite.query("SELECT * FROM admin_reports WHERE id = ?").get(id) as any;
    if (!report) return null;

    this.dbs.sqlite
      .query(
        "UPDATE admin_reports SET status = 'resolved', resolution_notes = ?, resolved_at = ? WHERE id = ?",
      )
      .run(resolutionNotes, Date.now(), id);

    await this.syncReportsMarkdown();

    try {
      await this.notifyAdmin({
        embeds: [
          {
            color: 0x22c55e,
            title: truncate(`✅ Signalement #${id} Résolu : ${report.title}`, 256),
            description: [
              `> **Notes de résolution :** ${truncate(resolutionNotes, 3500)}`,
              "",
              `• **Résolu par :** ${resolverTag ?? "Agent / Admin"}`,
              `• **Mise à jour :** \`var/reports/ADMIN-REPORTS.md\``,
            ].join("\n"),
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch {}

    return { ...report, status: "resolved", resolution_notes: resolutionNotes };
  }

  /**
   * Liste les rapports avec filtrage optionnel.
   */
  listReports(status?: string): any[] {
    if (status && status !== "all") {
      // "open" also covers reports being worked on, as in ADMIN-REPORTS.md.
      const statuses = status === "open" ? OPEN_REPORT_STATUSES : [status];
      return this.dbs.sqlite
        .query(
          `SELECT * FROM admin_reports WHERE status IN (${statuses.map(() => "?").join(", ")}) ORDER BY id DESC`,
        )
        .all(...statuses) as any[];
    }
    return this.dbs.sqlite.query("SELECT * FROM admin_reports ORDER BY id DESC").all() as any[];
  }

  /**
   * Crée un nouvel objectif (goal) pour la session courante ou suivante.
   */
  async createGoal(input: CreateGoalInput) {
    this.assertNotProductionUnderTest();
    const res = this.dbs.sqlite
      .query(
        `INSERT INTO admin_goals (user_id, user_tag, title, description, priority, status, target_session, assigned_to, notes, created_at)
				 VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
				 RETURNING *`,
      )
      .get(
        input.userId,
        input.userTag ?? null,
        input.title,
        input.description,
        input.priority ?? "p1",
        input.targetSession ?? "next_session",
        input.assignedTo ?? "all_agents",
        input.notes ?? null,
        Date.now(),
      ) as any;

    await this.syncGoalsMarkdown();

    try {
      await this.notifyAdmin({
        embeds: [
          {
            color: 0xf59e0b,
            title: truncate(
              `🎯 Objectif #${res.id} [${(input.priority ?? "p1").toUpperCase()}] : ${input.title}`,
              256,
            ),
            description: [
              `> ${truncate(input.description, 3500)}`,
              "",
              `• **Priorité :** \`${(input.priority ?? "p1").toUpperCase()}\``,
              `• **Session cible :** \`${input.targetSession ?? "next_session"}\``,
              `• **Attribué à :** \`${input.assignedTo ?? "all_agents"}\``,
              `• **Auteur :** <@${input.userId}> (${input.userTag ?? "Admin"})`,
              `• **Fichier synchronisé :** \`var/reports/GOALS.md\``,
            ].join("\n"),
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (e) {
      console.error("[AdminReportGoalService] Échec notification goal:", e);
    }

    return res;
  }

  /**
   * Marque un objectif comme complété.
   */
  async completeGoal(id: number, notes?: string) {
    this.assertNotProductionUnderTest();
    const goal = this.dbs.sqlite.query("SELECT * FROM admin_goals WHERE id = ?").get(id) as any;
    if (!goal) return null;

    this.dbs.sqlite
      .query(
        "UPDATE admin_goals SET status = 'completed', completed_at = ?, notes = COALESCE(?, notes) WHERE id = ?",
      )
      .run(Date.now(), notes ?? null, id);

    await this.syncGoalsMarkdown();

    try {
      await this.notifyAdmin({
        embeds: [
          {
            color: 0x22c55e,
            title: truncate(`🏆 Objectif #${id} Accompli : ${goal.title}`, 256),
            description: [
              notes ? `> **Bilan :** ${truncate(notes, 3500)}` : `> Objectif validé avec succès.`,
              "",
              `• **Statut :** \`COMPLETED\``,
              `• **Mise à jour :** \`var/reports/GOALS.md\``,
            ].join("\n"),
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch {}

    return { ...goal, status: "completed", notes: notes ?? goal.notes };
  }

  /**
   * Liste les objectifs enregistrés.
   */
  listGoals(status?: string): any[] {
    if (status && status !== "all") {
      // "pending" also covers goals in progress, as in GOALS.md.
      const statuses = status === "pending" ? ACTIVE_GOAL_STATUSES : [status];
      return this.dbs.sqlite
        .query(
          `SELECT * FROM admin_goals WHERE status IN (${statuses.map(() => "?").join(", ")}) ORDER BY id DESC`,
        )
        .all(...statuses) as any[];
    }
    return this.dbs.sqlite.query("SELECT * FROM admin_goals ORDER BY id DESC").all() as any[];
  }

  /**
   * Synchronise en temps réel la table `admin_reports` vers `var/reports/ADMIN-REPORTS.md`.
   */
  async syncReportsMarkdown(): Promise<void> {
    this.assertNotProductionUnderTest();
    const all = this.listReports("all");
    const open = all.filter((r) => r.status === "open" || r.status === "in_progress");
    const resolved = all.filter((r) => r.status === "resolved");
    const rejected = all.filter((r) => r.status === "rejected");

    const md = [
      "# ADMIN-REPORTS.md — Registre des Signalements & Manques",
      "",
      "> Fichier synchronisé en temps réel depuis SQLite (`admin_reports`) et le salon `🤖・lab-ia-admin`.",
      `> Dernière synchronisation : ${new Date().toISOString()}`,
      "",
      "## 1. Signalements Ouverts / En Cours",
      "",
      open.length === 0
        ? "*Aucun signalement en attente. Tout le système est nominal.*"
        : [
            "| ID | Catégorie | Sévérité | Titre | Auteur | Date |",
            "|:---:|:---:|:---:|:---|:---:|:---:|",
            ...open.map(
              (r) =>
                `| **#${r.id}** | \`${r.category}\` | **${r.severity.toUpperCase()}** | ${escapeMdCell(r.title)} | @${escapeMdCell(r.user_tag ?? r.user_id)} | ${frDate(r.created_at)} |`,
            ),
            "",
            "### Détails des signalements ouverts",
            ...open.map(
              (r) =>
                `\n#### #${r.id} — ${r.title} (\`${r.category}\` · ${r.severity})\n- **Description :** ${r.description}\n- **Créé le :** ${frDateTime(r.created_at)}`,
            ),
          ].join("\n"),
      "",
      "---",
      "",
      "## 2. Historique des Signalements Résolus",
      "",
      resolved.length === 0
        ? "*Aucun rapport résolu pour l'instant.*"
        : [
            "| ID | Catégorie | Titre | Résolution | Date Résolution |",
            "|:---:|:---:|:---|:---|:---:|",
            ...resolved.map(
              (r) =>
                `| **#${r.id}** | \`${r.category}\` | ${escapeMdCell(r.title)} | ${escapeMdCell(r.resolution_notes ?? "Traité")} | ${frDate(r.resolved_at ?? r.created_at)} |`,
            ),
          ].join("\n"),
      "",
      "## 3. Signalements Rejetés",
      "",
      rejected.length === 0
        ? "*Aucun rapport rejeté.*"
        : [
            "| ID | Catégorie | Titre | Date |",
            "|:---:|:---:|:---|:---:|",
            ...rejected.map(
              (r) =>
                `| **#${r.id}** | \`${r.category}\` | ${escapeMdCell(r.title)} | ${frDate(r.created_at)} |`,
            ),
          ].join("\n"),
      "",
    ].join("\n");

    await Bun.write(this.reportsMdPath, md);
  }

  /**
   * Synchronise en temps réel la table `admin_goals` vers `var/reports/GOALS.md`.
   */
  async syncGoalsMarkdown(): Promise<void> {
    this.assertNotProductionUnderTest();
    const all = this.listGoals("all");
    const active = all.filter((g) => g.status === "pending" || g.status === "in_progress");
    const deferred = all.filter((g) => g.status === "deferred");
    const completed = all.filter((g) => g.status === "completed");

    const md = [
      "# GOALS.md — Objectifs & Feuille de Route de Session",
      "",
      "> Ce document est synchronisé en temps réel depuis la base de données (`admin_goals`) et les directives Discord des administrateurs.",
      "> **Agents IA (Claude, AGY, Codex)** : Au début de chaque session, lisez attentivement ce fichier pour déterminer la tâche prioritaire à accomplir.",
      `> Dernière synchronisation : ${new Date().toISOString()}`,
      "",
      "## 1. Objectifs Prioritaires Actifs",
      "",
      active.length === 0
        ? `*Aucun objectif actif. ${deferred.length} objectif(s) différé(s) restent à reprendre ; ${completed.length} objectif(s) accompli(s).*`
        : [
            "| ID | Priorité | Titre | Session Cible | Assigné à | Date |",
            "|:---:|:---:|:---|:---:|:---:|:---:|",
            ...active.map(
              (g) =>
                `| **#${g.id}** | \`${g.priority.toUpperCase()}\` | **${escapeMdCell(g.title)}** | \`${g.target_session}\` | \`${g.assigned_to}\` | ${frDate(g.created_at)} |`,
            ),
            "",
            "### Spécifications des objectifs",
            ...active.map(
              (g) =>
                `\n#### Goal #${g.id} [${g.priority.toUpperCase()}] : ${g.title}\n- **Description :** ${g.description}\n- **Assigné à :** \`${g.assigned_to}\`\n- **Session :** \`${g.target_session}\`${g.notes ? `\n- **Notes :** ${g.notes}` : ""}`,
            ),
          ].join("\n"),
      "",
      "---",
      "",
      "## 2. Objectifs Différés",
      "",
      deferred.length === 0
        ? "*Aucun objectif différé.*"
        : [
            "| ID | Priorité | Titre | Session Cible | Assigné à | Date |",
            "|:---:|:---:|:---|:---:|:---:|:---:|",
            ...deferred.map(
              (g) =>
                `| **#${g.id}** | \`${g.priority.toUpperCase()}\` | ${escapeMdCell(g.title)} | \`${g.target_session}\` | \`${g.assigned_to}\` | ${frDate(g.created_at)} |`,
            ),
          ].join("\n"),
      `\n*État : ${active.length} actif(s), ${deferred.length} différé(s), ${completed.length} accompli(s).*`,
      "",
      "## 3. Objectifs Complétés",
      "",
      completed.length === 0
        ? "*Aucun objectif archivé.*"
        : [
            "| ID | Titre | Date Réalisation | Bilan |",
            "|:---:|:---|:---:|:---|",
            ...completed.map(
              (g) =>
                `| **#${g.id}** | ${escapeMdCell(g.title)} | ${frDate(g.completed_at ?? g.created_at)} | ${escapeMdCell(g.notes ?? "Terminé")} |`,
            ),
          ].join("\n"),
      "",
    ].join("\n");

    await Bun.write(this.goalsMdPath, md);
  }
}
