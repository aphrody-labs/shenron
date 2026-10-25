import { Bot, Discord, SelectMenuComponent } from "discordx";
import { EmbedBuilder, MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import { inject, injectable } from "tsyringe";
import { lireValeurEpisode, PREFIXE_MENU_EPISODES } from "~/lib/episode-menus";
import { logger } from "~/lib/logger";
import { EpisodesService } from "~/services/EpisodesService";

/**
 * Le menu déroulant d'épisodes des fils du forum `🎬・animes-et-films`.
 *
 * Le forum est une VUE de la base (`scripts/forum-anime.ts`) : un fil par saga,
 * saison ou film. Chaque fil porte des menus construits par
 * `lib/episode-menus.ts` ; c'est ici qu'on répond au clic. Parti pris repris de
 * `@aphrody/wonderbot` : le membre choisit son épisode et reçoit sa fiche, au
 * lieu de faire défiler une liste de liens que Discord tronque de toute façon.
 *
 * ── POURQUOI LE GRAND PRÊTRE ───────────────────────────────────────────────
 * Une interaction de composant est livrée à l'application qui a publié le
 * message. Le forum est publié avec `DISCORD_TOKEN_GRAND_PRETRE` : un handler
 * monté sur une autre persona ne se déclencherait JAMAIS — et sans erreur, ce
 * qui est la pire des pannes. Aucun intent n'est requis (les interactions
 * arrivent hors intents), `personas.ts` n'est donc pas touché.
 *
 * ── ÉPHÉMÈRE, TOUJOURS ─────────────────────────────────────────────────────
 * Le fil sert à discuter. Une fiche publique par clic le noierait sous des
 * embeds identiques — exactement ce que le forum de wonderbot évite en
 * modifiant son message d'ouverture au lieu d'en republier un.
 */

const SITE = "https://dragonballfr.com";
const ASSETS = "https://bot.dragonballfr.com";

/** Une description d'embed accepte 4 096 signes ; on garde de la marge. */
const MAX_SYNOPSIS = 1_400;

function urlAsset(chemin: string | null): string | null {
  if (!chemin) return null;
  if (/^https?:\/\//.test(chemin)) return chemin;
  return `${ASSETS}/${chemin.replace(/^\.?\/*/, "")}`;
}

function coupe(texte: string, taille: number): string {
  const propre = texte.replace(/\s+/g, " ").trim();
  return propre.length <= taille ? propre : `${propre.slice(0, taille - 1).trimEnd()}…`;
}

@Discord()
@Bot("shenron")
@injectable()
export class ForumEpisodesComponents {
  constructor(@inject(EpisodesService) private episodes: EpisodesService) {}

  @SelectMenuComponent({ id: new RegExp(`^${PREFIXE_MENU_EPISODES}:`) })
  async choisirEpisode(interaction: StringSelectMenuInteraction) {
    const valeur = interaction.values[0] ?? "";
    const id = lireValeurEpisode(valeur);
    if (id === null) {
      await interaction.reply({
        content: "Ce menu est trop ancien pour être relu — relance-le depuis le fil.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let episode: Awaited<ReturnType<EpisodesService["parId"]>> = null;
    try {
      episode = await this.episodes.parId(id);
    } catch (e) {
      logger.warn({ err: e, id }, "[forum-episodes] lecture de l'épisode en échec");
    }

    if (!episode) {
      await interaction.editReply({
        content:
          "Cet épisode n'est plus dans la base (ou elle est momentanément injoignable). " +
          `La fiche reste lisible sur ${SITE}/wiki/episodes/${id}.`,
      });
      return;
    }

    const titre = episode.titre?.trim() || `Épisode ${episode.numero ?? id}`;
    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle(coupe(`${episode.numero ? `#${episode.numero} · ` : ""}${titre}`, 256))
      .setURL(`${SITE}/wiki/episodes/${episode.id}`);

    if (episode.titreJa) embed.setAuthor({ name: coupe(episode.titreJa, 256) });

    const entete: string[] = [`**${episode.series}**`];
    if (episode.numero !== null) entete.push(`Épisode ${episode.numero}`);
    if (episode.dateDiffusion && episode.dateDiffusion > 0) {
      entete.push(`<t:${Math.trunc(episode.dateDiffusion)}:D>`);
    }

    const corps = [entete.join(" · ")];
    if (episode.synopsis?.trim()) corps.push("", coupe(episode.synopsis, MAX_SYNOPSIS));
    embed.setDescription(corps.join("\n"));

    if (episode.officialWatchUrl) {
      const language = episode.officialLanguages.length
        ? ` (${episode.officialLanguages.map((value) => value.toUpperCase()).join(" · ")})`
        : "";
      embed.addFields({
        name: "Offre officielle",
        value: `[Crunchyroll${language}](${episode.officialWatchUrl})`,
      });
    } else {
      embed.addFields({
        name: "Lecture",
        value: `Consulte la [fiche de l'épisode](${SITE}/wiki/episodes/${episode.id}) pour les offres disponibles.`,
      });
    }

    const image = urlAsset(episode.image);
    if (image) embed.setThumbnail(image);
    embed.addFields({
      name: "Fiche",
      value: `[${SITE.replace(/^https:\/\//, "")}/wiki/episodes/${episode.id}](${SITE}/wiki/episodes/${episode.id})`,
    });

    await interaction.editReply({ embeds: [embed] });
  }
}
