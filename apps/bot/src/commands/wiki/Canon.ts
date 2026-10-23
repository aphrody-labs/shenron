import { inject, injectable } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashChoice, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
  type AutocompleteInteraction,
  type CommandInteraction,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { AdminOnly } from "~/guards/AdminOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { FeatureEnabled } from "~/guards/FeatureEnabled";
import { SettingsService } from "~/services/SettingsService";
import {
  CanonService,
  COULEURS_RANG,
  EMOJI_RANG,
  couleurHex,
  type CanonReference,
  type CanonTier,
  type CanonVerdict,
} from "~/services/CanonService";

/**
 * `/canon` — l'arbitre de canonicité de dragonballfr.com, dans Discord.
 *
 *   /canon verifier <affirmation>   verdict sourcé : rang, score, explication,
 *                                   déclarations de Toriyama, planches, fiches
 *   /canon doctrine                  les cinq rangs et les règles
 *   /canon sujets [rang]             les sujets tranchés (Broly, GT, SSJ5…)
 *   /canon citations <terme>         le corpus de preuves (Toriyama + databooks)
 *   /canon jour                      (admin) publie le canon du jour maintenant
 *
 * Rien n'est généré : le verdict vient d'une doctrine éditée à la main et les
 * preuves de nos propres bases. Quand la doctrine ne sait pas, elle le dit
 * (`origine: fallback`) et la commande le dit aussi — c'est la promesse de la
 * page, on la tient ici mot pour mot.
 */

const PROVENANCE_LABEL: Record<CanonReference["provenance"], string> = {
  aphrody: "déclaration d'auteur",
  databooks: "planche de databook",
  manga: "manga original",
  manuel: "saisie par l'équipe",
};

import { SHENRON_THEME, SHENRON_SEPARATORS, renderProgressBar } from "~/lib/embeds";
import {
  SITE_URL,
  clip,
  linkLabel,
  linkRow,
  respondAutocomplete,
  sendPages,
  siteLink,
  wikiAssetUrl,
  wikiAuthor,
  wikiFooter,
} from "~/lib/wiki-embeds";

function barreScore(score: number): string {
  return `${renderProgressBar(score, 100, 10)} (${score}/100)`;
}

function embedVerdict(v: CanonVerdict): EmbedBuilder {
  const r = v.verdict;
  // `nature` came with the troll detector; an older API answers without it.
  const nature = r.nature ?? (r.origine === "fallback" ? "question" : "verdict");
  const troll = nature === "troll";
  const inconnu = r.origine === "fallback" || troll;
  const badgeColor = inconnu ? 0x9ca3af : couleurHex(r.color, r.tier);

  const embed = new EmbedBuilder()
    .setColor(badgeColor)
    .setAuthor(wikiAuthor("ARBITRE DE CANONICITÉ"))
    .setTitle(
      `${troll ? "🚫" : inconnu ? "⚪" : EMOJI_RANG[r.tier]} 【${r.tierLabel.toUpperCase()}】 ${clip(v.question, 220)}`,
    )
    .setURL(`${SITE_URL}/wiki/canon?q=${encodeURIComponent(v.question)}`)
    .setDescription(
      [
        troll
          ? `*Rien à arbitrer : la question sort des sources.*`
          : `*Arbitrage officiel issu de la doctrine et des déclarations d'auteur.*`,
        "",
        `${SHENRON_SEPARATORS.solid}`,
        inconnu ? "" : `> **Autorité canonique :** \`${barreScore(r.score)}\``,
        "",
        `**Verdict :** ${r.verdict}`,
        r.explanation ? `\n> *${r.explanation}*` : "",
        "",
        `${SHENRON_SEPARATORS.solid}`,
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4096),
    );

  if (r.tierDefinition && !inconnu) {
    embed.addFields({
      name: "📖 Définition du rang",
      value: clip(r.tierDefinition, 1024),
    });
  }
  if (r.toriyamaQuote) {
    embed.addFields({
      name: clip(
        `🖋️ Akira Toriyama (鳥山 明) — ${r.toriyamaQuote.source}${r.toriyamaQuote.year ? ` (${r.toriyamaQuote.year})` : ""}`,
        256,
      ),
      value: `> « ${clip(r.toriyamaQuote.text, 950)} »`,
    });
  }
  for (const ref of v.references.slice(0, 2)) {
    const texte = ref.textFr ?? ref.text;
    const lien = ref.href ? ` · [Consulter le scan](${siteLink(ref.href)})` : "";
    embed.addFields({
      name: `📜 Preuve : ${clip(ref.source, 200)}${ref.year ? ` (${ref.year})` : ""}`,
      value:
        `> « ${clip(texte, 850)} »\n*Provenance : ${PROVENANCE_LABEL[ref.provenance]}${lien}*`.slice(
          0,
          1024,
        ),
    });
  }
  if (v.planches.length > 0) {
    embed.addFields({
      name: "📚 Planches de databooks associées",
      value: v.planches
        .slice(0, 3)
        .map(
          (p) =>
            `• [${linkLabel(p.databookTitre, 60)}, planche ${p.numero}](${siteLink(p.href)})${p.verifiee ? " ✓" : ""}`,
        )
        .join("\n")
        .slice(0, 1024),
    });
    const image = wikiAssetUrl(v.planches[0]!.image);
    if (image) embed.setThumbnail(image);
  }
  if (v.fiches.length > 0) {
    embed.addFields({
      name: "🗂️ Fiches du wiki liées",
      value: v.fiches
        .slice(0, 4)
        .map(
          (f) =>
            `• [${linkLabel(f.titre, 60)}](${siteLink(f.href)})${f.nameJa ? ` (${f.nameJa})` : ""} — ${clip(f.extrait, 90)}`,
        )
        .join("\n")
        .slice(0, 1024),
    });
    // The entity's own picture, when the planches gave no thumbnail.
    const portrait = v.fiches.find((f) => f.image)?.image ?? null;
    const image = portrait ? wikiAssetUrl(portrait) : null;
    if (image && !embed.data.thumbnail) embed.setThumbnail(image);
    if (image && v.planches.length === 0) embed.setImage(image);
  }
  if ((v.suggestions?.length ?? 0) > 0) {
    embed.addFields({
      name: troll ? "⚖️ Sujets tranchés qui existent, eux" : "🔎 Sujets tranchés proches",
      value: v.suggestions
        .slice(0, 4)
        .map((s) => `• [${linkLabel(s.titre, 70)}](${siteLink(s.href)})`)
        .join("\n")
        .slice(0, 1024),
    });
  }
  if (r.sources.length > 0 && !inconnu) {
    embed.addFields({
      name: "🏛️ Sources doctrinales",
      value: clip(r.sources.join(" · "), 1024),
    });
  }
  const origine = troll
    ? "Hors des sources : rien n'est classé"
    : r.origine.startsWith("entry:")
      ? "Sujet tranché par la doctrine"
      : r.origine.startsWith("heuristic:")
        ? "Application de la règle générale"
        : "Hors doctrine : aucune extrapolation";
  embed.setFooter(
    wikiFooter(
      `${origine}${r.matchedKeywords.length ? ` · Termes : ${r.matchedKeywords.slice(0, 5).join(", ")}` : ""}`,
    ),
  );
  return embed;
}

function boutons(question: string) {
  return linkRow([
    {
      label: "Verdict & Preuves",
      emoji: "📜",
      url: `/wiki/canon${question ? `?q=${encodeURIComponent(question.slice(0, 300))}` : ""}`,
    },
    { label: "La Doctrine des 5 Rangs", emoji: "⚖️", url: "/wiki/canon" },
    { label: "Databooks & Scans", emoji: "📚", url: "/wiki/databooks" },
  ]);
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly, FeatureEnabled("features.wiki", "Le wiki"))
@SlashGroup({
  name: "canon",
  description: "Arbitre de canonicité Dragon Ball : verdict sourcé, doctrine, citations",
})
@SlashGroup("canon")
@injectable()
export class CanonCommands {
  constructor(
    @inject(CanonService) private canon: CanonService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  private async completerSujet(interaction: AutocompleteInteraction): Promise<void> {
    await respondAutocomplete(interaction, async () => {
      const sujets = await this.canon.sujets(interaction.options.getFocused());
      // Un titre au-delà de 100 signes ne peut pas servir de valeur : on le
      // tronque, `verifier` le traite comme une question libre.
      return sujets.map((s) => ({
        name: `${EMOJI_RANG[s.tier]} ${s.title}`,
        value: clip(s.title, 100),
      }));
    });
  }

  @Slash({
    name: "verifier",
    description: "Est-ce canon ? Verdict sourcé (rang, Toriyama, databooks, wiki)",
  })
  async verifier(
    @SlashOption({
      name: "affirmation",
      description: "L'affirmation ou la question (ex. Broly est-il canon ?, GT compte-t-il ?)",
      type: ApplicationCommandOptionType.String,
      required: true,
      minLength: 2,
      maxLength: 400,
      autocomplete: true,
    })
    affirmation: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await this.completerSujet(interaction);
      return;
    }
    const cmd = interaction as CommandInteraction;
    await cmd.deferReply();
    const q = affirmation.trim();
    const v = await this.canon.verifier(q);
    if (!v) {
      await cmd.editReply({
        content: "L'arbitre de canonicité est momentanément injoignable. Réessaie dans un instant.",
      });
      return;
    }
    await cmd.editReply({ embeds: [embedVerdict(v)], components: [boutons(q)] });
  }

  @Slash({
    name: "doctrine",
    description: "Les cinq rangs de canonicité et les règles qui les gouvernent",
  })
  async doctrine(interaction: CommandInteraction) {
    await interaction.deferReply();
    const d = await this.canon.doctrineActuelle();
    if (!d) {
      await interaction.editReply({ content: "La doctrine est momentanément injoignable." });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(SHENRON_THEME.gold)
      .setAuthor(wikiAuthor("DOCTRINE OFFICIELLE DE CANONICITÉ"))
      .setTitle("⚖️ Qu'est-ce qui compte dans Dragon Ball ? · 正史の基準")
      .setURL(`${SITE_URL}/wiki/canon`)
      .setDescription(
        [
          `*La doctrine DragonBallFR établit cinq rangs hiérarchisés pour distinguer le canon absolu d'Akira Toriyama des dérivés.*`,
          "",
          `${SHENRON_SEPARATORS.solid}`,
          clip(d.intro || "Cinq rangs, par autorité décroissante.", 1500),
          `${SHENRON_SEPARATORS.solid}`,
        ].join("\n"),
      );
    for (const t of d.tiers) {
      embed.addFields({
        name: `${EMOJI_RANG[t.id]} ${t.label}`,
        value:
          `${clip(t.definition, 600)}\n*Exemples : ${clip(t.inclut.slice(0, 6).join(" · "), 380)}*`.slice(
            0,
            1024,
          ),
      });
    }
    if (d.doctrine.length > 0) {
      embed.addFields({
        name: "📜 Principes fondamentaux",
        value: d.doctrine
          .slice(0, 6)
          .map((r) => `• ${clip(r, 160)}`)
          .join("\n")
          .slice(0, 1024),
      });
    }
    embed.setFooter(
      wikiFooter(
        `${d.entries.length} sujets tranchés · ${d.stats.references} preuves archéologiques`,
      ),
    );
    await interaction.editReply({ embeds: [embed], components: [boutons("")] });
  }

  @Slash({
    name: "sujets",
    description: "Les sujets déjà tranchés par la doctrine (Broly, GT, Super Saiyan 5…)",
  })
  async sujets(
    @SlashChoice({ name: "🟢 Canon absolu", value: "CANON_ABSOLU" })
    @SlashChoice({ name: "🟩 Canon supervisé", value: "CANON_SUPERVISE" })
    @SlashChoice({ name: "🟡 Extension officielle", value: "EXTENSION_OFFICIELLE" })
    @SlashChoice({ name: "🟠 Dérivé non canon", value: "NON_CANON_DERIVE" })
    @SlashChoice({ name: "🔴 Apocryphe / fanon", value: "APOCRYPHE_FANON" })
    @SlashOption({
      name: "rang",
      description: "Ne montrer qu'un rang",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    rang: CanonTier | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();
    const d = await this.canon.doctrineActuelle();
    if (!d) {
      await interaction.editReply({ content: "La doctrine est momentanément injoignable." });
      return;
    }
    const entrees = rang ? d.entries.filter((e) => e.tier === rang) : d.entries;
    if (entrees.length === 0) {
      await interaction.editReply({ content: "Aucun sujet tranché pour ce rang." });
      return;
    }
    const parPage = 6;
    const pages = [];
    for (let i = 0; i < entrees.length; i += parPage) {
      const lot = entrees.slice(i, i + parPage);
      const embed = new EmbedBuilder()
        .setColor(rang ? COULEURS_RANG[rang] : SHENRON_THEME.gold)
        .setAuthor(wikiAuthor("ARBITRAGES DOCTRINAUX"))
        .setTitle(
          `⚖️ Sujets Tranchés${rang ? ` · ${d.tiers.find((t) => t.id === rang)?.court ?? rang}` : ""}`,
        )
        .setURL(`${SITE_URL}/wiki/canon`)
        .setDescription(
          [
            `*Index des affirmations analysées et fixées selon la doctrine.*`,
            "",
            `${SHENRON_SEPARATORS.solid}`,
            ...lot.map(
              (e) =>
                `${EMOJI_RANG[e.tier]} **[${linkLabel(e.title, 80)}](${SITE_URL}/wiki/canon?q=${encodeURIComponent(e.title)})**\n> \`${renderProgressBar(e.score, 100, 8)}\` (${e.score}/100)\n> *${clip(e.verdict, 200)}*`,
            ),
            `${SHENRON_SEPARATORS.solid}`,
          ]
            .join("\n\n")
            .slice(0, 4096),
        )
        .setFooter({
          text: `${entrees.length} sujets répertoriés · /canon verifier pour tester une affirmation`,
        });
      pages.push({ embeds: [embed.toJSON()], components: [boutons("")] });
    }
    await sendPages(interaction, pages);
  }

  @Slash({
    name: "citations",
    description: "Chercher dans les preuves : déclarations de Toriyama et planches de databooks",
  })
  async citations(
    @SlashOption({
      name: "terme",
      description: "Nom ou mot à chercher (ex. Broly, Kaiōken, Bardock)",
      type: ApplicationCommandOptionType.String,
      required: true,
      minLength: 2,
      maxLength: 100,
    })
    terme: string,
    @SlashChoice({ name: "Déclarations d'auteur (interviews, préfaces)", value: "aphrody" })
    @SlashChoice({ name: "Planches de databooks traduites", value: "databooks" })
    @SlashOption({
      name: "provenance",
      description: "Restreindre à un type de preuve",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    provenance: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();
    const page = await this.canon.citations(terme, provenance, 12);
    if (!page) {
      await interaction.editReply({ content: "Le corpus est momentanément injoignable." });
      return;
    }
    if (page.total === 0) {
      await interaction.editReply({ content: `Aucune preuve ne mentionne « ${terme} ».` });
      return;
    }
    const pages = page.items.map((ref, i) => {
      const texte = ref.textFr ?? ref.text;
      const isDatabook = ref.provenance === "databooks";
      const embed = new EmbedBuilder()
        .setColor(isDatabook ? SHENRON_THEME.gold : SHENRON_THEME.kiGreen)
        .setAuthor({
          name: `${PROVENANCE_LABEL[ref.provenance].toUpperCase()} · Preuve ${i + 1}/${page.items.length} (sur ${page.total})`,
          iconURL: `${SITE_URL}/favicon.ico`,
        })
        .setTitle(`📜 ${clip(ref.subject, 240)}`)
        .setDescription(
          [
            `${SHENRON_SEPARATORS.solid}`,
            `> « ${texte.slice(0, 3600)} »`,
            `${SHENRON_SEPARATORS.solid}`,
          ].join("\n"),
        )
        .addFields({
          name: "🏛️ Source documentaire",
          value: `**${ref.source}**${ref.year ? ` (${ref.year})` : ""}`,
          inline: true,
        });

      if (ref.textFr && ref.lang !== "fr" && ref.text) {
        embed.addFields({
          name: `🇯🇵 Texte original (${ref.lang.toUpperCase()})`,
          value: `> « ${clip(ref.text, 800)} »`,
          inline: false,
        });
      }
      if (ref.href) embed.setURL(siteLink(ref.href));
      embed.setFooter(wikiFooter(`Recherche : « ${clip(terme, 60)} »`));
      return { embeds: [embed.toJSON()], components: [boutons(terme)] };
    });
    await sendPages(interaction, pages);
  }

  @Slash({
    name: "jour",
    description: "(admin) Publier le canon du jour maintenant, ou voir l'état du cron",
  })
  @Guard(AdminOnly)
  async jour(
    @SlashChoice({ name: "Publier maintenant", value: "publier" })
    @SlashChoice({ name: "État", value: "etat" })
    @SlashOption({
      name: "action",
      description: "Que faire",
      type: ApplicationCommandOptionType.String,
      required: false,
    })
    action: string | undefined,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (action === "publier") {
      const r = await this.canon.runOnce();
      const messages: Record<string, string> = {
        no_channel: "Aucun salon réglé : `/config set canon.channel <salon>`.",
        fetch_failed: "Le site est injoignable, rien publié.",
        no_entry: "La doctrine n'a aucun sujet tranché.",
        error: "L'envoi a échoué (voir les logs).",
      };
      await interaction.editReply({
        content: r.ok
          ? `Canon du jour publié : **${r.entry}**.`
          : (messages[r.reason ?? "error"] ?? "Échec."),
      });
      return;
    }
    const [actif, salon, heure, jour, index] = await Promise.all([
      this.settings.getBool("canon.daily_enabled", false),
      this.settings.getSnowflake("canon.channel"),
      this.settings.getInt("canon.daily_hour", 18),
      this.settings.getString("canon.last_posted_day", "—"),
      this.settings.getInt("canon.rotation_index", 0),
    ]);
    await interaction.editReply({
      content: [
        `**Canon du jour** · ${actif ? "✅ actif" : "⛔ désactivé"} (\`canon.daily_enabled\`)`,
        `Salon : ${salon ? `<#${salon}>` : "aucun"} (\`canon.channel\`)`,
        `Heure UTC : ${heure}h (\`canon.daily_hour\`)`,
        `Dernière publication : ${jour || "—"} · prochain sujet : index ${index}`,
      ].join("\n"),
    });
  }
}
