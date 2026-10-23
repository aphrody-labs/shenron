/**
 * Shared fixtures of the `polish-*` tests: a fake guild message pushed through the real
 * `MessageXPEvent`, with the template service's `publish` recorded instead of sent to Discord.
 */
import { spyOn } from "bun:test";
import { container } from "tsyringe";
import { MessageXPEvent } from "~/events/MessageXP";
import { MessageTemplateService } from "~/services/MessageTemplateService";

export interface Published {
  event: string;
  vars: Record<string, unknown>;
}

/** Records every `msg.publish(event, vars)` of the process until `restore()`. */
export function recordPublications() {
  const published: Published[] = [];
  const msg = container.resolve(MessageTemplateService);
  const spy = spyOn(msg, "publish").mockImplementation(async (event, vars) => {
    published.push({ event, vars });
    return null;
  });
  return { published, restore: () => spy.mockRestore() };
}

/** A human message in a guild channel, as `MessageXPEvent.onMessage` reads it. */
export function guildMessage(userId: string, content: string) {
  return {
    inGuild: () => true,
    system: false,
    author: { id: userId, username: `user-${userId}`, bot: false },
    content,
    member: null,
    guild: null,
    channel: { send: async () => null },
    client: {},
    delete: async () => null,
  } as never;
}

/** Runs one message through the real event handler. */
export async function sendMessage(userId: string, content: string) {
  const event = container.resolve(MessageXPEvent);
  await event.onMessage([guildMessage(userId, content)] as never);
}
