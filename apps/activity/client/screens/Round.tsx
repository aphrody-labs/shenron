// SPDX-License-Identifier: Apache-2.0
import { CHOICE_COUNT, type Locale, type PlayerPublic } from "@aphrody/shenron-activity/protocol";
import { useEffect } from "react";
import { categoryLabel, formatNumber, translator, type Translate } from "../i18n";
import { answerOf, msLeft, pointsOf, selectedChoice, type GameState } from "../state";
import { Avatar, Header, useNow } from "../ui";

const LETTERS = ["A", "B", "C", "D"] as const;

/** Keys that answer: 1-4 and A-D. */
export function choiceForKey(key: string): number | null {
  if (/^[1-4]$/.test(key)) return Number(key) - 1;
  const index = LETTERS.indexOf(key.toUpperCase() as (typeof LETTERS)[number]);
  return index >= 0 && key.length === 1 ? index : null;
}

function Standings({ state, locale, t }: { state: GameState; locale: Locale; t: Translate }) {
  const room = state.room!;
  const byId = new Map(room.players.map((player) => [player.userId, player]));
  // Before the first reveal there is no ranking yet: list the fighters with their (zero) score.
  const rows: Array<{ userId: string; rank: number | null; score: number }> =
    room.ranking.length > 0
      ? room.ranking.slice(0, 5)
      : room.players
          .filter((player) => player.role === "player")
          .slice(0, 5)
          .map((player) => ({ userId: player.userId, rank: null, score: player.score }));
  const you = room.ranking.find((entry) => entry.userId === state.you?.userId);
  if (you && !rows.some((row) => row.userId === you.userId)) rows.push(you);
  return (
    <section className="panel standings" aria-labelledby="standings-title">
      <h3 id="standings-title" className="panel__title">
        {t("round.leaderboard")}
      </h3>
      <ol className="standings__list">
        {rows.map((entry) => {
          const player = byId.get(entry.userId);
          return (
            <li
              key={entry.userId}
              className={`standing ${entry.userId === state.you?.userId ? "is-you" : ""}`}
            >
              <span className="standing__rank">
                {entry.rank === null ? "·" : formatNumber(locale, entry.rank)}
              </span>
              <Avatar
                userId={entry.userId}
                name={player?.name ?? "?"}
                avatar={player?.avatar ?? null}
                size={32}
              />
              <span className="standing__name">{player?.name ?? "?"}</span>
              <span className="standing__score">
                {t("score.points", { score: formatNumber(locale, entry.score) })}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function AnsweredRow({
  players,
  answered,
  expected,
  t,
}: {
  players: readonly PlayerPublic[];
  answered: readonly string[];
  expected: number;
  t: Translate;
}) {
  const done = new Set(answered);
  return (
    <div className="answered">
      <ul className="answered__avatars" aria-hidden="true">
        {players
          .filter((player) => player.role === "player")
          .map((player) => (
            <li key={player.userId} className={done.has(player.userId) ? "is-done" : ""}>
              <Avatar userId={player.userId} name={player.name} avatar={player.avatar} size={28} />
            </li>
          ))}
      </ul>
      <p className="answered__text">
        {t("round.answered", { count: String(answered.length), expected: String(expected) })}
      </p>
    </div>
  );
}

export function RoundScreen({
  state,
  locale,
  onAnswer,
}: {
  state: GameState;
  locale: Locale;
  onAnswer: (index: number, choice: number) => void;
}) {
  const t = translator(locale);
  const room = state.room!;
  const question = room.question;
  const revealing = room.step === "reveal";
  const now = useNow(!revealing && question !== null);
  const isPlayer = state.you?.role === "player";
  const selected = selectedChoice(room);
  const canAnswer = isPlayer && !revealing && selected === null && question !== null;

  useEffect(() => {
    if (!canAnswer || !question) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const choice = choiceForKey(event.key);
      if (choice !== null) onAnswer(question.index, choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAnswer, question, onAnswer]);

  if (!question) return null;
  const reveal = room.reveal;
  const total = Math.max(1, question.deadlineAt - question.startedAt);
  const left = revealing ? 0 : msLeft(state, now);
  const ratio = Math.min(1, left / total);
  const seconds = Math.ceil(left / 1000);
  const urgent = !revealing && left > 0 && left <= 5_000;

  const mine = answerOf(reveal, state.you?.userId);
  const points = pointsOf(reveal, state.you?.userId);
  const outcome = !revealing
    ? null
    : !isPlayer
      ? null
      : mine === null || mine === undefined
        ? "none"
        : mine === reveal?.correct
          ? "right"
          : "wrong";

  return (
    <main className="screen round" tabIndex={-1} aria-labelledby="question-title">
      <Header
        locale={locale}
        aside={
          <p className="chip chip--gold">
            {t("round.counter", {
              index: String(question.index + 1),
              total: String(question.total),
            })}
          </p>
        }
      />

      <div className="round__layout">
        <div className="round__main">
          <div className="round__meta">
            <span className="chip chip--ki">{categoryLabel(locale, question.category)}</span>
            <span
              className={`clock ${urgent ? "is-urgent" : ""}`}
              role="timer"
              aria-live="off"
              aria-label={revealing ? undefined : t("round.seconds", { seconds: String(seconds) })}
            >
              {revealing ? "" : t("round.seconds", { seconds: String(seconds) })}
            </span>
          </div>
          <div className={`timebar ${urgent ? "is-urgent" : ""}`} aria-hidden="true">
            <div className="timebar__fill" style={{ transform: `scaleX(${ratio})` }} />
          </div>

          <section className="panel prompt">
            <h2 id="question-title" className="prompt__text" lang={locale}>
              {question.prompt[locale]}
            </h2>
          </section>

          <fieldset className="choices" aria-labelledby="question-title">
            {question.choices.slice(0, CHOICE_COUNT).map((choice, index) => {
              const letter = LETTERS[index]!;
              const isSelected = selected === index;
              const isCorrect = revealing && reveal?.correct === index;
              const isWrong = revealing && isSelected && reveal?.correct !== index;
              const dim =
                (revealing && !isCorrect && !isWrong) ||
                (!revealing && selected !== null && !isSelected);
              const status = isCorrect
                ? "correct"
                : isWrong
                  ? "wrong"
                  : isSelected
                    ? "selected"
                    : "idle";
              return (
                <button
                  key={`${question.roundId}-${question.index}-${letter}`}
                  type="button"
                  className={`choice choice--${letter.toLowerCase()} is-${status} ${dim ? "is-dim" : ""}`}
                  disabled={!canAnswer}
                  aria-pressed={isSelected}
                  aria-label={`${t("round.choice", { letter })} : ${choice[locale]}`}
                  onClick={() => onAnswer(question.index, index)}
                  lang={locale}
                >
                  <span className="choice__letter" aria-hidden="true">
                    {letter}
                  </span>
                  <span className="choice__text">{choice[locale]}</span>
                  <span className="choice__mark" aria-hidden="true">
                    {isCorrect ? "✓" : isWrong ? "✗" : ""}
                  </span>
                </button>
              );
            })}
          </fieldset>

          <div className="round__foot" aria-live="polite">
            {outcome ? (
              <p className={`verdict verdict--${outcome}`}>
                <strong>
                  {outcome === "right"
                    ? t("round.correct")
                    : outcome === "wrong"
                      ? t("round.wrong")
                      : t("round.noAnswer")}
                </strong>
                {outcome === "right" ? (
                  <span className="verdict__points">
                    {t("round.points", { points: formatNumber(locale, points) })}
                  </span>
                ) : null}
                {outcome !== "right" && reveal ? (
                  <span>
                    {t("round.correctWas", { answer: question.choices[reveal.correct]![locale] })}
                  </span>
                ) : null}
              </p>
            ) : !isPlayer ? (
              <p className="hint">{t("round.spectating")}</p>
            ) : selected !== null ? (
              <p className="hint">{t("round.locked")}</p>
            ) : (
              <p className="hint">{t("round.hint")}</p>
            )}
            {reveal && reveal.source.type === "page" ? (
              <p className="source">
                {t("round.source")} : {reveal.source.title ?? new URL(reveal.source.url).hostname}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="round__side">
          <AnsweredRow
            players={room.players}
            answered={room.answered}
            expected={room.expected}
            t={t}
          />
          <Standings state={state} locale={locale} t={t} />
        </aside>
      </div>
    </main>
  );
}
