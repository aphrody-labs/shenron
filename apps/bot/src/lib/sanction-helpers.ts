/**
 * Shared building blocks of the sanction commands (warn, mute, kick, ban, jail):
 * target validation, bounded durations, member DM, audit-log reason and the
 * error path of an interaction that may already be deferred.
 */
import { container } from "tsyringe";
import {
  MessageFlags,
  type CommandInteraction,
  type EmbedBuilder,
  type GuildMember,
  type User,
} from "discord.js";
import { MessageTemplateService } from "~/services/MessageTemplateService";
import { brandedEmbed, errorEmbed, type EmbedKind } from "./embeds";
import { canModerate } from "./hierarchy";
import { formatDuration, parseDuration } from "./duration";

export { formatDuration, parseDuration } from "./duration";

/** Placeholder of a sanction without a stated reason. */
export const NO_REASON = "*(non précisé)*";

/** Discord caps the `X-Audit-Log-Reason` header at 512 characters. */
const AUDIT_REASON_MAX = 512;

/** Discord timeout limit (28 days). */
export const MAX_TIMEOUT_MS = 28 * 86_400_000;

/** Reason stored in the Discord audit log: the stated reason, else the moderator. */
export function auditReason(reason: string | undefined, moderator: Pick<User, "username">): string {
  const text = reason?.trim() || `by ${moderator.username}`;
  return text.slice(0, AUDIT_REASON_MAX);
}

/** Inline "DM" field of the staff log: did the member receive the notice? */
export function dmField(delivered: boolean) {
  return { name: "DM", value: delivered ? "✅ envoyé" : "❌ DM fermés", inline: true };
}

/** `<t:…:f>` and `<t:…:R>` timestamps of an end date. */
export function discordTime(date: Date, style: "f" | "R" | "F" | "D" = "f"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export type DurationCheck = { ok: true; ms: number } | { ok: false; reason: string };

/**
 * Parses a sanction duration (`10m`, `1h`, `7d`, `2w`) and bounds it. An empty
 * input is `required` dependent: `{ ok: true, ms: 0 }` means "no duration".
 */
export function parseBoundedDuration(
  input: string | undefined,
  opts: { minMs?: number; maxMs?: number; required?: boolean } = {},
): DurationCheck {
  const { minMs = 1_000, maxMs = Number.POSITIVE_INFINITY, required = false } = opts;
  if (!input?.trim()) {
    return required
      ? { ok: false, reason: "Durée requise : `10m`, `1h`, `1d`, `2w`." }
      : { ok: true, ms: 0 };
  }
  const ms = parseDuration(input);
  if (ms === undefined) {
    return {
      ok: false,
      reason: `\`${input.slice(0, 32)}\` : format attendu \`10m\`, \`1h\`, \`1d\`, \`2w\`.`,
    };
  }
  if (ms < minMs) return { ok: false, reason: `Minimum **${formatDuration(minMs)}**.` };
  if (ms > maxMs) return { ok: false, reason: `Maximum **${formatDuration(maxMs)}**.` };
  return { ok: true, ms };
}

/**
 * Pure part of the target check, before any Discord call: a moderator never
 * sanctions themself or the bot, and a bot account is only refused when the
 * sanction makes no sense for it (warn).
 */
export function sanctionTargetError(opts: {
  actorId: string;
  targetId: string;
  botId: string | undefined;
  targetIsBot?: boolean;
  allowBots?: boolean;
}): string | null {
  if (opts.targetId === opts.actorId) return "Tu ne peux pas te sanctionner toi-même.";
  if (opts.botId && opts.targetId === opts.botId)
    return "Le bot ne peut pas se sanctionner lui-même.";
  if (opts.targetIsBot && opts.allowBots === false) return "Impossible de sanctionner un bot.";
  return null;
}

/**
 * Sends an ephemeral error whatever the interaction state: replied or deferred
 * publicly, the public placeholder is removed and the error follows privately.
 */
export async function failInteraction(
  interaction: CommandInteraction,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) {
      const ephemeral = interaction.ephemeral ?? false;
      if (ephemeral) {
        await interaction.editReply({ embeds: [embed] });
        return;
      }
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch {
    // Interaction expired (10062) or channel gone: nothing left to tell.
  }
}

/** `Error.message` of anything thrown, with the Discord API code when present. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 1_000);
  return "erreur inconnue";
}

/** Discord API error code of a thrown REST error (`10007` unknown member…). */
export function discordErrorCode(err: unknown): number | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : undefined;
}

/**
 * Resolves and checks the target of a sanction: not self, not the bot, staff
 * hierarchy (`canModerate`) when the target is still a member. Replies the
 * error itself and returns `null` when the sanction must not proceed.
 * `requireMember` refuses a user who already left the server (mute, kick, jail).
 */
export async function resolveSanctionTarget(
  interaction: CommandInteraction<"cached">,
  target: User,
  opts: { requireMember: boolean; allowBots?: boolean },
): Promise<{ member: GuildMember | null } | null> {
  const pure = sanctionTargetError({
    actorId: interaction.user.id,
    targetId: target.id,
    botId: interaction.client.user?.id,
    targetIsBot: target.bot,
    allowBots: opts.allowBots,
  });
  if (pure) {
    await failInteraction(interaction, errorEmbed("Cible invalide", pure));
    return null;
  }
  const fetched = await interaction.guild.members.fetch(target.id).catch(() => null);
  const member = fetched?.id === target.id ? fetched : null;
  if (!member) {
    if (opts.requireMember) {
      await failInteraction(
        interaction,
        errorEmbed("Membre introuvable", `<@${target.id}> n'est plus sur le serveur.`),
      );
      return null;
    }
    return { member: null };
  }
  const allowed = await canModerate(interaction.member, member);
  if (!allowed.ok) {
    await failInteraction(interaction, errorEmbed("Hiérarchie staff", allowed.reason ?? ""));
    return null;
  }
  return { member };
}

/**
 * DM le membre sanctionné en best-effort. Silence les erreurs (DM fermés,
 * blocked, bot bloqué…) — la sanction reste appliquée même si la notif échoue.
 * Retourne true si le DM est arrivé.
 */
export async function notifyMember(
  target: User,
  embed: EmbedBuilder,
  vars?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const templates = container.resolve(MessageTemplateService);
    const r = await templates.render("mod_sanction_dm", vars ?? {});
    if (r && !r.enabled) return false;
    if (r && vars && r.rendered !== r.def.defaultTemplate) {
      embed.addFields({
        name: "Note du serveur",
        value: r.rendered.slice(0, 1024),
      });
    }
    await target.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

export type NotifiedSanction = "warn" | "mute" | "kick" | "ban" | "jail";

const DM_COPY: Record<
  NotifiedSanction,
  { title: string; kind: EmbedKind; line: (guild: string, duration?: string) => string }
> = {
  warn: {
    title: "⚠️ Avertissement reçu",
    kind: "warning",
    line: (g) => `Tu as reçu un avertissement sur **${g}**.`,
  },
  mute: {
    title: "🔇 Tu as été mute",
    kind: "warning",
    line: (g, d) => `Tu es mute sur **${g}**${d ? ` pour **${d}**` : ""}.`,
  },
  kick: {
    title: "👢 Tu as été expulsé",
    kind: "warning",
    line: (g) => `Tu as été expulsé de **${g}**.`,
  },
  ban: {
    title: "🔨 Tu as été banni",
    kind: "error",
    line: (g) => `Tu as été banni de **${g}**.`,
  },
  jail: {
    title: "⛓️ Tu as été jailé",
    kind: "error",
    line: (g, d) => `Tu es en jail sur **${g}**${d ? ` pour **${d}**` : ""}.`,
  },
};

/**
 * DM embed of a sanction, one layout for every kind: what happened, the
 * reason, the end date when timed. Pure, so the copy is testable.
 */
export function sanctionDmEmbed(opts: {
  kind: NotifiedSanction;
  guildName: string;
  reason?: string;
  durationMs?: number;
  footer?: string;
}): EmbedBuilder {
  const copy = DM_COPY[opts.kind];
  const duration = opts.durationMs ? formatDuration(opts.durationMs) : undefined;
  const lines = [
    copy.line(opts.guildName, duration),
    "",
    `**Motif :** ${opts.reason ?? NO_REASON}`,
  ];
  if (opts.durationMs) {
    lines.push(`**Fin :** ${discordTime(new Date(Date.now() + opts.durationMs))}`);
  }
  return brandedEmbed({
    title: copy.title,
    description: lines.join("\n"),
    kind: copy.kind,
    footer: opts.footer,
  });
}

/** Builds and sends the sanction DM; `true` when the member received it. */
export async function notifySanction(opts: {
  target: User;
  moderator: User;
  kind: NotifiedSanction;
  guildName: string;
  reason?: string;
  durationMs?: number;
  footer?: string;
}): Promise<boolean> {
  const duration = opts.durationMs
    ? formatDuration(opts.durationMs)
    : opts.kind === "jail"
      ? "Indéfinie"
      : undefined;
  return notifyMember(opts.target, sanctionDmEmbed(opts), {
    kind: opts.kind,
    reason: opts.reason ?? NO_REASON,
    ...(duration ? { duration } : {}),
    moderator: opts.moderator.username,
    guildName: opts.guildName,
  });
}
