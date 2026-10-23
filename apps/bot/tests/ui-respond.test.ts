import "./setup";
import { describe, expect, mock, test } from "bun:test";
import { MessageFlags } from "discord.js";
import {
  UiValidationError,
  canvasFile,
  card,
  defer,
  edit,
  editPayload,
  followUp,
  notice,
  reply,
  replyPayload,
  sendPayload,
  text,
  toMessage,
} from "../src/ui";

const V2 = MessageFlags.IsComponentsV2;
const EPHEMERAL = MessageFlags.Ephemeral;
const view = () => card({ title: "Hello", lines: ["world"] });

interface FakeOptions {
  replied?: boolean;
  deferred?: boolean;
  component?: boolean;
  modal?: boolean;
  modalFromMessage?: boolean;
}

function fake(options: FakeOptions = {}) {
  const interaction = {
    replied: options.replied ?? false,
    deferred: options.deferred ?? false,
    isMessageComponent: () => options.component ?? false,
    isModalSubmit: () => options.modal ?? false,
    isFromMessage: () => options.modalFromMessage ?? false,
    reply: mock(async (..._args: unknown[]) => "reply"),
    editReply: mock(async (..._args: unknown[]) => "editReply"),
    followUp: mock(async (..._args: unknown[]) => "followUp"),
    update: mock(async (..._args: unknown[]) => "update"),
    deferReply: mock(async (..._args: unknown[]) => "deferReply"),
  };
  return interaction;
}
type Payload = Record<string, unknown> & { flags?: number };
const firstArg = (fn: ReturnType<typeof mock>): Payload => fn.mock.calls[0]![0] as Payload;

describe("payloads", () => {
  test("a reply is V2, ephemeral by default, without content or embeds, and pings nobody", () => {
    const payload = replyPayload(view());
    expect(payload.flags).toBe(V2 | EPHEMERAL);
    expect(payload.allowedMentions).toEqual({ parse: [] });
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("embeds");
    expect(payload.components).toHaveLength(1);
  });

  test("public, silent and allowedMentions are explicit choices", () => {
    expect(replyPayload({ components: [view()], public: true }).flags).toBe(V2);
    expect(replyPayload({ components: [view()], public: true, silent: true }).flags).toBe(
      V2 | MessageFlags.SuppressNotifications,
    );
    expect(
      replyPayload({ components: [view()], allowedMentions: { users: ["123456789012345678"] } })
        .allowedMentions,
    ).toEqual({ users: ["123456789012345678"] });
  });

  test("an edit only adds the V2 flag, clears content and embeds, replaces attachments", () => {
    const payload = editPayload(view());
    expect(payload.flags).toBe(V2);
    expect(payload.content).toBeNull();
    expect(payload.embeds).toEqual([]);
    expect(payload.attachments).toEqual([]);
    expect(payload.allowedMentions).toEqual({ parse: [] });
  });

  test("a channel message is always public", () => {
    expect(sendPayload(view()).flags).toBe(V2);
    expect(sendPayload({ components: [view()], silent: true }).flags).toBe(
      V2 | MessageFlags.SuppressNotifications,
    );
  });

  test("one component, a list, or a whole message are accepted alike", () => {
    expect(toMessage(view()).components).toHaveLength(1);
    expect(toMessage([view(), text("x")]).components).toHaveLength(2);
    expect(toMessage({ components: [view()], public: true }).public).toBe(true);
  });

  test("files travel with the payload and must match the media references", () => {
    const png = canvasFile(Buffer.from([1, 2, 3]), "card.png");
    const payload = replyPayload({
      components: [card({ title: "x", media: png.url })],
      files: [png.file],
    });
    expect(payload.files).toEqual([png.file]);
    expect(() => replyPayload(card({ title: "x", media: png.url }))).toThrow(UiValidationError);
    expect(() => replyPayload({ components: [card({ title: "x" })], files: [png.file] })).toThrow(
      UiValidationError,
    );
  });

  test("an invalid payload fails before anything is sent, with a path", () => {
    const tooMany = card({ blocks: Array.from({ length: 41 }, (_, i) => text(`t${i}`)) });
    expect(() => replyPayload(tooMany)).toThrow(UiValidationError);
    expect(() => editPayload(tooMany)).toThrow(/components/);
    expect(() => sendPayload(tooMany)).toThrow(UiValidationError);
  });
});

describe("reply / followUp / defer / edit", () => {
  test("first answer: reply(), ephemeral; deferred: editReply() with the V2 flag only", async () => {
    const fresh = fake();
    await reply(fresh as never, view());
    expect(fresh.reply).toHaveBeenCalledTimes(1);
    expect(firstArg(fresh.reply).flags).toBe(V2 | EPHEMERAL);

    const deferred = fake({ deferred: true });
    await reply(deferred as never, view());
    expect(deferred.editReply).toHaveBeenCalledTimes(1);
    expect(deferred.reply).not.toHaveBeenCalled();
    expect(firstArg(deferred.editReply).flags).toBe(V2);
  });

  test("after the first answer, reply() becomes a follow-up (ephemeral by default)", async () => {
    const answered = fake({ replied: true });
    await reply(answered as never, notice("fr", "info", "ui.cancelled"));
    expect(answered.followUp).toHaveBeenCalledTimes(1);
    expect(firstArg(answered.followUp).flags).toBe(V2 | EPHEMERAL);
    await followUp(answered as never, { components: [view()], public: true });
    expect(answered.followUp.mock.calls[1]![0]).toMatchObject({ flags: V2 });
  });

  test("defer(): ephemeral unless public, and a no-op when already acknowledged", async () => {
    const a = fake();
    await defer(a as never);
    expect(a.deferReply).toHaveBeenCalledWith({ flags: EPHEMERAL });
    const b = fake();
    await defer(b as never, { public: true });
    expect(b.deferReply).toHaveBeenCalledWith({});
    const c = fake({ deferred: true });
    await defer(c as never);
    const d = fake({ replied: true });
    await defer(d as never);
    expect(c.deferReply).not.toHaveBeenCalled();
    expect(d.deferReply).not.toHaveBeenCalled();
  });

  test("edit(): a component or a modal from a message updates it; otherwise editReply()", async () => {
    const click = fake({ component: true });
    await edit(click as never, view());
    expect(click.update).toHaveBeenCalledTimes(1);
    expect(firstArg(click.update).flags).toBe(V2);

    const acknowledged = fake({ component: true, deferred: true });
    await edit(acknowledged as never, view());
    expect(acknowledged.update).not.toHaveBeenCalled();
    expect(acknowledged.editReply).toHaveBeenCalledTimes(1);

    const fromMessage = fake({ modal: true, modalFromMessage: true });
    await edit(fromMessage as never, view());
    expect(fromMessage.update).toHaveBeenCalledTimes(1);

    const standalone = fake({ modal: true, modalFromMessage: false });
    await edit(standalone as never, view());
    expect(standalone.update).not.toHaveBeenCalled();
    expect(standalone.editReply).toHaveBeenCalledTimes(1);

    const command = fake({ replied: true });
    await edit(command as never, view());
    expect(command.editReply).toHaveBeenCalledTimes(1);
  });

  test("nothing is sent when the payload is invalid", async () => {
    const target = fake();
    const tooMany = card({ blocks: Array.from({ length: 41 }, (_, i) => text(`t${i}`)) });
    await expect(reply(target as never, tooMany)).rejects.toBeInstanceOf(UiValidationError);
    expect(target.reply).not.toHaveBeenCalled();
  });
});
