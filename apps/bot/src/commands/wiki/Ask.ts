import { inject, injectable } from "tsyringe";
import {
  Bot,
  ButtonComponent,
  Discord,
  Guard,
  ModalComponent,
  Slash,
  SlashChoice,
  SlashOption,
} from "discordx";
import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  type CommandInteraction,
  EmbedBuilder,
  MessageFlags,
  type MessageMentionOptions,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { FeatureEnabled } from "~/guards/FeatureEnabled";
import { DatabaseService } from "~/db/index";
import { hybridSearch, hitTruthWeight, type SearchOptions } from "~/lib/rag";
import { TrainingService } from "~/services/TrainingService";
import { AphrodyComputeClient } from "@aphrody/shenron-pipeline/aphrody";
import { isBotStaff } from "~/api/staff-check";
import { SingleUseTokens } from "~/services/games/anti-farm";
import { clip, linkLabel, siteLink, wikiFooter } from "~/lib/wiki-embeds";

/** Une validation « vérité » par membre et par passage (double-clic, re-clic). */
const goldVotes = new SingleUseTokens();
const GOLD_VOTE_TTL_MS = 24 * 60 * 60_000;

/**
 * S6 : les réponses de `/ask` reprennent la question et des extraits générés ;
 * aucune mention (@everyone/@here, rôle, utilisateur) n'y déclenche de ping,
 * seul l'auteur de la commande reste notifié.
 */
function llmAllowedMentions(): MessageMentionOptions {
  return { parse: [], repliedUser: true };
}

interface RagChunkDetails {
  rowid: number;
  title: string;
  url: string;
  kind: string;
  snippet: string;
  entity?: string;
  source_id?: string;
}

/** Métadonnées d'affichage par type de chunk RAG. */
const KIND_META: Record<string, { icon: string; label: string }> = {
  character: { icon: "🥋", label: "Personnage" },
  planet: { icon: "🪐", label: "Planète" },
  race: { icon: "🧬", label: "Race" },
  technique: { icon: "⚡", label: "Technique" },
  transformation: { icon: "🔥", label: "Transformation" },
  saga: { icon: "📖", label: "Saga" },
  movie: { icon: "🎬", label: "Film" },
  game: { icon: "🎮", label: "Jeu" },
  episode: { icon: "📺", label: "Épisode" },
  source: { icon: "📜", label: "Source" },
};

/**
 * `/ask` — Pose une question en langage naturel sur l'univers Dragon Ball.
 * Retrieval hybride (BM25 + embeddings denses, fusion RRF) sur les archives du
 * wiki ; réponse = passages les plus pertinents, sourcés et liés au site.
 * Persona Whis (savoir / pédagogie). Cf. lib/rag.ts.
 */
@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly, FeatureEnabled("features.wiki", "Le wiki"))
@injectable()
export class AskCommands {
  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(TrainingService) private training: TrainingService,
  ) {}

  private async getRagChunk(rowid: number): Promise<RagChunkDetails | null> {
    if (!Number.isSafeInteger(rowid) || rowid < 1) return null;
    if (process.env.RAG_BACKEND === "aphrody") {
      const doc = await new AphrodyComputeClient().ragDocument(`shenron:${rowid}`);
      return doc
        ? {
            rowid,
            title: doc.title,
            url: doc.url,
            kind: doc.kind,
            snippet: doc.snippet,
            entity: doc.entity,
            source_id: doc.originSourceId,
          }
        : null;
    }
    return this.dbs.sqlite
      .query(
        "SELECT rowid, kind, title, url, snippet, entity, source_id FROM rag_chunks WHERE rowid = ?",
      )
      .get(rowid) as RagChunkDetails | null;
  }

  @Slash({
    name: "ask",
    description: "Pose une question sur l'univers Dragon Ball (recherche IA hybride)",
  })
  async ask(
    @SlashOption({
      name: "question",
      description: "Ta question, en français (ex. comment Goku devient Super Saiyan)",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    question: string,
    @SlashOption({
      name: "personnage",
      description: "Filtrer les archives par personnage (ex. Son Goku, Vegeta)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    entity: string | undefined,
    @SlashChoice({ name: "Français", value: "fr" })
    @SlashChoice({ name: "Anglais", value: "en" })
    @SlashOption({
      name: "langue",
      description: "Filtrer par langue des documents (fr ou en)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    lang: string | undefined,
    @SlashOption({
      name: "source",
      description: "Filtrer par table/source de données (ex. db_characters, databooks, manga)",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    sourceId: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();
    const q = question.trim();
    if (q.length < 3) {
      await interaction.editReply({
        content: "Pose une question un peu plus précise, jeune disciple.",
        allowedMentions: llmAllowedMentions(),
      });
      return;
    }

    let results: Awaited<ReturnType<typeof hybridSearch>>["results"] = [];
    let mode = "lexical";
    try {
      const opts: SearchOptions = {
        lang: lang || undefined,
        entity: entity || undefined,
        sourceId: sourceId || undefined,
      };
      const out = await hybridSearch(this.dbs.sqlite, q, 5, opts);
      results = out.results;
      mode = out.mode;
    } catch {
      await interaction.editReply({
        content: "Les archives sont momentanément inaccessibles. Réessaie dans un instant.",
        allowedMentions: llmAllowedMentions(),
      });
      return;
    }

    if (results.length === 0) {
      await interaction.editReply({
        content: `Même les archives de l'Univers 7 restent muettes sur « ${q} ». Reformule ta question.`,
        allowedMentions: llmAllowedMentions(),
      });
      return;
    }

    // Réponse 100 % retrieval (RAG / tools) : on présente directement les
    // passages les plus pertinents des archives, SANS génération LLM. Citations
    // numérotées [n] reliant chaque extrait à la source listée plus bas.
    const top = results[0]!;
    const previews = results
      .slice(0, 3)
      .map((r, i) => {
        const meta = KIND_META[r.kind] ?? { icon: "•", label: r.kind };
        const snip = (r.snippet ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
        const pct = Math.round((r.score ?? 0) * 100);
        return `**[${i + 1}] ${meta.icon} [${linkLabel(r.title)}](${siteLink(r.url)})** · ${pct}%\n> ${snip || "_(voir la source)_"}`;
      })
      .join("\n\n");

    const modeIcon = mode.startsWith("hybrid") ? "🔄" : "📋";
    const embed = new EmbedBuilder()
      .setColor(0x38bdf8)
      .setAuthor({ name: `Whis ${modeIcon} · Archives de l'Univers 7` })
      .setTitle(clip(`❓ ${q}`, 256))
      .setDescription(
        `Voici les passages les plus pertinents de nos archives sur ta question :\n\n${previews}`.slice(
          0,
          4096,
        ),
      );

    // Ajout des sources consultées (mêmes numéros que les extraits ci-dessus)
    const sourcesText = results
      .map((r, i) => {
        const meta = KIND_META[r.kind] ?? { icon: "•", label: r.kind };
        return `[${i + 1}] ${meta.icon} [${linkLabel(r.title, 60)}](${siteLink(r.url)})`;
      })
      .join("  ·  ");

    embed.addFields({
      name: "📜 Sources consultées",
      value: sourcesText.slice(0, 1024),
    });

    const filterLabels: string[] = [];
    if (entity) filterLabels.push(`personnage: ${entity}`);
    if (lang) filterLabels.push(`langue: ${lang === "fr" ? "Français" : "Anglais"}`);
    if (sourceId) filterLabels.push(`source: ${sourceId}`);
    const filterText = filterLabels.length > 0 ? ` · Filtres : ${filterLabels.join(", ")}` : "";

    embed.setFooter(
      wikiFooter(
        (mode.startsWith("hybrid")
          ? `RAG · Recherche hybride + rerank · ${results.length} sources`
          : `RAG · Recherche lexicale · ${results.length} sources`) + filterText,
      ),
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(clip(`Ouvrir : ${top.title}`, 80))
        .setURL(siteLink(top.url)),
    );
    if (top.rowid > 0)
      row.addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Success)
          .setLabel("Valider Vérité")
          .setEmoji("🎯")
          .setCustomId(`rag:train:gold:${top.rowid}`),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Secondary)
          .setLabel("Diagnostic RAG")
          .setEmoji("🔍")
          .setCustomId(`rag:train:diag:${top.rowid}`),
        new ButtonBuilder()
          .setStyle(ButtonStyle.Danger)
          .setLabel("Signaler")
          .setEmoji("⚠️")
          .setCustomId(`rag:train:fb:${top.rowid}`),
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
      allowedMentions: llmAllowedMentions(),
    });
  }

  @ButtonComponent({ id: /^rag:train:gold:\d+$/ })
  async handleGoldBtn(interaction: ButtonInteraction) {
    const rowid = Number(interaction.customId.split(":")[3]);
    // Une référence « vérité » entraîne le RAG de tout le serveur : réservé au staff.
    if (!isBotStaff(interaction.user.id)) {
      await interaction.reply({
        content:
          "La validation des sources est réservée au staff. Utilise « Signaler » pour proposer une correction.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (!goldVotes.consume(`${interaction.user.id}:${rowid}`, GOLD_VOTE_TTL_MS)) {
      await interaction.reply({
        content: "Tu as déjà validé ce passage.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // Le passage peut venir du service distant : on accuse réception d'abord.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const chunk = await this.getRagChunk(rowid).catch(() => null);

    if (!chunk) {
      await interaction.editReply({ content: "Passage introuvable dans l'index." });
      return;
    }

    await this.training.recordFeedback({
      userId: interaction.user.id,
      userTag: interaction.user.username,
      type: "rag",
      query: chunk.title,
      rating: 5,
      expected: chunk.title,
      targetId: String(rowid),
      status: "gold_added",
      comment: "Validé comme vérité canon via bouton interactif Discord",
    });

    await interaction.editReply({
      content: `🎯 **Vérité Canon Validée !** La source « **${clip(chunk.title, 200)}** » a été enregistrée comme référence officielle d'entraînement.`,
    });
  }

  @ButtonComponent({ id: /^rag:train:diag:\d+$/ })
  async handleDiagBtn(interaction: ButtonInteraction) {
    const rowid = Number(interaction.customId.split(":")[3]);
    // Index distant et sonde du sidecar : plus de 3 s possibles, on diffère.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const chunk = await this.getRagChunk(rowid).catch(() => null);

    if (!chunk) {
      await interaction.editReply({ content: "Données de diagnostic indisponibles." });
      return;
    }

    const mult = hitTruthWeight(chunk);
    const sidecar = await this.training.isSidecarOnline().catch(() => false);

    const embed = new EmbedBuilder()
      .setColor(0x38bdf8)
      .setTitle(`🔍 Diagnostic RAG · Chunk #${rowid}`)
      .setDescription(
        [
          `**Titre :** \`${chunk.title}\``,
          `**Type d'entité :** \`${chunk.kind}\``,
          `**Entité liée :** \`${chunk.entity || "aucune"}\``,
          `**Source ID :** \`${chunk.source_id || "interne"}\``,
          `**Facteur de véracité (truthWeight) :** \`×${mult.toFixed(2)}\``,
          `**Embeddings :** ${sidecar ? "🟢 En ligne" : "🟠 Indisponibles"}`,
          "",
          `*Extrait indexé :*`,
          `> ${chunk.snippet ? clip(chunk.snippet, 500) : "(aucun)"}`,
        ].join("\n"),
      );

    await interaction.editReply({ embeds: [embed] });
  }

  @ButtonComponent({ id: /^rag:train:fb:\d+$/ })
  async handleFeedbackBtn(interaction: ButtonInteraction) {
    const rowid = interaction.customId.split(":")[3];
    const modal = new ModalBuilder()
      .setCustomId(`rag:train:modal:${rowid}`)
      .setTitle("Signaler une imprécision RAG");

    const inputExpected = new TextInputBuilder()
      .setCustomId("expected")
      .setLabel("Entité ou information attendue")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(200)
      .setRequired(true);

    const inputComment = new TextInputBuilder()
      .setCustomId("comment")
      .setLabel("Remarque (ex: filler, hors-sujet, jeu vidéo)")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(inputExpected),
      new ActionRowBuilder<TextInputBuilder>().addComponents(inputComment),
    );

    await interaction.showModal(modal);
  }

  @ModalComponent({ id: /^rag:train:modal:\d+$/ })
  async handleFeedbackModal(interaction: ModalSubmitInteraction) {
    const rowid = interaction.customId.split(":")[3];
    const expected = interaction.fields.getTextInputValue("expected").trim();
    const comment = interaction.fields.getTextInputValue("comment").trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const chunk = await this.getRagChunk(Number(rowid)).catch(() => null);

    await this.training.recordFeedback({
      userId: interaction.user.id,
      userTag: interaction.user.username,
      type: "rag",
      query: chunk?.title ?? `Chunk #${rowid}`,
      rating: 2,
      expected,
      comment,
      targetId: rowid,
      status: "pending",
    });

    await interaction.editReply({
      content: `✅ **Signalement enregistré !** Ton retour a été transmis pour l'entraînement continu de Shenron.`,
    });
  }
}
