import "./setup";
import { describe, expect, mock, test } from "bun:test";
import { MessageFlags } from "discord.js";

import en from "../src/locales/en.json";
import fr from "../src/locales/fr.json";
import ja from "../src/locales/ja.json";
import {
  COLLECTOR_GRACE_MS,
  executeInteractionSafely,
  isBenignReplyError,
  PAGINATION_CUSTOM_ID,
} from "../src/lib/safe-interaction";

function setup(options: {
  customId?: string;
  component?: boolean;
  repliable?: boolean;
  locale?: string;
  replied?: boolean;
  deferred?: boolean;
  reply?: () => Promise<unknown>;
  execute?: () => Promise<unknown>;
  /** Poll count after which another handler (a collector) acknowledges. */
  acknowledgeAfter?: number;
}) {
  const interaction = {
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
    locale: options.locale ?? "fr",
    customId: options.customId,
    isRepliable: () => options.repliable ?? true,
    isMessageComponent: () => options.component ?? false,
    reply: mock(options.reply ?? (async () => ({}))),
    editReply: mock(async () => ({})),
  };
  let polls = 0;
  const sleep = mock(async () => {
    polls++;
    if (options.acknowledgeAfter !== undefined && polls >= options.acknowledgeAfter) {
      interaction.deferred = true;
    }
  });
  const logger = { error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) };
  const client = { executeInteraction: mock(options.execute ?? (async () => {})) };
  const run = () => executeInteractionSafely(client, interaction as never, { logger, sleep });
  return { interaction, sleep, logger, run };
}

describe("fallback reply of the interaction dispatcher", () => {
  test("a handled interaction gets no fallback at all", async () => {
    const { interaction, logger, run } = setup({ replied: true });
    await run();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("the production race: a pagination collector acknowledges, the fallback stays silent", async () => {
    const { interaction, logger, sleep, run } = setup({
      customId: "discordx@pagination@next",
      component: true,
      acknowledgeAfter: 3,
    });
    await run();
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("an expired pagination (no collector left) is told so, ephemerally", async () => {
    const { interaction, run } = setup({
      customId: "discordx@pagination@previous",
      component: true,
    });
    await run();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: fr.interaction.paginationExpired,
      flags: MessageFlags.Ephemeral,
    });
  });

  test("the message follows the member's locale", async () => {
    const english = setup({
      customId: "discordx@pagination@next",
      component: true,
      locale: "en-US",
    });
    await english.run();
    expect(english.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: en.interaction.paginationExpired }),
    );
    const japanese = setup({ customId: "other", component: true, locale: "ja" });
    await japanese.run();
    expect(japanese.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: ja.interaction.unknown }),
    );
  });

  test("the grace period is bounded by the 3 s acknowledgement window", async () => {
    const { sleep, run } = setup({ customId: "x", component: true });
    await run();
    expect(sleep.mock.calls.length * 100).toBeLessThanOrEqual(COLLECTOR_GRACE_MS);
    expect(COLLECTOR_GRACE_MS).toBeLessThan(3000);
  });

  test("a slash command nobody handled is answered immediately, without waiting", async () => {
    const { interaction, sleep, run } = setup({ component: false });
    await run();
    expect(sleep).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: fr.interaction.unknown }),
    );
  });

  test("a failed handler replies with the failure, or edits when it had deferred", async () => {
    const failing = async () => {
      throw new Error("boom");
    };
    const fresh = setup({ execute: failing, component: true });
    await fresh.run();
    expect(fresh.logger.error).toHaveBeenCalledTimes(1);
    // A failure is never delayed for a collector.
    expect(fresh.sleep).not.toHaveBeenCalled();
    expect(fresh.interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: fr.interaction.failed }),
    );
    const deferred = setup({ execute: failing, deferred: true });
    await deferred.run();
    expect(deferred.interaction.reply).not.toHaveBeenCalled();
    expect(deferred.interaction.editReply).toHaveBeenCalledWith({ content: fr.interaction.failed });
  });

  test("a deferred interaction that did not fail is left alone", async () => {
    const { interaction, run } = setup({ deferred: true });
    await run();
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  test("losing the race (40060) or an expired token (10062) is not a warning", async () => {
    for (const code of [40060, 10062]) {
      const { logger, run } = setup({
        customId: "discordx@pagination@next",
        reply: () =>
          Promise.reject(
            Object.assign(new Error("Interaction has already been acknowledged."), { code }),
          ),
      });
      await run();
      expect(logger.warn).not.toHaveBeenCalled();
    }
  });

  test("any other reply failure is still reported", async () => {
    const { logger, run } = setup({
      reply: () => Promise.reject(Object.assign(new Error("Missing Access"), { code: 50001 })),
    });
    await run();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("an interaction that cannot be replied to (autocomplete) is never answered", async () => {
    const { interaction, run } = setup({ repliable: false });
    await run();
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  test("pagination custom ids and benign errors", () => {
    for (const id of ["next", "previous", "forward", "backward", "exit"]) {
      expect(PAGINATION_CUSTOM_ID.test(`discordx@pagination@${id}`)).toBe(true);
    }
    expect(PAGINATION_CUSTOM_ID.test("shop:open")).toBe(false);
    expect(isBenignReplyError({ code: 40060 })).toBe(true);
    expect(isBenignReplyError({ code: "InteractionAlreadyReplied" })).toBe(true);
    expect(isBenignReplyError({ code: 50001 })).toBe(false);
    expect(isBenignReplyError(null)).toBe(false);
  });

  test("the three languages carry the same interaction keys", () => {
    const keys = (dictionary: { interaction: Record<string, string> }) =>
      Object.keys(dictionary.interaction).toSorted();
    expect(keys(en)).toEqual(keys(fr));
    expect(keys(ja)).toEqual(keys(fr));
  });
});
