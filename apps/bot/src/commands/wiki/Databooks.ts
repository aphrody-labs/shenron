import { injectable, inject } from "tsyringe";
import { Bot, Discord, Guard, Slash, SlashGroup, SlashOption } from "discordx";
import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
  type AutocompleteInteraction,
  type CommandInteraction,
} from "discord.js";
import { GuildOnly } from "~/guards/GuildOnly";
import { CommandsChannelOnly } from "~/guards/CommandsChannelOnly";
import { FeatureEnabled } from "~/guards/FeatureEnabled";
import { DatabooksService, type Databook, type PlateHit } from "~/services/DatabooksService";
import { SHENRON_THEME, SHENRON_SEPARATORS, renderProgressBar } from "~/lib/embeds";
import {
  SITE_URL,
  clip,
  linkLabel,
  linkRow,
  respondAutocomplete,
  sendPages,
  wikiAssetUrl,
  wikiAuthor,
  wikiFooter,
  type WikiPage,
} from "~/lib/wiki-embeds";

/**
 * `/databooks` — guides officiels, daizenshuu, artbooks et interviews Dragon Ball.
 */

/** Couleur d'embed par famille d'ouvrage, pour distinguer d'un coup d'œil. */
const COULEURS: Record<string, number> = {
  Databook: SHENRON_THEME.gold,
  "Art Book": SHENRON_THEME.beerusPurple,
  "Saikyō Jump": SHENRON_THEME.saiyanBlue,
  Interview: SHENRON_THEME.kiGreen,
};

const COULEUR_DEFAUT = SHENRON_THEME.gold;

function databookButtons(d?: Databook) {
  return linkRow([
    {
      label: "Consulter sur DragonBallFR",
      emoji: "🌐",
      url: d ? `/wiki/databooks/${d.id}` : "/wiki/databooks",
    },
    { label: "Arbitre de Canonicité", emoji: "📜", url: "/wiki/canon" },
  ]);
}

/** La recherche nomme le champ `categorie`, l'API de fiche `category` : on prend la valeur. */
function couleur(categorie: string | null): number {
  return COULEURS[categorie ?? ""] ?? COULEUR_DEFAUT;
}

/** Les dates du wiki sont en secondes (cf. normalisation de l'API databooks). */
function annee(published: number | null): string {
  if (!published) return "—";
  const d = new Date(published * 1000);
  return Number.isNaN(d.getTime()) ? "—" : String(d.getUTCFullYear());
}

/**
 * Tronque sans couper un mot en deux, et signale la coupe.
 *
 * Discord plafonne une description d'embed à 4 096 caractères ; une planche peut
 * en faire 8 171. On coupe donc, mais en le disant — un lecteur qui ne voit pas
 * la troncature croit avoir lu la planche entière.
 */
function tronquer(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const espace = coupe.lastIndexOf("\n");
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}\n\n*…texte tronqué*`;
}

@Discord()
@Bot("shenron")
@Guard(GuildOnly, CommandsChannelOnly, FeatureEnabled("features.wiki", "Le wiki"))
@SlashGroup({
  name: "databooks",
  description: "Guides officiels, daizenshuu, artbooks et interviews Dragon Ball",
})
@SlashGroup("databooks")
@injectable()
export class DatabooksCommands {
  constructor(@inject(DatabooksService) private api: DatabooksService) {}

  /** Réponse d'autocomplete commune : titre + année, valeur = id. */
  private async completerOuvrage(interaction: AutocompleteInteraction): Promise<void> {
    // Catalogue froid : la réponse part vide dans le délai, le chargement
    // continue et sert la frappe suivante.
    await respondAutocomplete(interaction, async () => {
      const fiches = await this.api.searchTitles(interaction.options.getFocused(), 25);
      return fiches.map((d) => ({
        name: `${clip(d.title, 85)} (${annee(d.published_at)})`,
        value: String(d.id),
      }));
    });
  }

  private ficheEmbed(d: Databook): EmbedBuilder {
    const transcrites = d.pages.filter((p) => (p.text ?? "").trim().length > 0).length;
    const pbar = renderProgressBar(transcrites, d.pages.length, 10);

    const embed = new EmbedBuilder()
      .setAuthor(
        wikiAuthor(
          d.title_ja ? `🇯🇵 ${d.title_ja} · ARCHIVES OFFICIELLES` : "ARCHIVES OFFICIELLES & GUIDES",
        ),
      )
      .setTitle(clip(`📚 ${d.title}`, 256))
      .setURL(`${SITE_URL}/wiki/databooks/${d.id}`)
      .setColor(couleur(d.category))
      .setDescription(
        [
          d.description?.trim() ? `> *${tronquer(d.description.trim(), 800)}*` : "",
          "",
          `${SHENRON_SEPARATORS.solid}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .addFields(
        {
          name: "🏷️ Catégorie",
          value: `**${d.category ?? d.kind ?? "Guide officiel"}**`,
          inline: true,
        },
        { name: "📅 Parution", value: `**${annee(d.published_at)}**`, inline: true },
        {
          name: "🖋️ Auteur / Éditeur",
          value: `**${d.author ?? "Bird Studio / Shueisha"}**`,
          inline: true,
        },
      );

    const cover = wikiAssetUrl(d.cover);
    if (cover) embed.setThumbnail(cover);

    if (d.pages.length > 0) {
      embed.addFields({
        name: "📖 Avancement de la Transcription",
        value: `> \`${pbar}\`\n> **${transcrites}** / **${d.pages.length}** planches transcrites`,
        inline: false,
      });
    }
    embed.setFooter(
      wikiFooter(
        d.pages.length > 0
          ? `/databooks planche ouvrage:${clip(d.title, 35)}`
          : "Bibliothèque des databooks",
      ),
    );
    return embed;
  }

  @Slash({ name: "fiche", description: "Afficher un ouvrage (couverture, parution, avancement)" })
  async fiche(
    @SlashOption({
      name: "ouvrage",
      description: "Titre de l'ouvrage",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    requete: string,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await this.completerOuvrage(interaction);
      return;
    }
    const cmd = interaction as CommandInteraction;
    await cmd.deferReply();

    const fiche = await this.resoudre(requete);
    if (!fiche) {
      await cmd.editReply({
        content: `Aucun ouvrage ne correspond à « ${requete} ». Utilise l'autocomplete de \`/databooks fiche\`.`,
      });
      return;
    }
    await cmd.editReply({
      embeds: [this.ficheEmbed(fiche)],
      components: [databookButtons(fiche)],
    });
  }

  @Slash({
    name: "recherche",
    description: "Chercher une phrase dans le texte transcrit des planches (japonais compris)",
  })
  async recherche(
    @SlashOption({
      name: "terme",
      description: "Mot ou phrase à chercher dans les planches",
      type: ApplicationCommandOptionType.String,
      required: true,
      minLength: 2,
      maxLength: 100,
    })
    terme: string,
    interaction: CommandInteraction,
  ) {
    await interaction.deferReply();

    const res = await this.api.searchPages(terme, 40);
    if (!res) {
      await interaction.editReply({
        content: "La recherche est momentanément indisponible. Réessaie dans un instant.",
      });
      return;
    }
    if (res.total === 0) {
      await interaction.editReply({
        content: `Aucune planche ne contient « ${terme} ».`,
      });
      return;
    }

    // Une planche par page de pagination : le texte est long, et l'intérêt est
    // de LIRE le passage trouvé, pas d'en survoler dix titres.
    const pages: WikiPage[] = res.items.map((p, i) => ({
      embeds: [this.resultatEmbed(p, terme, i, res.items.length, res).toJSON()],
      components: [
        linkRow([
          {
            label: `Planche ${p.number} sur le site`,
            emoji: "📖",
            url: `/wiki/databooks/${p.databookId}`,
          },
        ]),
      ],
    }));
    await sendPages(interaction, pages);
  }

  private resultatEmbed(
    p: PlateHit,
    terme: string,
    index: number,
    affichees: number,
    res: { total: number; databookCount: number },
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setAuthor(wikiAuthor("ARCHIVES JAPONAISES TRANSCRITES · RECHERCHE"))
      .setTitle(clip(`📖 ${p.title} — Planche ${p.number}`, 256))
      .setURL(`${SITE_URL}/wiki/databooks/${p.databookId}`)
      .setColor(couleur(p.category))
      .setDescription(
        [
          `${SHENRON_SEPARATORS.solid}`,
          `> ${tronquer(this.centrerSur(p.text, terme), 3700)}`,
          `${SHENRON_SEPARATORS.solid}`,
        ].join("\n"),
      )
      .setFooter(
        wikiFooter(
          `${index + 1}/${affichees} affichées · ${res.total} planche${res.total > 1 ? "s" : ""} dans ${res.databookCount} ouvrage${res.databookCount > 1 ? "s" : ""}`,
        ),
      );
    const image = wikiAssetUrl(p.image);
    if (image) embed.setThumbnail(image);
    return embed;
  }

  /**
   * Recadre un texte long autour de la première occurrence du terme.
   *
   * Sans ça, une planche de 8 000 signes serait tronquée par le début et
   * n'afficherait pas le passage cherché — le résultat serait juste faux du
   * point de vue de celui qui a lancé la recherche.
   */
  private centrerSur(texte: string, terme: string): string {
    const pos = texte.toLocaleLowerCase().indexOf(terme.trim().toLocaleLowerCase());
    if (pos < 0 || pos < 600) return texte;
    return `…${texte.slice(Math.max(0, pos - 600))}`;
  }

  @Slash({ name: "planche", description: "Lire la transcription d'une planche précise" })
  async planche(
    @SlashOption({
      name: "ouvrage",
      description: "Titre de l'ouvrage",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    requete: string,
    @SlashOption({
      name: "numero",
      description: "Numéro de la planche",
      type: ApplicationCommandOptionType.Integer,
      required: true,
      minValue: 1,
    })
    numero: number,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await this.completerOuvrage(interaction);
      return;
    }
    const cmd = interaction as CommandInteraction;
    await cmd.deferReply();

    const fiche = await this.resoudre(requete);
    if (!fiche) {
      await cmd.editReply({ content: `Aucun ouvrage ne correspond à « ${requete} ».` });
      return;
    }
    const planche = fiche.pages.find((p) => p.number === numero);
    if (!planche) {
      const dispo = fiche.pages.length;
      await cmd.editReply({
        content: dispo
          ? `« ${fiche.title} » n'a pas de planche n°${numero} (${dispo} planches référencées).`
          : `« ${fiche.title} » n'a encore aucune planche.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setAuthor(wikiAuthor(`ARCHIVES & MANUSCRITS · ${fiche.title}`))
      .setTitle(`📖 Planche n°${planche.number}`)
      .setURL(`${SITE_URL}/wiki/databooks/${fiche.id}`)
      .setColor(couleur(fiche.category))
      .setDescription(
        [
          `${SHENRON_SEPARATORS.solid}`,
          planche.text?.trim()
            ? `> ${tronquer(planche.text.trim(), 3800)}`
            : "*Cette planche n'est pas encore transcrite.*",
          `${SHENRON_SEPARATORS.solid}`,
        ].join("\n"),
      )
      .setFooter(
        wikiFooter(`Planche ${planche.number}/${fiche.pages.length} · Archives Universelles`),
      );
    const image = wikiAssetUrl(planche.image);
    if (image) embed.setImage(image);
    await cmd.editReply({ embeds: [embed], components: [databookButtons(fiche)] });
  }

  @Slash({ name: "catalogue", description: "Parcourir les ouvrages référencés" })
  async catalogue(
    @SlashOption({
      name: "categorie",
      description: "Filtrer par catégorie",
      type: ApplicationCommandOptionType.String,
      required: false,
      autocomplete: true,
    })
    categorie: string | undefined,
    interaction: CommandInteraction | AutocompleteInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      await respondAutocomplete(interaction, async () => {
        const tous = await this.api.listAll();
        const focus = interaction.options.getFocused().toLocaleLowerCase();
        return [...new Set(tous.map((d) => d.category).filter((c): c is string => !!c))]
          .toSorted()
          .filter((c) => c.toLocaleLowerCase().includes(focus))
          .map((c) => ({ name: c, value: c }));
      });
      return;
    }
    const cmd = interaction as CommandInteraction;
    await cmd.deferReply({ flags: MessageFlags.Ephemeral });

    const tous = await this.api.listAll();
    if (tous.length === 0) {
      await cmd.editReply({ content: "Le catalogue est momentanément indisponible." });
      return;
    }
    const fiches = categorie ? tous.filter((d) => d.category === categorie) : tous;
    if (fiches.length === 0) {
      await cmd.editReply({ content: `Aucun ouvrage dans la catégorie « ${categorie} ».` });
      return;
    }

    // Du plus récent au plus ancien : c'est l'ordre du site, et celui qu'on a
    // en tête quand on cherche « le dernier guide sorti ».
    const tries = fiches.slice().toSorted((a, b) => (b.published_at ?? 0) - (a.published_at ?? 0));
    const PAR_PAGE = 12;
    const pages: WikiPage[] = [];
    for (let i = 0; i < tries.length; i += PAR_PAGE) {
      const lot = tries.slice(i, i + PAR_PAGE);
      pages.push({
        embeds: [
          new EmbedBuilder()
            .setAuthor(wikiAuthor("BIBLIOTHÈQUE UNIVERSELLE · DATABOOKS"))
            .setTitle(
              categorie ? `📚 Databooks — ${categorie}` : "📚 Catalogue des Guides & Interviews",
            )
            .setColor(COULEUR_DEFAUT)
            .setDescription(
              [
                `*Ouvrages officiels et archives de production référencés.*`,
                "",
                `${SHENRON_SEPARATORS.solid}`,
                ...lot.map((d) => {
                  const n = d.pages.length;
                  return `• [**${linkLabel(d.title, 90)}**](${SITE_URL}/wiki/databooks/${d.id}) — **${annee(d.published_at)}**${n ? ` · \`${n} planches\`` : ""}`;
                }),
                `${SHENRON_SEPARATORS.solid}`,
              ].join("\n"),
            )
            .setFooter(
              wikiFooter(
                `${i + 1}–${Math.min(i + PAR_PAGE, tries.length)} sur ${tries.length} ouvrages`,
              ),
            )
            .toJSON(),
        ],
      });
    }
    await sendPages(cmd, pages);
  }

  /** Résout un choix d'autocomplete (id) ou une saisie libre (titre). */
  private async resoudre(requete: string): Promise<Databook | null> {
    const id = Number(requete);
    if (Number.isSafeInteger(id) && id > 0) {
      const direct = await this.api.get1(id);
      if (direct) return direct;
    }
    const [premier] = await this.api.searchTitles(requete, 1);
    return premier ? await this.api.get1(premier.id) : null;
  }
}
