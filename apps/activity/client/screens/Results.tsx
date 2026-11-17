// SPDX-License-Identifier: Apache-2.0
import type {
  Locale,
  PlayerPublic,
  RankingEntry,
  Settled,
} from "@aphrody/shenron-activity/protocol";
import { formatNumber, rewardLabel, translator, type Translate } from "../i18n";
import { isHost, type GameState } from "../state";
import { Avatar, DragonBall, Header, ZeniCoin } from "../ui";

/** Podium order on screen: second, first, third. */
const PODIUM_ORDER = [1, 0, 2] as const;

function zeniOf(settled: Settled | null, userId: string): number | null {
  const line = settled?.rewards.find((reward) => reward.userId === userId);
  return line ? line.zeni : null;
}

function Podium({
  ranking,
  players,
  settled,
  locale,
  t,
}: {
  ranking: readonly RankingEntry[];
  players: ReadonlyMap<string, PlayerPublic>;
  settled: Settled | null;
  locale: Locale;
  t: Translate;
}) {
  // Competition ranking: a shared rank (1, 1, 3) fills both first places.
  // Nobody stands on the podium with an empty score; they stay in the full ranking below.
  const top = ranking.filter((entry) => entry.rank <= 3 && entry.score > 0).slice(0, 3);
  return (
    <ol className="podium" aria-label={t("results.podium")}>
      {PODIUM_ORDER.map((slot) => {
        const entry = top[slot];
        if (!entry)
          return <li key={slot} className={`podium__slot podium__slot--${slot + 1} is-empty`} />;
        const player = players.get(entry.userId);
        const zeni = zeniOf(settled, entry.userId);
        return (
          <li
            key={entry.userId}
            className={`podium__slot podium__slot--${Math.min(3, entry.rank)}`}
          >
            <Avatar
              userId={entry.userId}
              name={player?.name ?? "?"}
              avatar={player?.avatar ?? null}
              size={64}
            />
            <span className="podium__name">{player?.name ?? "?"}</span>
            <div className="podium__block">
              <DragonBall stars={Math.min(7, entry.rank)} size={44} />
              <span className="podium__rank">
                {t("results.rank", { rank: formatNumber(locale, entry.rank) })}
              </span>
              <span className="podium__score">
                {t("score.points", { score: formatNumber(locale, entry.score) })}
              </span>
              {zeni !== null && zeni > 0 ? (
                <span className="podium__zeni">
                  <ZeniCoin size={18} />
                  {formatNumber(locale, zeni)}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ResultsScreen({
  state,
  locale,
  onPlayAgain,
}: {
  state: GameState;
  locale: Locale;
  onPlayAgain: () => void;
}) {
  const t = translator(locale);
  const room = state.room!;
  const players = new Map(room.players.map((player) => [player.userId, player]));
  const you = state.you?.userId ?? "";
  const mine = room.ranking.find((entry) => entry.userId === you) ?? null;
  const settled = room.settled;
  const myLine = settled?.rewards.find((reward) => reward.userId === you) ?? null;
  const host = isHost(state);

  return (
    <main className="screen results" tabIndex={-1} aria-labelledby="results-title">
      <Header locale={locale} />
      <h2 id="results-title" className="section-title">
        {t("results.heading")}
      </h2>

      <Podium ranking={room.ranking} players={players} settled={settled} locale={locale} t={t} />

      <div className="results__grid">
        <section className="panel yours" aria-labelledby="yours-title">
          <h3 id="yours-title" className="panel__title">
            {t("results.yourScore")}
          </h3>
          {mine ? (
            <>
              <p className="yours__score">
                <span className="yours__rank">
                  {t("results.rank", { rank: formatNumber(locale, mine.rank) })}
                </span>
                {t("score.points", { score: formatNumber(locale, mine.score) })}
              </p>
              <p className="hint">
                {t("results.correct", {
                  correct: formatNumber(locale, mine.correct),
                  answered: formatNumber(
                    locale,
                    Math.max(mine.answered, room.config.questionCount),
                  ),
                })}
              </p>
            </>
          ) : null}
          <h3 className="panel__title panel__title--sub">{t("results.zeni")}</h3>
          <output className="yours__zeni" aria-live="polite">
            {settled === null ? (
              <span className="hint">{t("results.zeniPending")}</span>
            ) : myLine && myLine.zeni > 0 ? (
              <>
                <ZeniCoin size={28} />
                <strong>
                  {t("results.zeniAmount", { amount: formatNumber(locale, myLine.zeni) })}
                </strong>
              </>
            ) : (
              <span className="hint">
                {t("results.zeniNone")}
                {myLine ? ` ${rewardLabel(locale, myLine.reason)}` : ""}
              </span>
            )}
          </output>
          {host ? (
            <button type="button" className="btn btn--primary btn--wide" onClick={onPlayAgain}>
              {t("results.playAgain")}
            </button>
          ) : (
            <p className="hint">{t("results.waitHost")}</p>
          )}
        </section>

        <section className="panel ranking" aria-labelledby="ranking-title">
          <h3 id="ranking-title" className="panel__title">
            {t("results.ranking")}
          </h3>
          <ol className="standings__list">
            {room.ranking.map((entry) => {
              const player = players.get(entry.userId);
              const zeni = zeniOf(settled, entry.userId);
              return (
                <li
                  key={entry.userId}
                  className={`standing ${entry.userId === you ? "is-you" : ""}`}
                >
                  <span className="standing__rank">{formatNumber(locale, entry.rank)}</span>
                  <Avatar
                    userId={entry.userId}
                    name={player?.name ?? "?"}
                    avatar={player?.avatar ?? null}
                    size={32}
                  />
                  <span className="standing__name">{player?.name ?? "?"}</span>
                  {zeni !== null && zeni > 0 ? (
                    <span className="standing__zeni">
                      <ZeniCoin size={16} />
                      {formatNumber(locale, zeni)}
                    </span>
                  ) : null}
                  <span className="standing__score">
                    {t("score.points", { score: formatNumber(locale, entry.score) })}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}
