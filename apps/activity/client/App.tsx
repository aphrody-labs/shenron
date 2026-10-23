// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { BootScreen } from "./screens/Boot";
import { LobbyScreen } from "./screens/Lobby";
import { ResultsScreen } from "./screens/Results";
import { RoundScreen } from "./screens/Round";
import { errorLabel, translator } from "./i18n";
import { Backdrop, Live } from "./ui";
import { useGame } from "./use-game";

/** Mounts the game; a restart (after a failure) mounts it again for a clean boot. */
export function App() {
  const [session, setSession] = useState(0);
  return <Game key={session} restart={() => setSession((value) => value + 1)} />;
}

function Game({ restart }: { restart: () => void }) {
  const game = useGame();
  const { state, locale } = game;
  const t = translator(locale);
  const room = state.room;
  const phase = room?.phase ?? null;
  const mock = game.sdk?.kind === "mock";

  useEffect(() => {
    document.title = translator(locale)("app.title");
  }, [locale]);

  // Transient notices (a refused action) disappear by themselves.
  useEffect(() => {
    if (!state.notice) return;
    const timer = setTimeout(game.dismissNotice, 4_000);
    return () => clearTimeout(timer);
  }, [state.notice, game.dismissNotice]);

  // A phase change is announced to screen readers and moves focus to the new screen, so keyboard
  // users do not keep focus on a button that has just disappeared. The first phase is not announced.
  const [seen, setSeen] = useState<{ phase: string | null; announcement: string }>({
    phase: null,
    announcement: "",
  });
  if (phase && seen.phase !== phase) {
    setSeen({
      phase,
      announcement: seen.phase === null ? "" : translator(locale)(`announce.${phase}` as const),
    });
  }
  useEffect(() => {
    if (seen.announcement)
      document.querySelector<HTMLElement>("main")?.focus({ preventScroll: true });
  }, [seen]);

  let screen;
  if (state.connection === "failed" || !room || !state.you) {
    screen = <BootScreen state={state} locale={locale} onRetry={restart} mock={mock} />;
  } else if (room.phase === "round" && room.question) {
    screen = <RoundScreen state={state} locale={locale} onAnswer={game.answer} />;
  } else if (room.phase === "results") {
    screen = <ResultsScreen state={state} locale={locale} onPlayAgain={game.playAgain} />;
  } else {
    screen = (
      <LobbyScreen
        state={state}
        locale={locale}
        onConfigure={game.configure}
        onStart={game.start}
        onKick={game.kick}
        onInvite={game.invite}
      />
    );
  }

  return (
    <>
      <Backdrop />
      {screen}
      {state.connection === "reconnecting" ? (
        <output className="banner">{t("net.reconnecting")}</output>
      ) : null}
      {state.notice ? (
        <p className="toast" role="alert">
          {errorLabel(locale, state.notice)}
        </p>
      ) : null}
      <Live>{seen.announcement}</Live>
    </>
  );
}
