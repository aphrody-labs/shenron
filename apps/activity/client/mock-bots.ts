// SPDX-License-Identifier: Apache-2.0
/**
 * Simulated opponents of the `?mock=1` mode: each one is a real socket to the development server,
 * seated under a fixed character, answering at random after a human-like delay. They exist so that
 * one browser window shows a populated lobby, live "answered" indicators and a real podium.
 */
import {
  PROTOCOL_VERSION,
  type PublicQuestion,
  type ServerMessage,
} from "@aphrody/shenron-activity/protocol";
import { GameConnection } from "./socket";

export interface MockBotsOptions {
  readonly url: string;
  readonly instanceId: string;
  /** The character the human window plays; bots take the other slots in order. */
  readonly humanSlot: number;
  readonly count: number;
  /** Answer within a second instead of 1.5 to 7 seconds. */
  readonly fast?: boolean;
}

export function startMockBots(options: MockBotsOptions): () => void {
  const slots: number[] = [];
  for (let slot = 1; slots.length < options.count && slot <= 8; slot++)
    if (slot !== options.humanSlot) slots.push(slot);

  const connections = slots.map((slot) => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const connection: GameConnection = new GameConnection({
      url: options.url,
      token: `dev-token-${slot}`,
      instanceId: options.instanceId,
      guildId: null,
      handlers: {
        onMessage(message: ServerMessage) {
          if (message.type !== "question") return;
          answerLater(message.question);
        },
        onOpen() {},
        onLost() {},
        onFatal() {},
      },
    });

    function answerLater(question: PublicQuestion): void {
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          connection.send({
            v: PROTOCOL_VERSION,
            type: "answer",
            roundId: question.roundId,
            index: question.index,
            choice: Math.floor(Math.random() * 4),
          });
        },
        options.fast ? 250 + Math.random() * 600 : 1_500 + Math.random() * 5_500,
      );
      timers.add(timer);
    }

    connection.start();
    return { connection, timers };
  });

  return () => {
    for (const { connection, timers } of connections) {
      for (const timer of timers) clearTimeout(timer);
      connection.stop();
    }
  };
}
