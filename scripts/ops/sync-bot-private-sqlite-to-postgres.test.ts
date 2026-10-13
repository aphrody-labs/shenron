import { expect, test } from "bun:test";
import {
  rowHash,
  semanticKey,
  targetKey,
  validateMutable,
} from "./sync-bot-private-sqlite-to-postgres";

const message = {
  id: 1,
  user_id: "123456789012345678",
  direction: "in",
  content: "private",
  persona: "shenron",
  message_id: "987654321098765432",
  read_at: null,
  created_at: 10,
};

test("stable negative identity and mutable read state", () => {
  const key = targetKey("dm_messages", "dbfr-bot-runtime-20261013", message);
  expect(BigInt(key) < 0n).toBe(true);
  expect(targetKey("dm_messages", "dbfr-bot-runtime-20261013", message)).toBe(key);
  expect(semanticKey("dm_messages", message)).toBe("discord:987654321098765432");
  expect(rowHash("dm_messages", message)).toBe(rowHash("dm_messages", { ...message, id: -99 }));
  validateMutable("dm_messages", { ...message, read_at: 20 }, message);
  expect(() => validateMutable("dm_messages", message, { ...message, read_at: 20 })).toThrow();
  expect(() =>
    validateMutable("dm_messages", { ...message, content: "changed" }, message),
  ).toThrow();
});

test("contact identity and moderation release cannot regress", () => {
  const contact = {
    user_id: "123456789012345678",
    username: "old",
    display_name: null,
    allowed: 0,
    note: null,
    first_seen_at: 10,
    last_seen_at: 20,
  };
  expect(targetKey("dm_contacts", "dbfr-bot-runtime-20261013", contact)).toBe(contact.user_id);
  validateMutable("dm_contacts", { ...contact, allowed: 1, last_seen_at: 21 }, contact);
  expect(() => validateMutable("dm_contacts", { ...contact, last_seen_at: 19 }, contact)).toThrow();
  const jail = {
    id: 1,
    user_id: contact.user_id,
    moderator_id: "987654321098765432",
    reason: null,
    expires_at: null,
    released_at: null,
    previous_roles: null,
    created_at: 30,
  };
  validateMutable("jails", { ...jail, released_at: 40 }, jail);
  expect(() => validateMutable("jails", jail, { ...jail, released_at: 40 })).toThrow();
});
