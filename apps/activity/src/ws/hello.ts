// SPDX-License-Identifier: Apache-2.0
/**
 * The first frame of every socket. It belongs to the transport, not to the game protocol of
 * `@aphrody/shenron-activity/protocol`: it carries the credentials, which must never reach a room.
 * The token travels in this frame and not in the URL, so it stays out of access logs and referrers.
 */
import { InstanceIdSchema, PROTOCOL_VERSION } from "@aphrody/shenron-activity/protocol";
import { z } from "zod";
import { TOKEN_PATTERN } from "../auth/discord";

export const HelloSchema = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal("hello"),
  /** The Discord access token returned by `POST /api/token` (and given to `authenticate()`). */
  token: z.string().regex(TOKEN_PATTERN),
  /** `discordSdk.instanceId`. */
  instanceId: InstanceIdSchema,
  /** `discordSdk.guildId`, for the guild nickname; absent in DMs and group DMs. */
  guildId: z
    .string()
    .regex(/^\d{5,25}$/)
    .nullish(),
});
export type Hello = z.infer<typeof HelloSchema>;

/** WebSocket close codes of the transport (4000-4999 are reserved for applications). */
export const CLOSE = {
  badHello: 4400,
  unauthorized: 4401,
  refused: 4403,
  timeout: 4408,
  replaced: 4409,
  busy: 4503,
  normal: 1000,
  goingAway: 1001,
  tooSlow: 1013,
} as const;

export function parseHello(raw: unknown): Hello | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const parsed = HelloSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
