// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { DEFAULT_ROOM_LIMITS, RoomRegistry, seededRng, type CloseReason } from "../src";
import { ManualClock } from "../src/testing";
import { makeBank, msg, U1, U2 } from "./helpers";

function registry(extra: { maxRooms?: number } = {}) {
  const clock = new ManualClock();
  const closed: [string, CloseReason][] = [];
  const reg = new RoomRegistry({
    clock,
    rng: seededRng("registry"),
    bank: makeBank(),
    onRoomClosed: (id, reason) => closed.push([id, reason]),
    ...extra,
  });
  return { clock, reg, closed };
}

describe("RoomRegistry", () => {
  test("opens one room per instance and returns the same one afterwards", () => {
    const { reg } = registry();
    const a = reg.open("i-aaa");
    expect(a).not.toBeNull();
    expect(reg.open("i-aaa")).toBe(a);
    expect(reg.open("i-bbb")).not.toBe(a);
    expect(reg.size).toBe(2);
    expect(reg.get("i-aaa")).toBe(a!);
    expect(reg.get("i-zzz")).toBeUndefined();
    expect(a?.instanceId).toBe("i-aaa");
  });

  test("refuses an instance id that is not a safe key", () => {
    const { reg } = registry();
    for (const id of [
      "",
      "has space",
      "../etc",
      "a".repeat(129),
      "emoji-😀",
      "semi;colon",
      "new\nline",
    ])
      expect(reg.open(id)).toBeNull();
    expect(reg.size).toBe(0);
  });

  test("rooms are independent: one instance's players do not exist in another", () => {
    const { reg } = registry();
    const a = reg.open("i-aaa")!;
    const b = reg.open("i-bbb")!;
    a.join({ userId: U1, name: "A" });
    b.join({ userId: U2, name: "B" });
    expect(a.has(U2)).toBe(false);
    expect(b.has(U1)).toBe(false);
    a.receive(U1, msg.start());
    expect(a.phase).toBe("round");
    expect(b.phase).toBe("lobby");
  });

  test("caps the number of rooms, then recovers room as old ones close", () => {
    const { reg, clock } = registry({ maxRooms: 2 });
    expect(reg.open("i-1")).not.toBeNull();
    expect(reg.open("i-2")).not.toBeNull();
    expect(reg.open("i-3")).toBeNull();
    // The two rooms are empty and stale: once their grace is over a new instance gets a place.
    clock.advance(DEFAULT_ROOM_LIMITS.emptyGraceMs);
    expect(reg.open("i-3")).not.toBeNull();
    expect(reg.size).toBe(1);
  });

  test("tick closes and drops expired rooms, reporting why, and returns what to send", () => {
    const { reg, clock, closed } = registry();
    const room = reg.open("i-aaa")!;
    room.join({ userId: U1, name: "A" });
    expect(reg.nextDeadline()).toBe(clock.now() + DEFAULT_ROOM_LIMITS.presenceTimeoutMs);
    expect(reg.tick()).toEqual([]);
    clock.advance(DEFAULT_ROOM_LIMITS.presenceTimeoutMs);
    const outputs = reg.tick();
    // The silent member was dropped; the room is now empty and stays for its grace period.
    expect(outputs).toHaveLength(1);
    expect(outputs[0]?.instanceId).toBe("i-aaa");
    expect(reg.size).toBe(1);
    clock.advance(DEFAULT_ROOM_LIMITS.emptyGraceMs);
    const last = reg.tick();
    expect(last[0]?.out.map((o) => o.message.type)).toEqual(["closed"]);
    expect(reg.size).toBe(0);
    expect(closed).toEqual([["i-aaa", "empty"]]);
    expect(reg.nextDeadline()).toBeNull();
  });

  test("a closed instance gets a fresh room when someone comes back", () => {
    const { reg, clock } = registry();
    const first = reg.open("i-aaa")!;
    first.join({ userId: U1, name: "A" });
    clock.advance(DEFAULT_ROOM_LIMITS.idleTimeoutMs);
    first.tick();
    expect(first.isClosed).toBe(true);
    expect(reg.get("i-aaa")).toBeUndefined();
    const second = reg.open("i-aaa")!;
    expect(second).not.toBe(first);
    expect(second.phase).toBe("lobby");
    expect(second.has(U1)).toBe(false);
  });

  test("closeAll shuts every room down and reports the reason once", () => {
    const { reg, closed } = registry();
    reg.open("i-aaa")!.join({ userId: U1, name: "A" });
    reg.open("i-bbb")!.join({ userId: U2, name: "B" });
    const outputs = reg.closeAll("shutdown");
    expect(outputs.map((o) => o.instanceId).toSorted()).toEqual(["i-aaa", "i-bbb"]);
    for (const output of outputs)
      expect(output.out[0]?.message).toMatchObject({ type: "closed", reason: "shutdown" });
    expect(reg.size).toBe(0);
    expect(closed.map(([, reason]) => reason)).toEqual(["shutdown", "shutdown"]);
  });
});
