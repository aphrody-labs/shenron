import "./setup";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { ComponentType, MessageFlags } from "discord.js";
import {
  CONFIRM_TTL_MS,
  PAGER_NS,
  SHARE_COOLDOWN_MS,
  actions,
  botNoiseMeter,
  card,
  confirm,
  customId,
  handleConfirmButton,
  handlePagerButton,
  handlePagerModal,
  handleShareButton,
  paginate,
  parseCustomId,
  readPagerState,
  registerConfirm,
  registerPager,
  registerShare,
  resetShareCooldowns,
  shareButton,
  unregisterConfirm,
  unregisterPager,
  unregisterShare,
  validate,
  type UiInput,
  type UiRow,
} from "../src/ui";

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const ME = "1000000000000000001";
const OTHER = "1000000000000000002";
const CHANNEL = "2000000000000000001";

type Payload = Record<string, unknown> & { flags?: number };

interface ClickOptions {
  user?: string;
  locale?: string;
  channel?: unknown;
  fields?: Record<string, string>;
}

/** A button or modal interaction recording every Discord call it makes. */
function click(id: string, options: ClickOptions = {}) {
  const i = {
    customId: id,
    user: { id: options.user ?? ME },
    locale: options.locale ?? "fr",
    channelId: CHANNEL,
    channel: options.channel,
    replied: false,
    deferred: false,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    isFromMessage: () => false,
    fields: {
      getTextInputValue: (name: string) => options.fields?.[name] ?? "",
    },
    reply: mock(async (..._args: unknown[]) => {
      i.replied = true;
    }),
    editReply: mock(async (..._args: unknown[]) => {
      i.replied = true;
    }),
    followUp: mock(async (..._args: unknown[]) => {}),
    update: mock(async (..._args: unknown[]) => {
      i.replied = true;
    }),
    deferReply: mock(async (..._args: unknown[]) => {
      i.deferred = true;
    }),
    deferUpdate: mock(async (..._args: unknown[]) => {
      i.deferred = true;
    }),
    showModal: mock(async (..._args: unknown[]) => {}),
  };
  return i;
}
type Click = ReturnType<typeof click>;
const sent = (fn: ReturnType<typeof mock>, call = 0) => fn.mock.calls[call]![0] as Payload;
const asButton = (i: Click) => i as never;
/** Content of the first Text Display found in a payload (searching containers). */
function firstText(payload: Payload): string {
  const find = (node: unknown): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const json =
      typeof (node as { toJSON?: unknown }).toJSON === "function"
        ? (node as { toJSON(): unknown }).toJSON()
        : node;
    const { type, content, components } = json as {
      type?: number;
      content?: string;
      components?: unknown[];
    };
    if (type === ComponentType.TextDisplay) return content;
    for (const child of components ?? []) {
      const found = find(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const component of payload.components as unknown[]) {
    const found = find(component);
    if (found !== undefined) return found;
  }
  return "";
}
function buttonIds(row: UiRow): Array<{ id: string; label?: string; disabled?: boolean }> {
  return (
    row.toJSON().components as Array<{ custom_id: string; label?: string; disabled?: boolean }>
  ).map((b) => ({ id: b.custom_id, label: b.label, disabled: b.disabled }));
}

afterEach(() => {
  unregisterPager("scores");
  unregisterConfirm("buy");
  unregisterShare("scan");
  resetShareCooldowns();
});

describe("paginate()", () => {
  test("no row for a single page; previous / page / next otherwise", () => {
    expect(paginate({ kind: "scores", lang: "fr", page: 1, pageCount: 1 })).toBeNull();
    expect(paginate({ kind: "scores", lang: "fr", page: 1, pageCount: 0 })).toBeNull();
    const row = paginate({ kind: "scores", lang: "fr", page: 2, pageCount: 5 })!;
    const buttons = buttonIds(row);
    expect(buttons.map((b) => b.label)).toEqual(["Précédent", "2/5", "Suivant"]);
    expect(buttons.map((b) => b.disabled ?? false)).toEqual([false, false, false]);
    expect(new Set(buttons.map((b) => b.id)).size).toBe(3);
    expect(buttons.every((b) => b.id.length <= 100)).toBe(true);
  });

  test("the first page disables previous, the last disables next; the page is clamped", () => {
    const first = buttonIds(paginate({ kind: "scores", lang: "en", page: 1, pageCount: 3 })!);
    expect(first.map((b) => b.disabled ?? false)).toEqual([true, false, false]);
    expect(first[0]!.label).toBe("Previous");
    const last = buttonIds(paginate({ kind: "scores", lang: "ja", page: 99, pageCount: 3 })!);
    expect(last.map((b) => b.disabled ?? false)).toEqual([false, false, true]);
    expect(last[1]!.label).toBe("3/3");
    expect(() => paginate({ kind: "scores", lang: "fr", page: 1, pageCount: 10_000 })).toThrow(
      RangeError,
    );
    expect(() => paginate({ kind: "Bad Kind", lang: "fr", page: 1, pageCount: 3 })).toThrow();
  });

  test("the state is in the custom id: kind, action, page, total, owner, context, expiry", () => {
    const now = Date.UTC(2026, 9, 23);
    const row = paginate({
      kind: "scores",
      lang: "fr",
      page: 3,
      pageCount: 8,
      owner: ME,
      ctx: ["xp", 42],
      ttlMs: 60 * 60_000,
      now,
    })!;
    const state = readPagerState(parseCustomId(buttonIds(row)[2]!.id)!)!;
    expect(state).toMatchObject({
      kind: "scores",
      action: "next",
      page: 3,
      total: 8,
      owner: ME,
      ctx: ["xp", "42"],
    });
    expect(state.expiresAt).toBeGreaterThanOrEqual(now + 60 * 60_000);
    expect(state.expiresAt).toBeLessThan(now + 60 * 60_000 + 60_000);
  });

  test("fits inside a V2 card and passes validation", () => {
    const view = card({
      title: "Scores",
      actions: paginate({
        kind: "scores",
        lang: "fr",
        page: 2,
        pageCount: 4,
        owner: ME,
        ctx: ["xp"],
      }),
    });
    expect(validate({ components: [view] })).toEqual([]);
  });
});

describe("pager clicks", () => {
  function setup(extra: { ttlMs?: number; owner?: string } = {}) {
    const renderer = mock(
      async ({
        page,
        total,
        ctx,
        lang,
      }: {
        page: number;
        total: number;
        ctx: string[];
        lang: string;
      }): Promise<UiInput> =>
        card({
          title: `page ${page}/${total} ${ctx.join(",")} ${lang}`,
          actions: paginate({ kind: "scores", lang: "fr", page, pageCount: total, ...extra, ctx }),
        }),
    );
    registerPager("scores", renderer as never);
    const row = paginate({
      kind: "scores",
      lang: "fr",
      page: 3,
      pageCount: 5,
      ctx: ["xp"],
      ...extra,
    })!;
    const [prev, go, next] = buttonIds(row).map((b) => b.id) as [string, string, string];
    return { renderer, prev, go, next, row };
  }

  test("next / previous re-render the neighbouring page and update the message", async () => {
    const { renderer, prev, next } = setup();
    const a = click(next);
    expect(await handlePagerButton(asButton(a))).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer.mock.calls[0]![0]).toMatchObject({
      page: 4,
      total: 5,
      ctx: ["xp"],
      userId: ME,
    });
    expect(a.update).toHaveBeenCalledTimes(1);
    expect(sent(a.update).flags).toBe(V2);
    expect(firstText(sent(a.update))).toBe("## page 4/5 xp fr");

    const b = click(prev, { locale: "en-US" });
    await handlePagerButton(asButton(b));
    expect(renderer.mock.calls[1]![0]).toMatchObject({ page: 2, lang: "en" });
  });

  test("the neighbours never leave 1..total", async () => {
    setup();
    const atEnd = paginate({ kind: "scores", lang: "fr", page: 5, pageCount: 5 })!;
    const edge = click(buttonIds(atEnd)[2]!.id);
    await handlePagerButton(asButton(edge));
    expect(firstText(sent(edge.update))).toContain("page 5/5");
  });

  test("the page button opens a form with the page range", async () => {
    const { renderer, go } = setup();
    const i = click(go, { locale: "ja" });
    await handlePagerButton(asButton(i));
    expect(renderer).not.toHaveBeenCalled();
    expect(i.showModal).toHaveBeenCalledTimes(1);
    const modal = (
      i.showModal.mock.calls[0]![0] as { toJSON(): Record<string, unknown> }
    ).toJSON() as {
      custom_id: string;
      title: string;
      components: Array<{
        type: number;
        label: string;
        component: { custom_id: string; max_length: number };
      }>;
    };
    expect(modal.custom_id).toBe(go);
    expect(modal.title).toBe("ページへ移動");
    expect(modal.components[0]).toMatchObject({
      type: ComponentType.Label,
      label: "ページ番号（1〜5）",
      component: { custom_id: "page", max_length: 1 },
    });
  });

  test("the form: a valid number renders that page, anything else gets a notice", async () => {
    const { renderer, go } = setup();
    const ok = click(go, { fields: { page: " 4 " } });
    ok.isModalSubmit = () => true;
    ok.isMessageComponent = () => false;
    ok.isFromMessage = () => true;
    expect(await handlePagerModal(ok as never)).toBe(true);
    expect(renderer.mock.calls[0]![0]).toMatchObject({ page: 4 });
    expect(ok.update).toHaveBeenCalledTimes(1);

    for (const typed of ["0", "6", "abc", "", "2.5", "-1"]) {
      const bad = click(go, { fields: { page: typed }, locale: "en" });
      bad.isModalSubmit = () => true;
      bad.isMessageComponent = () => false;
      await handlePagerModal(bad as never);
      expect(bad.update).not.toHaveBeenCalled();
      expect(bad.reply).toHaveBeenCalledTimes(1);
      expect(sent(bad.reply).flags).toBe(V2 | EPHEMERAL);
      expect(firstText(sent(bad.reply))).toBe("❌ Invalid page: enter a number between 1 and 5.");
    }
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  test("expired: unknown kind (restart without the renderer), old version, past the expiry", async () => {
    const { next } = setup({ ttlMs: 60_000 });
    unregisterPager("scores");
    const unknown = click(next);
    expect(await handlePagerButton(asButton(unknown))).toBe(true);
    expect(firstText(sent(unknown.reply))).toBe(
      "❌ Ce message a expiré. Relance la commande pour l'actualiser.",
    );
    expect(sent(unknown.reply).flags).toBe(V2 | EPHEMERAL);

    const { next: timed } = setup({ ttlMs: 60_000 });
    const late = click(timed);
    await handlePagerButton(asButton(late), Date.now() + 3 * 60_000);
    expect(firstText(sent(late.reply))).toContain("expiré");
    const onTime = click(timed);
    await handlePagerButton(asButton(onTime));
    expect(onTime.update).toHaveBeenCalledTimes(1);

    const old = click(customId(PAGER_NS, 0, "scores", "next", 1, 5, "", "", "xp"));
    await handlePagerButton(asButton(old));
    expect(firstText(sent(old.reply))).toContain("expiré");
    const garbage = click(customId(PAGER_NS, 1, "scores", "teleport", 1, 5, "", ""));
    await handlePagerButton(asButton(garbage));
    expect(garbage.update).not.toHaveBeenCalled();
    expect(firstText(sent(garbage.reply))).toContain("expiré");
  });

  test("someone else's pager gets a private notice, the owner's does not", async () => {
    const { next } = setup({ owner: ME });
    const intruder = click(next, { user: OTHER, locale: "en" });
    await handlePagerButton(asButton(intruder));
    expect(intruder.update).not.toHaveBeenCalled();
    expect(firstText(sent(intruder.reply))).toBe(
      "❌ These buttons are not yours: run the command yourself.",
    );
    const owner = click(next);
    await handlePagerButton(asButton(owner));
    expect(owner.update).toHaveBeenCalledTimes(1);
  });

  test("an id of another namespace is not handled", async () => {
    const stranger = click(customId("shop", 1, "buy"));
    expect(await handlePagerButton(asButton(stranger))).toBe(false);
    expect(stranger.reply).not.toHaveBeenCalled();
    expect(await handlePagerButton(asButton(click("help:category")))).toBe(false);
  });

  test("a pager kind is registered once", () => {
    registerPager("scores", () => card({ title: "a" }));
    expect(() => registerPager("scores", () => card({ title: "b" }))).toThrow(/already registered/);
  });
});

describe("confirm()", () => {
  test("two buttons: confirm (danger) and cancel, ids in the confirm namespace, 10 minute expiry", () => {
    const now = Date.UTC(2026, 9, 23);
    const row = confirm({ kind: "buy", lang: "fr", owner: ME, ctx: ["card_goku"], now });
    const json = row.toJSON().components as Array<{
      style: number;
      label: string;
      custom_id: string;
    }>;
    expect(json.map((b) => b.label)).toEqual(["Confirmer", "Annuler"]);
    expect(json.map((b) => b.style)).toEqual([4, 2]);
    const parsed = parseCustomId(json[0]!.custom_id)!;
    expect(parsed.ns).toBe("ui.cf");
    expect(parsed.args.slice(0, 2)).toEqual(["buy", "yes"]);
    expect(parsed.args.at(-1)).toBe("card_goku");
    expect(validate({ components: [card({ title: "Sure?", actions: row })] })).toEqual([]);
    expect(CONFIRM_TTL_MS).toBe(10 * 60_000);
  });

  test("confirm runs the handler and replaces the message; cancel says so", async () => {
    const handler = mock(async (..._args: unknown[]) => card({ title: "Bought" }));
    registerConfirm("buy", handler);
    const [yes, no] = buttonIds(
      confirm({ kind: "buy", lang: "fr", owner: ME, ctx: ["card_goku"] }),
    );
    const accepted = click(yes!.id);
    expect(await handleConfirmButton(asButton(accepted))).toBe(true);
    expect(handler.mock.calls[0]![0]).toMatchObject({ ctx: ["card_goku"], userId: ME, lang: "fr" });
    expect(accepted.update).toHaveBeenCalledTimes(1);

    const cancelled = click(no!.id, { locale: "en" });
    await handleConfirmButton(asButton(cancelled));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(firstText(sent(cancelled.update))).toBe("ℹ️ Action cancelled.");
  });

  test("a handler that answers itself leaves the interaction alone, one that does not is acknowledged", async () => {
    registerConfirm("buy", async ({ interaction }) => {
      await interaction.reply({ content: "done" });
    });
    const [yes] = buttonIds(confirm({ kind: "buy", lang: "fr" }));
    const self = click(yes!.id);
    await handleConfirmButton(asButton(self));
    expect(self.deferUpdate).not.toHaveBeenCalled();
    unregisterConfirm("buy");
    registerConfirm("buy", async () => {});
    const silent = click(yes!.id);
    await handleConfirmButton(asButton(silent));
    expect(silent.deferUpdate).toHaveBeenCalledTimes(1);
  });

  test("expired, foreign and unregistered confirmations do nothing but say so", async () => {
    const handler = mock(async (..._args: unknown[]) => card({ title: "x" }));
    registerConfirm("buy", handler);
    const [yes] = buttonIds(confirm({ kind: "buy", lang: "fr", owner: ME }));

    const late = click(yes!.id);
    await handleConfirmButton(asButton(late), Date.now() + CONFIRM_TTL_MS + 2 * 60_000);
    expect(firstText(sent(late.reply))).toContain("expiré");

    const intruder = click(yes!.id, { user: OTHER });
    await handleConfirmButton(asButton(intruder));
    expect(firstText(sent(intruder.reply))).toContain("pas pour toi");

    unregisterConfirm("buy");
    const gone = click(yes!.id);
    await handleConfirmButton(asButton(gone));
    expect(firstText(sent(gone.reply))).toContain("expiré");
    expect(handler).not.toHaveBeenCalled();
    expect(await handleConfirmButton(asButton(click("ui.pg:v1:x")))).toBe(false);
  });
});

describe("shareButton()", () => {
  const publicCard = (): UiInput => card({ title: "Scan of Goku" });

  function channel() {
    return { id: CHANNEL, send: mock(async (..._args: unknown[]) => ({})) };
  }

  test("a labelled spec for actions(), state in the id", () => {
    const spec = shareButton({ kind: "scan", lang: "en", owner: ME, ctx: [OTHER] });
    expect(spec).toMatchObject({ type: "button", label: "Share", emoji: "📣", style: "secondary" });
    const parsed = parseCustomId(spec.id)!;
    expect(parsed.ns).toBe("ui.sh");
    expect(parsed.args).toEqual(["scan", "", ME, OTHER]);
    expect(validate({ components: [card({ title: "x", actions: actions(spec) })] })).toEqual([]);
  });

  test("posts the public variant in the channel, then confirms in private", async () => {
    const builder = mock(async (..._args: unknown[]) => publicCard());
    registerShare("scan", builder);
    const id = shareButton({ kind: "scan", lang: "fr", owner: ME, ctx: [OTHER] }).id;
    const target = channel();
    const i = click(id, { channel: target });
    expect(await handleShareButton(asButton(i))).toBe(true);

    expect(i.deferReply).toHaveBeenCalledWith({ flags: EPHEMERAL });
    expect(builder.mock.calls[0]![0]).toMatchObject({ ctx: [OTHER], userId: ME, lang: "fr" });
    const posted = sent(target.send);
    expect(posted.flags).toBe(V2);
    expect(posted.allowedMentions).toEqual({ parse: [] });
    expect(i.editReply).toHaveBeenCalledTimes(1);
    expect(firstText(sent(i.editReply))).toBe("✅ Partagé dans le salon.");
    // The meter will file the message the bot just posted under "share".
    expect(botNoiseMeter.takeHint(CHANNEL)).toBe("share");
  });

  test("without a sendable channel the public variant goes out as a public follow-up", async () => {
    registerShare("scan", async () => publicCard());
    const i = click(shareButton({ kind: "scan", lang: "fr" }).id, { channel: null });
    await handleShareButton(asButton(i));
    expect(i.followUp).toHaveBeenCalledTimes(1);
    expect(sent(i.followUp).flags).toBe(V2);
  });

  test("a second share of the same view within the cooldown is refused", async () => {
    const builder = mock(async (..._args: unknown[]) => publicCard());
    registerShare("scan", builder);
    const id = shareButton({ kind: "scan", lang: "en" }).id;
    const target = channel();
    const now = Date.now();
    await handleShareButton(asButton(click(id, { channel: target })), now);
    const again = click(id, { channel: target, locale: "en" });
    await handleShareButton(asButton(again), now + 5_000);
    expect(target.send).toHaveBeenCalledTimes(1);
    expect(firstText(sent(again.reply))).toBe("ℹ️ Wait a few seconds before sharing again.");
    const later = click(id, { channel: target });
    await handleShareButton(asButton(later), now + SHARE_COOLDOWN_MS + 1);
    expect(target.send).toHaveBeenCalledTimes(2);
  });

  test("nothing to share, or a failing send, tells the member and posts nothing", async () => {
    registerShare("scan", async () => null);
    const empty = click(shareButton({ kind: "scan", lang: "fr" }).id, { channel: channel() });
    await handleShareButton(asButton(empty));
    expect(firstText(sent(empty.editReply))).toBe("❌ Impossible de partager dans ce salon.");

    unregisterShare("scan");
    resetShareCooldowns();
    registerShare("scan", async () => publicCard());
    const broken = {
      id: CHANNEL,
      send: mock(async (..._args: unknown[]) => {
        throw new Error("Missing Permissions");
      }),
    };
    const failed = click(shareButton({ kind: "scan", lang: "fr" }).id, { channel: broken });
    await handleShareButton(asButton(failed));
    expect(firstText(sent(failed.editReply))).toContain("Impossible de partager");
  });

  test("only the owner shares; expired or unregistered buttons say so; foreign ids are ignored", async () => {
    const builder = mock(async (..._args: unknown[]) => publicCard());
    registerShare("scan", builder);
    const id = shareButton({ kind: "scan", lang: "fr", owner: ME, ttlMs: 60_000 }).id;
    const intruder = click(id, { user: OTHER, channel: channel() });
    await handleShareButton(asButton(intruder));
    expect(firstText(sent(intruder.reply))).toContain("pas pour toi");
    const late = click(id, { channel: channel() });
    await handleShareButton(asButton(late), Date.now() + 5 * 60_000);
    expect(firstText(sent(late.reply))).toContain("expiré");
    unregisterShare("scan");
    const gone = click(id, { channel: channel() });
    await handleShareButton(asButton(gone));
    expect(firstText(sent(gone.reply))).toContain("expiré");
    expect(builder).not.toHaveBeenCalled();
    expect(await handleShareButton(asButton(click("ui.pg:v1:x")))).toBe(false);
  });
});
