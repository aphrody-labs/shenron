// SPDX-License-Identifier: Apache-2.0
import {
  PROTOCOL_LIMITS,
  type Locale,
  type PlayerPublic,
  type QuizCategory,
} from "@aphrody/shenron-activity/protocol";
import { categoryLabel, formatNumber, translator, type Translate } from "../i18n";
import { isHost, type GameState } from "../state";
import { Avatar, Header } from "../ui";

interface LobbyProps {
  state: GameState;
  locale: Locale;
  onConfigure: (patch: { questionCount?: number; categories?: QuizCategory[] }) => void;
  onStart: () => void;
  onKick: (userId: string) => void;
  onInvite: () => void;
  onWatchTogether?: () => void;
}

function statusLabel(t: Translate, player: PlayerPublic): string | null {
  if (player.status === "away") return t("lobby.away");
  if (player.status === "offline") return t("lobby.offline");
  return null;
}

function PlayerRow({
  player,
  you,
  host,
  canKick,
  t,
  onKick,
}: {
  player: PlayerPublic;
  you: boolean;
  host: boolean;
  canKick: boolean;
  t: Translate;
  onKick: (userId: string) => void;
}) {
  const status = statusLabel(t, player);
  return (
    <li className={`member ${status ? "is-muted" : ""}`}>
      <Avatar userId={player.userId} name={player.name} avatar={player.avatar} size={44} />
      <span className="member__name">{player.name}</span>
      <span className="member__tags">
        {host ? <span className="chip chip--gold">{t("lobby.host")}</span> : null}
        {you ? <span className="chip chip--ki">{t("lobby.you")}</span> : null}
        {status ? <span className="chip">{status}</span> : null}
      </span>
      {canKick ? (
        <button
          type="button"
          className="icon-btn"
          onClick={() => onKick(player.userId)}
          aria-label={t("lobby.kick", { name: player.name })}
          title={t("lobby.kick", { name: player.name })}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </li>
  );
}

export function LobbyScreen({
  state,
  locale,
  onConfigure,
  onStart,
  onKick,
  onInvite,
  onWatchTogether,
}: LobbyProps) {
  const t = translator(locale);
  const room = state.room!;
  const host = isHost(state);
  const you = state.you?.userId;
  const fighters = room.players.filter((player) => player.role === "player");
  const watchers = room.players.filter((player) => player.role === "spectator");
  const { questionCount, categories } = room.config;
  const none = categories.length === 0;

  const toggle = (category: QuizCategory) => {
    const next = categories.includes(category)
      ? categories.filter((item) => item !== category)
      : [...categories, category];
    if (next.length > 0) onConfigure({ categories: next });
  };

  return (
    <main className="screen lobby" tabIndex={-1} aria-labelledby="lobby-title">
      <Header
        locale={locale}
        aside={
          <div className="lobby__actions">
            {onWatchTogether && (
              <button type="button" className="btn btn--ghost" onClick={onWatchTogether}>
                {t("watch.modeWatch")}
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={onInvite}>
              {t("lobby.invite")}
            </button>
          </div>
        }
      />
      <h2 id="lobby-title" className="sr-only">
        {t("lobby.heading")}
      </h2>

      <div className="lobby__grid">
        <section className="panel roster" aria-labelledby="roster-title">
          <h3 id="roster-title" className="panel__title">
            {t("lobby.players", { count: String(fighters.length), max: String(room.maxPlayers) })}
          </h3>
          <ul className="members">
            {fighters.map((player) => (
              <PlayerRow
                key={player.userId}
                player={player}
                you={player.userId === you}
                host={player.userId === room.hostId}
                canKick={host && player.userId !== you}
                t={t}
                onKick={onKick}
              />
            ))}
          </ul>
          {watchers.length > 0 ? (
            <>
              <h3 className="panel__title panel__title--sub">
                {t("lobby.spectators", { count: String(watchers.length) })}
              </h3>
              <ul className="members members--compact">
                {watchers.map((player) => (
                  <PlayerRow
                    key={player.userId}
                    player={player}
                    you={player.userId === you}
                    host={false}
                    canKick={host && player.userId !== you}
                    t={t}
                    onKick={onKick}
                  />
                ))}
              </ul>
            </>
          ) : null}
          {state.you?.role === "spectator" ? (
            <p className="hint">{t("lobby.spectatorNote")}</p>
          ) : null}
        </section>

        <section className="panel settings" aria-labelledby="settings-title">
          <h3 id="settings-title" className="panel__title">
            {t("lobby.settings")}
          </h3>

          <div className="field">
            <span className="field__label" id="count-label">
              {t("lobby.questions")}
            </span>
            <fieldset className="stepper" aria-labelledby="count-label">
              <button
                type="button"
                className="icon-btn"
                disabled={!host || questionCount <= PROTOCOL_LIMITS.questionCountMin}
                onClick={() => onConfigure({ questionCount: questionCount - 1 })}
                aria-label={t("lobby.questionsLess")}
              >
                <span aria-hidden="true">−</span>
              </button>
              <output className="stepper__value" aria-live="polite">
                {formatNumber(locale, questionCount)}
              </output>
              <button
                type="button"
                className="icon-btn"
                disabled={!host || questionCount >= PROTOCOL_LIMITS.questionCountMax}
                onClick={() => onConfigure({ questionCount: questionCount + 1 })}
                aria-label={t("lobby.questionsMore")}
              >
                <span aria-hidden="true">+</span>
              </button>
            </fieldset>
          </div>

          <div className="field">
            <span className="field__label" id="categories-label">
              {t("lobby.categories")}
            </span>
            <fieldset className="chips" aria-labelledby="categories-label">
              {room.availableCategories.map((category) => {
                const on = categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className={`toggle ${on ? "is-on" : ""}`}
                    aria-pressed={on}
                    disabled={!host}
                    onClick={() => toggle(category)}
                  >
                    {categoryLabel(locale, category)}
                  </button>
                );
              })}
            </fieldset>
            {none ? <p className="hint hint--warn">{t("lobby.pickCategory")}</p> : null}
          </div>

          {host ? (
            <button
              type="button"
              className="btn btn--primary btn--wide"
              onClick={onStart}
              disabled={none || state.you?.role !== "player"}
            >
              {t("lobby.start")}
            </button>
          ) : (
            <output className="hint">
              {t("lobby.waitHost")} {t("lobby.hostOnly")}
            </output>
          )}
          {fighters.length < 2 ? <p className="hint">{t("lobby.solo")}</p> : null}
        </section>
      </div>
    </main>
  );
}
