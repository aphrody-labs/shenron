// SPDX-License-Identifier: Apache-2.0
/**
 * The real server on an ephemeral port, three simulated players over real WebSockets, from the
 * hello frame to the signed receipt that reaches the (simulated) bot and the `settled` message
 * that comes back to the room.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { secureRng } from "@aphrody/shenron-activity";
import { PROTOCOL_VERSION } from "@aphrody/shenron-activity/protocol";
import { verifyReceipt } from "@aphrody/shenron-activity/quiz";
import type { RunningActivityServer } from "../src/server";
import { ActivityHub, newSocketState } from "../src/ws/hub";
import {
  correctChoice,
  INSTANCE,
  SECRET,
  startTestServer,
  TestClient,
  testBank,
  U1,
  U2,
  U3,
} from "./support";

const running: RunningActivityServer[] = [];
const clients: TestClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const server of running.splice(0)) await server.stop();
});

function start(...args: Parameters<typeof startTestServer>): RunningActivityServer {
  const server = startTestServer(...args);
  running.push(server);
  return server;
}

function connect(server: RunningActivityServer): TestClient {
  const next = new TestClient(server.url);
  clients.push(next);
  return next;
}

interface BotCall {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: unknown;
}

describe("the game socket", () => {
  test("three players play a round; the signed receipt reaches the bot and the room hears what was paid", async () => {
    const calls: BotCall[] = [];
    const server = start({
      settlerBackoffMs: () => 40,
      botFetch: (async (url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        calls.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
          body,
        });
        // The bot has not shipped the endpoint yet on the first call: the receipt must wait.
        if (calls.length === 1) return new Response("not found", { status: 404 });
        const receipt = body.receipt;
        // The bot's answer (ActivitySettleResponse); its daily budget trims the winner to 50.
        return Response.json({
          ok: true,
          instanceId: receipt.instanceId,
          roundId: receipt.roundId,
          replayed: false,
          totalGranted: 90,
          totalXp: 0,
          entries: receipt.entries.map(
            (entry: { userId: string; zeni: number; reason: string; idempotencyKey: string }) => ({
              userId: entry.userId,
              idempotencyKey: entry.idempotencyKey,
              status: "settled",
              requested: entry.zeni,
              granted: entry.zeni === 60 ? 50 : entry.zeni,
              reason: entry.zeni === 60 ? "daily_budget" : entry.reason,
              xp: 0,
              xpCapped: false,
              levelUp: false,
              newLevel: null,
              budgetLeft: 0,
            }),
          ),
        });
      }) as typeof fetch,
    });

    const a = connect(server);
    const b = connect(server);
    const c = connect(server);
    await a.hello("token-goku-1");
    const welcome = await a.waitFor("welcome");
    expect(welcome.you).toEqual({ userId: U1, role: "player" });
    expect(welcome.room.instanceId).toBe(INSTANCE);
    expect(welcome.room.hostId).toBe(U1);
    expect(welcome.room.phase).toBe("lobby");

    await b.hello("token-vegeta-2");
    await c.hello("token-bulma-3");
    await c.waitFor("welcome");
    // The first player sees the others arrive.
    await a.waitFor("roster", (m) => m.players.length === 3);
    const roster = a.of("roster").at(-1)!;
    expect(roster.players.map((p) => p.name)).toEqual(["Son Goku", "Vegeta", "Bulma"]);
    expect(roster.players[1]!.avatar).toBe("abc123");

    // Only the host may configure and start.
    b.send({ v: PROTOCOL_VERSION, type: "start" });
    expect((await b.waitFor("error")).code).toBe("not_host");
    a.send({ v: PROTOCOL_VERSION, type: "configure", config: { questionCount: 5 } });
    await a.waitFor("config", (m) => m.config.questionCount === 5);
    a.send({ v: PROTOCOL_VERSION, type: "start" });

    for (let index = 0; index < 5; index++) {
      const { question } = await a.waitFor("question", (m) => m.question.index === index);
      const right = correctChoice(question);
      // The question that players see carries neither the answer nor its source.
      expect(JSON.stringify(question)).not.toContain("lexicon");
      a.send({
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: question.roundId,
        index,
        choice: right,
      });
      await a.waitFor("answer_ack", (m) => m.index === index);
      await Bun.sleep(300);
      b.send({
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: question.roundId,
        index,
        choice: right,
      });
      c.send({
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: question.roundId,
        index,
        choice: (right + 1) % 4,
      });
      const { reveal } = await c.waitFor("reveal", (m) => m.reveal.index === index);
      expect(reveal.correct).toBe(right);
    }

    const results = await c.waitFor("results");
    expect(results.ranking.map((entry) => entry.userId)).toEqual([U1, U2, U3]);

    // The bot first answers 404, then accepts: the room is told what was really paid.
    const settled = await a.waitFor("settled");
    expect(settled.settled.rewards.map((r) => [r.userId, r.zeni, r.reason])).toEqual([
      [U1, 50, "daily_budget"],
      [U2, 40, "podium"],
      [U3, 0, "no_points"],
    ]);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]!.url).toBe("http://bot.test/api/activity/settle");
    // The service token travels as a bearer, on every attempt.
    expect(calls.map((call) => call.authorization)).toEqual(
      calls.map(() => "Bearer service-token-1"),
    );

    // What reached the bot is a receipt the bot can verify with the shared secret.
    const verdict = await verifyReceipt(calls.at(-1)!.body, SECRET, { now: Date.now() });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.receipt.instanceId).toBe(INSTANCE);
    expect(verdict.receipt.entries.map((e) => [e.userId, e.zeni])).toEqual([
      [U1, 60],
      [U2, 40],
      [U3, 0],
    ]);
    // Idempotent: both attempts name the same payments.
    const keys = (call: BotCall) =>
      (call.body as { receipt: { entries: { idempotencyKey: string }[] } }).receipt.entries.map(
        (e) => e.idempotencyKey,
      );
    expect(keys(calls[0]!)).toEqual(keys(calls.at(-1)!));
    // Nobody ever saw the signature or the secret on the wire.
    for (const message of [...a.messages, ...b.messages, ...c.messages])
      expect(JSON.stringify(message)).not.toContain("signature");
    expect(server.settler.pending).toBe(0);
  });

  test("a socket that does not say hello, or says it wrong, is closed", async () => {
    const server = start();
    const silent = connect(server);
    await silent.opened;
    silent.socket.send("not json");
    expect((await silent.closed).code).toBe(4400);

    const stranger = connect(server);
    await stranger.hello("token-unknown-9");
    expect((await stranger.closed).code).toBe(4401);

    const invalidInstance = connect(server);
    await invalidInstance.opened;
    invalidInstance.socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "hello",
        token: "token-goku-1",
        instanceId: "a b",
      }),
    );
    expect((await invalidInstance.closed).code).toBe(4400);
  });

  test("a hello that never comes times out", async () => {
    const hub = new ActivityHub({
      discord: {
        exchangeCode: async () => ({ ok: false, reason: "invalid_code" }),
        identify: async () => null,
      },
      bank: testBank(),
      rng: secureRng(),
      helloTimeoutMs: 20,
    });
    let closedWith = 0;
    hub.open({
      send: () => 1,
      close: (code) => {
        closedWith = code ?? 0;
      },
      data: newSocketState(),
    });
    await Bun.sleep(80);
    expect(closedWith).toBe(4408);
    hub.stop();
  });

  test("invalid frames get an error; an oversized frame closes the socket", async () => {
    const server = start();
    const a = connect(server);
    await a.hello("token-goku-1");
    await a.waitFor("welcome");
    a.socket.send("{broken");
    expect((await a.waitFor("error")).code).toBe("invalid_message");
    a.socket.send(JSON.stringify({ v: 99, type: "ping" }));
    await a.waitFor("error", (m) => m.code === "unsupported_protocol");
    // A smuggled field (here an XP amount) is rejected, not ignored.
    a.socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        type: "answer",
        roundId: "x-1",
        index: 0,
        choice: 0,
        xp: 9999,
      }),
    );
    await Bun.sleep(30);
    expect(a.of("error").map((e) => e.code)).toEqual([
      "invalid_message",
      "unsupported_protocol",
      "invalid_message",
    ]);
    // A frame above the size limit is refused by the transport itself.
    a.socket.send("x".repeat(5_000));
    expect((await a.closed).code).toBeGreaterThan(0);
  });

  test("a second window of the same member replaces the first", async () => {
    const server = start();
    const first = connect(server);
    await first.hello("token-goku-1");
    await first.waitFor("welcome");
    const second = connect(server);
    await second.hello("token-goku-1");
    await second.waitFor("welcome");
    expect((await first.closed).code).toBe(4409);
    // The member kept their seat: still one player.
    expect(second.of("welcome")[0]!.room.players.map((p) => p.userId)).toEqual([U1]);
    expect(server.hub.stats.sockets).toBe(1);
  });

  test("the host can kick a member, who is then refused", async () => {
    const server = start();
    const a = connect(server);
    const b = connect(server);
    await a.hello("token-goku-1");
    await b.hello("token-vegeta-2");
    await b.waitFor("welcome");
    await a.waitFor("roster", (m) => m.players.length === 2);
    a.send({ v: PROTOCOL_VERSION, type: "kick", userId: U2 });
    expect((await b.waitFor("kicked")).reason).toBe("host");
    expect((await b.closed).code).toBe(4403);
    const again = connect(server);
    await again.hello("token-vegeta-2");
    expect((await again.closed).reason).toBe("banned");
  });

  test("a departure is announced and the host passes on", async () => {
    const server = start();
    const a = connect(server);
    const b = connect(server);
    await a.hello("token-goku-1");
    await b.hello("token-vegeta-2");
    await b.waitFor("welcome");
    a.close();
    const roster = await b.waitFor("roster", (m) => m.hostId === U2);
    // In the lobby a departing member leaves no seat behind.
    expect(roster.players.map((p) => p.userId)).toEqual([U2]);
  });

  test("a stopped server tells its rooms before closing", async () => {
    const server = start();
    const a = connect(server);
    await a.hello("token-goku-1");
    await a.waitFor("welcome");
    await server.stop();
    running.splice(running.indexOf(server), 1);
    expect((await a.waitFor("closed")).reason).toBe("shutdown");
  });
});
