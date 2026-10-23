// SPDX-License-Identifier: Apache-2.0
import type { Locale } from "@aphrody/shenron-activity/protocol";
import { closeLabel, kickLabel, translator, type UiKey } from "../i18n";
import type { GameState } from "../state";
import { DragonBall, Header } from "../ui";

const FAILURE_TEXT: Record<string, UiKey> = {
  outside: "fail.outside",
  config: "fail.config",
  auth: "fail.auth",
  server: "fail.server",
  replaced: "fail.replaced",
  refused: "fail.refused",
  closed: "fail.closed",
};

const STEP_TEXT = {
  sdk: "boot.sdk",
  auth: "boot.auth",
  room: "boot.room",
} as const satisfies Record<string, UiKey>;

/** What the member reads while the Activity opens, and when it cannot. */
export function BootScreen({
  state,
  locale,
  onRetry,
  mock,
}: {
  state: GameState;
  locale: Locale;
  onRetry: () => void;
  mock: boolean;
}) {
  const t = translator(locale);
  const failure = state.failure;
  if (failure) {
    const detail =
      failure.kind === "kicked"
        ? kickLabel(locale, failure.reason)
        : failure.kind === "roomClosed"
          ? closeLabel(locale, failure.reason)
          : t(FAILURE_TEXT[failure.kind] ?? "fail.server");
    const canRetry =
      failure.kind === "server" ||
      failure.kind === "auth" ||
      failure.kind === "config" ||
      failure.kind === "replaced" ||
      failure.kind === "roomClosed" ||
      failure.kind === "closed";
    return (
      <main className="screen boot" tabIndex={-1} aria-labelledby="boot-title">
        <Header locale={locale} />
        <section className="panel notice-card" role="alert">
          <h2 id="boot-title" className="notice-card__title">
            {t("fail.title")}
          </h2>
          <p className="notice-card__text">{detail}</p>
          {canRetry ? (
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              {failure.kind === "roomClosed" ? t("fail.rejoin") : t("fail.retry")}
            </button>
          ) : null}
        </section>
      </main>
    );
  }
  const step = state.bootStep ?? "room";
  return (
    <main className="screen boot" tabIndex={-1} aria-busy="true" aria-labelledby="boot-title">
      <Header locale={locale} />
      <section className="panel notice-card">
        <div className="spinner" aria-hidden="true">
          <DragonBall stars={1} size={56} />
        </div>
        <h2 id="boot-title" className="notice-card__title">
          {t("boot.connecting")}
        </h2>
        <p className="notice-card__text">{t(STEP_TEXT[step])}</p>
        {mock ? <p className="chip chip--ki">{t("boot.mock")}</p> : null}
      </section>
    </main>
  );
}
