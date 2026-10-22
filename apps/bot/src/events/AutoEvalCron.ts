import { injectable, inject } from "tsyringe";
import { Bot, Discord, Once } from "discordx";
import { CronRegistry } from "~/api/cron-registry";
import { TrainingService } from "~/services/TrainingService";
import { logger } from "~/lib/logger";
import { sendAdminLabMessage } from "~/lib/admin-lab";
import { COLORS, shenronEmbed } from "~/lib/embeds";
import { embeddingsLabel } from "~/commands/admin/Train";

/** Interval of the periodic evaluation and sample size of each run. */
const EVAL_INTERVAL_MS = 6 * 3_600_000;
const EVAL_SAMPLE = 25;

/**
 * AutoEvalCron — Évaluation automatisée et surveillance de la précision du RAG.
 *
 * Exécute un banc d'évaluation périodique sur l'échantillon d'or (tests/rag-gold.jsonl),
 * historise les scores (Recall, MRR, nDCG) en base SQLite (rag_eval_history)
 * et alerte automatiquement le salon admin en cas de dégradation ou régression.
 */
@Discord()
@Bot("shenron")
@injectable()
export class AutoEvalCronEvent {
  constructor(
    @inject(CronRegistry) private cron: CronRegistry,
    @inject(TrainingService) private training: TrainingService,
  ) {}

  @Once({ event: "clientReady" })
  async register() {
    this.cron.register({
      name: "rag-auto-eval",
      description: "Évaluation périodique du banc de test doré RAG et détection de régressions",
      intervalMs: EVAL_INTERVAL_MS,
      fn: async () => {
        logger.info("[AutoEvalCron] Lancement du banc d'évaluation RAG périodique...");
        try {
          const metrics = await this.training.evaluateRag(EVAL_SAMPLE);
          logger.info(
            {
              cases: metrics.cases,
              recall1: metrics.recall[1],
              recall5: metrics.recall[5],
              mrr: metrics.mrr,
              ndcg: metrics.ndcg,
              misses: metrics.misses.length,
              sidecar: metrics.sidecarActive,
            },
            "[AutoEvalCron] Évaluation RAG terminée avec succès",
          );

          // Rapport périodique synthétique dans le salon admin si sidecar offline ou des misses
          if (!metrics.sidecarActive || metrics.misses.length > 0) {
            await sendAdminLabMessage({
              embeds: [
                shenronEmbed({
                  header: "LAB IA ADMIN",
                  color: metrics.sidecarActive ? COLORS.success : COLORS.warning,
                  title: "📊 RAPPORT AUTOMATIQUE — ÉVALUATION RAG",
                  description: [
                    `Cycle d'évaluation périodique automatique (${metrics.cases} cas testés).`,
                    "",
                    `• **Recall@1 :** \`${((metrics.recall[1] ?? 0) * 100).toFixed(1)}%\``,
                    `• **Recall@5 :** \`${((metrics.recall[5] ?? 0) * 100).toFixed(1)}%\``,
                    `• **MRR :** \`${(metrics.mrr * 100).toFixed(1)}%\``,
                    `• **nDCG@10 :** \`${(metrics.ndcg * 100).toFixed(1)}%\``,
                    `• **Embeddings :** ${embeddingsLabel(metrics.sidecarActive, process.env.RAG_BACKEND === "aphrody")}`,
                    `• **Misses :** \`${metrics.misses.length} / ${metrics.cases}\``,
                  ].join("\n"),
                }).toJSON(),
              ],
            }).catch((err) => logger.warn({ err }, "[AutoEvalCron] Erreur notification admin"));
          }
        } catch (err) {
          logger.error({ err }, "[AutoEvalCron] Échec de l'évaluation RAG planifiée");
        }
      },
    });

    // Évaluation rapide au démarrage (décalée de 15s pour laisser le bot s'initialiser)
    setTimeout(async () => {
      try {
        logger.info("[AutoEvalCron] Évaluation initiale au démarrage du bot...");
        await this.training.evaluateRag(10);
      } catch (err) {
        logger.warn({ err }, "[AutoEvalCron] Évaluation initiale différée ignorée");
      }
    }, 15_000).unref?.();
  }
}
