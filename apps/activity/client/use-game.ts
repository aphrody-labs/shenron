// SPDX-License-Identifier: Apache-2.0
/**
 * Boots the Activity and exposes the game to the screens.
 *
 *   createSdk -> ready -> authorize -> POST /api/token -> authenticate -> socket (hello, welcome)
 *
 * Every step that can fail maps to a `Failure` the boot screen explains. The socket keeps
 * reconnecting by itself; redoing the whole sequence (new token, new socket) is done by mounting the
 * hook again (`App` keys it).
 */
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type Locale,
  type QuizConfigPatch,
} from "@aphrody/shenron-activity/protocol";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { resolveLocale } from "./i18n";
import {
  createSdk,
  NotConfiguredError,
  OutsideDiscordError,
  socketUrl,
  type ActivitySdk,
} from "./sdk";
import { GameConnection } from "./socket";
import { initialState, reduce, type Failure, type GameState } from "./state";

/** Set at build time: `true` only in development builds. */
declare const __ACTIVITY_MOCK__: boolean;

export interface GameApi {
  readonly state: GameState;
  readonly locale: Locale;
  readonly sdk: ActivitySdk | null;
  answer(index: number, choice: number): void;
  configure(patch: QuizConfigPatch): void;
  start(): void;
  playAgain(): void;
  kick(userId: string): void;
  invite(): void;
  dismissNotice(): void;
}

async function exchange(apiBase: string, code: string): Promise<string> {
  const response = await fetch(`${apiBase}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (response.status === 503) throw new NotConfiguredError();
  if (!response.ok) throw new Error(`token exchange failed (${response.status})`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("token exchange returned no token");
  return body.access_token;
}

function failureOf(error: unknown): Failure {
  if (error instanceof OutsideDiscordError) return { kind: "outside" };
  if (error instanceof NotConfiguredError) return { kind: "config" };
  if (error instanceof TypeError) return { kind: "server" };
  return { kind: "auth" };
}

export function useGame(): GameApi {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(navigator.language));
  const [sdk, setSdk] = useState<ActivitySdk | null>(null);
  const connection = useRef<GameConnection | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stopBots: (() => void) | null = null;
    let botsStarted = false;
    dispatch({ type: "boot", step: "sdk" });

    (async () => {
      const next = await createSdk();
      if (cancelled) return;
      setSdk(next);
      await next.ready();
      const discordLocale = await next.locale();
      if (cancelled) return;
      setLocale(resolveLocale(discordLocale ?? navigator.language));

      dispatch({ type: "boot", step: "auth" });
      const token = await exchange(next.apiBase, await next.authorize());
      await next.authenticate(token);
      if (cancelled) return;

      const url = socketUrl(window.location, next.apiBase);
      const socket = new GameConnection({
        url,
        token,
        instanceId: next.instanceId,
        guildId: next.guildId,
        handlers: {
          onMessage(message) {
            dispatch({ type: "server", message, receivedAt: Date.now() });
            if (
              __ACTIVITY_MOCK__ &&
              message.type === "welcome" &&
              next.mock &&
              next.mock.bots > 0 &&
              !botsStarted
            ) {
              botsStarted = true;
              const mock = next.mock;
              void (async () => {
                const { startMockBots } = await import("./mock-bots");
                if (cancelled) return;
                stopBots = startMockBots({
                  url,
                  instanceId: next.instanceId,
                  humanSlot: mock.slot,
                  count: mock.bots,
                  fast: mock.fast,
                });
              })();
            }
          },
          onOpen: () => dispatch({ type: "connecting" }),
          onLost: () => dispatch({ type: "socketLost" }),
          onFatal: (failure) => dispatch({ type: "fail", failure }),
        },
      });
      connection.current = socket;
      dispatch({ type: "boot", step: "room" });
      socket.start();
    })().catch((error: unknown) => {
      if (!cancelled) dispatch({ type: "fail", failure: failureOf(error) });
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") connection.current?.ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      stopBots?.();
      connection.current?.stop();
      connection.current = null;
    };
  }, []);

  // The page language and title follow the member's Discord language.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const send = useCallback((message: ClientMessage) => {
    connection.current?.send(message);
  }, []);

  const roundId = state.room?.question?.roundId ?? null;
  const answer = useCallback(
    (index: number, choice: number) => {
      if (roundId === null) return;
      dispatch({ type: "localAnswer", index, choice });
      send({ v: PROTOCOL_VERSION, type: "answer", roundId, index, choice });
    },
    [roundId, send],
  );
  const configure = useCallback(
    (config: QuizConfigPatch) => send({ v: PROTOCOL_VERSION, type: "configure", config }),
    [send],
  );
  const dismissNotice = useCallback(() => dispatch({ type: "dismissNotice" }), []);

  return {
    state,
    locale,
    sdk,
    answer,
    configure,
    start: () => send({ v: PROTOCOL_VERSION, type: "start" }),
    playAgain: () => send({ v: PROTOCOL_VERSION, type: "play_again" }),
    kick: (userId) => send({ v: PROTOCOL_VERSION, type: "kick", userId }),
    invite: () => void sdk?.invite(),
    dismissNotice,
  };
}
