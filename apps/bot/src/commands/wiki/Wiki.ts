import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  type CommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { FeatureEnabled } from "~/guards/FeatureEnabled";
import {
  WikiService,
  type CharacterWithRelations,
  type DBTransformation,
} from "~/services/WikiService";
import { SHENRON_THEME, SHENRON_SEPARATORS } from "~/lib/embeds";
import {
  SITE_URL,
  clip,
  cut,
  fitList,
  linkLabel,
  linkRow,
  respondAutocomplete,
  sendPages,
  wikiAuthor,
  wikiFooter,
  type WikiPage,
} from "~/lib/wiki-embeds";

const RACE_COLORS: Record<string, number> = {
  Saiyan: SHENRON_THEME.orange,
  Namekian: SHENRON_THEME.kiGreen,
  Human: SHENRON_THEME.saiyanBlue,
  Android: 0x94a3b8,
  "Frieza Race": 0xa855f7,
  "Jiren Race": SHENRON_THEME.majinRed,
  God: SHENRON_THEME.gold,
  Majin: 0xec4899,
  Angel: 0xe2e8f0,
  Evil: 0x991b1b,
  "Nucleico benigno": 0x14b8a6,
  Nucleico: 0x6366f1,
  Unknown: 0x64748b,
};

/** Ids given by the autocomplete: canonical base-10 digits only (`"17 Android"` is a name). */
function parseId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) ? n : null;
}

function raceColor(race: string | null | undefined): number {
  return RACE_COLORS[race ?? ""] ?? SHENRON_THEME.gold;
}

function wikiButtons(page?: { label: string; url: string }) {
  return linkRow([
    page ? { ...page, emoji: "🌐" } : { label: "Explorer le Wiki", url: "/wiki", emoji: "🌐" },
    { label: "Arbitre de Canonicité", url: "/wiki/canon", emoji: "📜" },
    { label: "Guides & Databooks", url: "/wiki/databooks", emoji: "📚" },
  ]);
}

/**
 * Si `image` est un path local, retourne un Attachment + URL attachment://
 * Sinon retourne juste l'URL (HTTP).
 */
function asEmbedImage(
  imagePath: string | null | undefined,
): { url: string; attachment: AttachmentBuilder | null } | null {
  if (!imagePath) return null;
  if (/^https?:\/\//.test(imagePath)) return { url: imagePath, attachment: null };
  if (!existsSync(imagePath)) return null;
  const filename = basename(imagePath).replace(/[^a-zA-Z0-9._-]/g, "_");
  const att = new AttachmentBuilder(imagePath, { name: filename });
  return { url: `attachment://${filename}`, attachment: att };
}

function characterUrl(c: { id: number }): string {
  return `${SITE_URL}/wiki/characters/${c.id}`;
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly, FeatureEnabled("features.wiki", "Le wiki"))
@injectable()
export class WikiCommands {
  constructor(@inject(WikiService) private api: WikiService) {}

  private charEmbed(c: CharacterWithRelations): {
    embed: EmbedBuilder;
    attachment: AttachmentBuilder | null;
  } {
    const img = asEmbedImage(c.portraitXv2 ?? c.image);
    const description = c.description?.trim();
    const embed = new EmbedBuilder()
      .setAuthor(wikiAuthor("ARCHIVES UNIVERSELLES · 戦士名鑑"))
      .setTitle(clip(`⚡ ${c.name}${c.nameJa ? ` · ${c.nameJa}` : ""}`, 256))
      .setURL(characterUrl(c))
      .setColor(raceColor(c.race))
      .setDescription(
        [description ? `> *${clip(description, 800)}*` : "", "", SHENRON_SEPARATORS.solid]
          .filter(Boolean)
          .join("\n"),
      )
      .addFields(
        {
          name: "🧬 Race & Origine",
          value: `**${c.race || "—"}**\n*Planète : ${c.originPlanet?.name ?? "Inconnue"}*`,
          inline: true,
        },
        {
          name: "⚔️ Affiliation",
          value: `**${c.affiliation || "Neutre / Inconnue"}**`,
          inline: true,
        },
        { name: "⚧ Genre", value: `**${c.gender || "—"}**`, inline: true },
        { name: "⚡ Ki Initial", value: `\`${c.ki || "Non mesuré"}\``, inline: true },
        { name: "💥 Ki Maximal", value: `\`${c.maxKi || "Incalculable"}\``, inline: true },
        { name: "🌐 Registre", value: `ID #**${c.id}**`, inline: true },
      )
      .setFooter(
        wikiFooter(
          c.transformations.length
            ? `Fiche 1/${c.transformations.length + 1} · transformations en pages suivantes`
            : "Fiche universelle",
        ),
      );
    if (img) embed.setThumbnail(img.url);

    if (c.transformations.length) {
      embed.addFields({
        name: `🌀 Transformations & Éveils (${c.transformations.length})`,
        value: fitList(
          c.transformations.map((t) => `• **${t.name}** — Ki : \`${t.ki || "—"}\``),
          "\n",
          1024,
        ),
        inline: false,
      });
    }
    if (c.techniques.length) {
      embed.addFields({
        name: `💫 Techniques (${c.techniques.length})`,
        value: fitList(
          c.techniques.map((t) => t.technique.name),
          " · ",
          1024,
        ),
        inline: false,
      });
    }
    return { embed, attachment: img?.attachment ?? null };
  }

  private transformationEmbed(
    c: CharacterWithRelations,
    t: DBTransformation,
    idx: number,
  ): { embed: EmbedBuilder; attachment: AttachmentBuilder | null } {
    const charImg = asEmbedImage(c.portraitXv2 ?? c.image);
    const transfoImg = asEmbedImage(t.image);
    const embed = new EmbedBuilder()
      .setAuthor(
        wikiAuthor(
          `Forme Martiale · ${c.name}`,
          charImg && !charImg.url.startsWith("attachment://") ? charImg.url : undefined,
        ),
      )
      .setTitle(clip(`🌀 ${t.name}`, 256))
      .setURL(characterUrl(c))
      .setColor(raceColor(c.race))
      .setDescription(
        [
          SHENRON_SEPARATORS.solid,
          `> **Puissance déployée (Ki) :** \`${t.ki || "Incalculable"}\``,
          SHENRON_SEPARATORS.solid,
        ].join("\n"),
      )
      .setFooter(wikiFooter(`Éveil martial ${idx + 1}/${c.transformations.length} · ${c.name}`));
    if (transfoImg) embed.setImage(transfoImg.url);
    return { embed, attachment: transfoImg?.attachment ?? null };
  }

  @Slash({
    name: "wiki",
    description: "Consulter le wiki Dragon Ball (personnages et transformations)",
  })
  async wiki(
    @SlashOption({
      name: "personnage",
      description: "Nom du personnage (autocomplete)",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    query: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await respondAutocomplete(interaction, async () => {
        const matches = await this.api.search(interaction.options.getFocused(), 25);
        return matches.map((c) => ({
          name: `${c.name}${c.race ? ` (${c.race})` : ""}`,
          value: String(c.id),
        }));
      });
      return;
    }

    const cmd = interaction as CommandInteraction;
    await cmd.deferReply();

    const id = parseId(query);
    let char: CharacterWithRelations | null = id === null ? null : await this.api.getCharacter(id);
    if (!char) {
      const [best] = await this.api.search(query, 1);
      if (best) char = await this.api.getCharacter(best.id);
    }
    if (!char) {
      await cmd.editReply({
        content: `❌ Personnage « ${clip(query, 80)} » introuvable. Lance \`/wiki\` avec l'autocomplete.`,
      });
      return;
    }

    const buttons = wikiButtons({ label: "Fiche complète", url: characterUrl(char) });
    const pages: WikiPage[] = [];
    const main = this.charEmbed(char);
    pages.push({
      embeds: [main.embed.toJSON()],
      files: main.attachment ? [main.attachment] : [],
      components: [buttons],
    });
    char.transformations.forEach((t, i) => {
      const e = this.transformationEmbed(char, t, i);
      pages.push({
        embeds: [e.embed.toJSON()],
        files: e.attachment ? [e.attachment] : [],
        components: [buttons],
      });
    });
    await sendPages(cmd, pages, 120_000);
  }

  @Slash({ name: "races", description: "Liste les personnages par race" })
  async races(
    @SlashOption({
      name: "race",
      description: "Race (ex: Saiyan, Namekian)",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    race: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await respondAutocomplete(interaction, async () => {
        const focus = interaction.options.getFocused().toLowerCase();
        const races = await this.api.listRaces();
        return races
          .filter((r) => r.name.toLowerCase().includes(focus))
          .map((r) => ({ name: r.name, value: r.name }));
      });
      return;
    }

    const cmd = interaction as CommandInteraction;
    await cmd.deferReply({ flags: MessageFlags.Ephemeral });
    // Saisie libre : « saiyan » doit trouver « Saiyan ».
    let name = race.trim();
    let filtered = await this.api.listByRace(name);
    if (filtered.length === 0) {
      const known = (await this.api.listRaces()).find(
        (r) => r.name.toLowerCase() === name.toLowerCase() || r.slug === name.toLowerCase(),
      );
      if (known) {
        name = known.name;
        filtered = await this.api.listByRace(known.name);
      }
    }
    if (filtered.length === 0) {
      await cmd.editReply({
        content: `Aucun personnage trouvé pour la race « ${clip(race, 80)} ».`,
      });
      return;
    }
    const sorted = filtered.toSorted((a, b) => a.name.localeCompare(b.name, "fr"));
    const PER_PAGE = 20;
    const pages: WikiPage[] = [];
    for (let i = 0; i < sorted.length; i += PER_PAGE) {
      const lot = sorted.slice(i, i + PER_PAGE);
      const embed = new EmbedBuilder()
        .setAuthor(wikiAuthor("REGISTRE DES ESPÈCES"))
        .setTitle(clip(`🧬 Race : ${name} (${sorted.length} combattants)`, 256))
        .setURL(`${SITE_URL}/wiki/races`)
        .setColor(raceColor(name))
        .setDescription(
          cut(
            [
              `*Personnages répertoriés appartenant au peuple ${name}.*`,
              "",
              SHENRON_SEPARATORS.solid,
              ...lot.map(
                (c) => `• [**${c.name}**](${characterUrl(c)}) — Ki : \`${c.ki ?? "Non mesuré"}\``,
              ),
              SHENRON_SEPARATORS.solid,
            ].join("\n"),
            4000,
          ),
        )
        .setFooter(
          wikiFooter(
            `${i + 1}–${Math.min(i + PER_PAGE, sorted.length)} sur ${sorted.length} · Archives Universelles`,
          ),
        );
      pages.push({ embeds: [embed.toJSON()], components: [wikiButtons()] });
    }
    await sendPages(cmd, pages);
  }

  @Slash({ name: "planete", description: "Fiche d'une planète de l'univers Dragon Ball" })
  async planete(
    @SlashOption({
      name: "planete",
      description: "Nom de la planète",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    query: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await respondAutocomplete(interaction, async () => {
        const focus = interaction.options.getFocused().toLowerCase();
        const all = await this.api.listPlanets();
        return all
          .filter((p) => p.name.toLowerCase().includes(focus))
          .map((p) => ({ name: p.name, value: String(p.id) }));
      });
      return;
    }
    const cmd = interaction as CommandInteraction;
    await cmd.deferReply();
    const id = parseId(query);
    let planet = id === null ? null : await this.api.getPlanet(id);
    if (!planet) {
      // Saisie libre (sans l'autocomplete) : résolution par le nom.
      const q = query.trim().toLowerCase();
      const all = await this.api.listPlanets();
      const match =
        all.find((p) => p.name.toLowerCase() === q) ??
        all.find((p) => p.name.toLowerCase().includes(q));
      if (match) planet = await this.api.getPlanet(match.id);
    }
    if (!planet) {
      await cmd.editReply({ content: `Planète introuvable dans nos cartographies.` });
      return;
    }
    const img = asEmbedImage(planet.image);
    const description = planet.description?.trim();
    const embed = new EmbedBuilder()
      .setAuthor(wikiAuthor("CARTOGRAPHIE GALACTIQUE"))
      .setTitle(clip(`🌍 ${planet.name}${planet.nameJa ? ` · ${planet.nameJa}` : ""}`, 256))
      .setURL(`${SITE_URL}/wiki/locations`)
      .setColor(planet.isDestroyed ? SHENRON_THEME.majinRed : SHENRON_THEME.kiGreen)
      .setDescription(
        [
          `**État cosmique :** ${planet.isDestroyed ? "💥 **Détruite / Disparue**" : "🪐 **Intacte / Existante**"}`,
          "",
          SHENRON_SEPARATORS.solid,
          description ? `> *${clip(description, 1200)}*` : "*Aucune donnée astronomique.*",
          SHENRON_SEPARATORS.solid,
        ].join("\n"),
      )
      .setFooter(wikiFooter("Cartographie de l'Univers"));
    if (img) embed.setImage(img.url);
    if (planet.characters.length) {
      embed.addFields({
        name: `👥 Natifs répertoriés (${planet.characters.length})`,
        value: fitList(
          planet.characters
            .toSorted((a, b) => a.name.localeCompare(b.name, "fr"))
            .map((c) => `[${linkLabel(c.name)}](${characterUrl(c)})`),
          " · ",
          1024,
        ),
      });
    }
    await cmd.editReply({
      embeds: [embed],
      files: img?.attachment ? [img.attachment] : [],
      components: [wikiButtons()],
    });
  }
}
