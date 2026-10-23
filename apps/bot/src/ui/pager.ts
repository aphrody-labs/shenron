// SPDX-License-Identifier: Apache-2.0
/**
 * Components V2 pagination: `paginate()` builds the row, `registerPager()` declares how a page
 * is rendered, `handlePagerButton()` / `handlePagerModal()` (wired by `events/UiComponents.ts`)
 * answer the clicks. It replaces `@discordx/pagination`, which only speaks embeds.
 *
 * No collector: the whole state is in the `custom_id`
 * (`ui.pg:v1:<kind>:<action>:<page>:<total>:<expiry>:<owner>:<ctx…>`), so a pager keeps working
 * after a restart, for as long as its renderer is registered and its expiry (optional) has not
 * passed. A click that cannot be honoured (unknown kind, older id version, past the expiry,
 * someone else's pager) gets one ephemeral notice instead of an "interaction failed".
 *
 * Usage:
 *
 *   registerPager("scoreboard", async ({ lang, page, ctx }) => {
 *     const { rows, pageCount } = await loadPage(Number(ctx[0]), page);
 *     return card({ accent: "level", title: "…", lines: rows, actions: paginate({
 *       kind: "scoreboard", lang, page, pageCount, ctx: [ctx[0]!] }) });
 *   });
 *   // in the command: reply(interaction, await render first page)
 */
import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { interactionLang, t, type BotLang } from "~/lib/i18n";
import { actions, button, type UiRow } from "./actions";
import {
  customId,
  intArg,
  parseCustomId,
  type CustomIdArg,
  type ParsedCustomId,
} from "./custom-id";
import { LIMITS, clip } from "./limits";
import { notice } from "./notice";
import { edit, reply, type UiInput } from "./respond";
import { assertKind, decodeExpiry, encodeExpiry, gate, ownerArg } from "./state";

export const PAGER_NS = "ui.pg";
export const PAGER_VERSION = 1;
/** Highest page count a pager id can carry (4 digits). */
export const MAX_PAGES = 9_999;

export type PagerAction = "prev" | "next" | "go";
const ACTIONS: ReadonlySet<string> = new Set<PagerAction>(["prev", "next", "go"]);

export interface PaginateOptions {
  /** Key of the renderer registered with `registerPager()`. */
  kind: string;
  lang: BotLang;
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  /** Only this user may flip the pages (public messages); anyone otherwise. */
  owner?: string;
  /** Compact state handed back to the renderer (a filter, a target user…). Keep it short. */
  ctx?: readonly CustomIdArg[];
  /** The buttons stop working this long after the message is built. Default: never. */
  ttlMs?: number;
  now?: number;
}

export interface PagerState {
  kind: string;
  action: PagerAction;
  page: number;
  total: number;
  expiresAt?: number;
  owner?: string;
  ctx: string[];
}

/** Clamps a requested page into `1..total`. */
export function clampPage(page: number, total: number): number {
  return Math.min(Math.max(1, Math.trunc(page) || 1), Math.max(1, total));
}

function pagerId(
  options: Pick<PaginateOptions, "kind" | "owner" | "ctx" | "ttlMs" | "now">,
  action: PagerAction,
  page: number,
  total: number,
): string {
  return customId(
    PAGER_NS,
    PAGER_VERSION,
    assertKind(options.kind),
    action,
    page,
    total,
    encodeExpiry(options.ttlMs, options.now),
    ownerArg(options.owner),
    ...(options.ctx ?? []),
  );
}

/**
 * The pager row: previous, `page/total` (opens a "go to page" form), next. `null` when there is
 * a single page, so it can sit in `card({ actions })` unconditionally.
 */
export function paginate(options: PaginateOptions): UiRow | null {
  const total = Math.trunc(options.pageCount);
  if (!Number.isFinite(total) || total <= 1) return null;
  if (total > MAX_PAGES) throw new RangeError(`a pager holds ${MAX_PAGES} pages at most`);
  const page = clampPage(options.page, total);
  return actions(
    button({
      id: pagerId(options, "prev", page, total),
      label: t(options.lang, "ui.button.previous"),
      emoji: "⬅️",
      disabled: page <= 1,
    }),
    button({
      id: pagerId(options, "go", page, total),
      label: t(options.lang, "ui.button.page", { page, total }),
    }),
    button({
      id: pagerId(options, "next", page, total),
      label: t(options.lang, "ui.button.next"),
      emoji: "➡️",
      disabled: page >= total,
    }),
  );
}

/** The state of a pager `custom_id`, or `null` when it is not a current-version pager id. */
export function readPagerState(parsed: ParsedCustomId): PagerState | null {
  if (parsed.ns !== PAGER_NS || parsed.version !== PAGER_VERSION) return null;
  const [kind, action, page, total, expiry, owner, ...ctx] = parsed.args;
  if (!kind || !ACTIONS.has(action ?? "")) return null;
  const pageCount = intArg(total, 0, { min: 1, max: MAX_PAGES });
  if (pageCount === 0) return null;
  return {
    kind,
    action: action as PagerAction,
    page: clampPage(intArg(page, 1, { min: 1 }), pageCount),
    total: pageCount,
    expiresAt: decodeExpiry(expiry),
    owner: owner || undefined,
    ctx,
  };
}

export interface PagerRequest {
  lang: BotLang;
  /** The page to render, already clamped to `1..total`. */
  page: number;
  total: number;
  /** The `ctx` given to `paginate()`, as strings. */
  ctx: string[];
  userId: string;
  interaction: ButtonInteraction | ModalSubmitInteraction;
}
export type PagerRenderer = (request: PagerRequest) => Promise<UiInput> | UiInput;

const renderers = new Map<string, PagerRenderer>();

/** Declares how pages of `kind` are rendered. A kind is registered once. */
export function registerPager(kind: string, renderer: PagerRenderer): void {
  assertKind(kind);
  const known = renderers.get(kind);
  if (known && known !== renderer) throw new Error(`pager "${kind}" is already registered`);
  renderers.set(kind, renderer);
}

/** Test hook: forgets a registered renderer. */
export function unregisterPager(kind: string): void {
  renderers.delete(kind);
}

function goToModal(lang: BotLang, state: PagerState, id: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(clip(t(lang, "ui.modal.goToTitle"), LIMITS.modalTitle))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(clip(t(lang, "ui.modal.goToLabel", { max: state.total }), LIMITS.modalLabel))
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("page")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(String(state.total).length)
            .setPlaceholder(String(state.page)),
        ),
    );
}

type Gated = { state: PagerState; renderer: PagerRenderer } | null;

/** Parses and gates a pager click; answers the user itself when the click cannot be honoured. */
async function resolve(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  now: number,
): Promise<Gated | "foreign"> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.ns !== PAGER_NS) return "foreign";
  const lang = interactionLang(interaction);
  const state = readPagerState(parsed);
  const renderer = state ? renderers.get(state.kind) : undefined;
  const verdict = state ? gate(state, interaction.user.id, now) : "expired";
  if (!state || !renderer || verdict === "expired") {
    await reply(interaction, notice(lang, "error", "ui.expired"));
    return null;
  }
  if (verdict === "not-owner") {
    await reply(interaction, notice(lang, "error", "ui.notYours"));
    return null;
  }
  return { state, renderer };
}

async function render(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  { state, renderer }: NonNullable<Gated>,
  page: number,
): Promise<void> {
  const view = await renderer({
    lang: interactionLang(interaction),
    page: clampPage(page, state.total),
    total: state.total,
    ctx: state.ctx,
    userId: interaction.user.id,
    interaction,
  });
  await edit(interaction, view);
}

/** Answers a click on the pager row. Returns `false` when the id is not a pager id. */
export async function handlePagerButton(
  interaction: ButtonInteraction,
  now = Date.now(),
): Promise<boolean> {
  const gated = await resolve(interaction, now);
  if (gated === "foreign") return false;
  if (!gated) return true;
  const { state } = gated;
  if (state.action === "go") {
    await interaction.showModal(
      goToModal(interactionLang(interaction), state, interaction.customId),
    );
    return true;
  }
  await render(interaction, gated, state.action === "prev" ? state.page - 1 : state.page + 1);
  return true;
}

/** Answers the "go to page" form. Returns `false` when the id is not a pager id. */
export async function handlePagerModal(
  interaction: ModalSubmitInteraction,
  now = Date.now(),
): Promise<boolean> {
  const gated = await resolve(interaction, now);
  if (gated === "foreign") return false;
  if (!gated) return true;
  const typed = interaction.fields.getTextInputValue("page").trim();
  const wanted = intArg(typed, 0, { min: 1, max: gated.state.total });
  if (wanted === 0) {
    await reply(
      interaction,
      notice(interactionLang(interaction), "error", "ui.invalidPage", { max: gated.state.total }),
    );
    return true;
  }
  await render(interaction, gated, wanted);
  return true;
}
