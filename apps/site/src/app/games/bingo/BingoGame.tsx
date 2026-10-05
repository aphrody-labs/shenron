"use client";

import { useState, useTransition } from "react";
import { sfx } from "@/lib/sfx";
import { KiShock } from "@/components/games/KiFx";
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, PANEL } from "@/components/games/planche";
import fx from "@/components/games/games.module.css";

type SessionStart = {
  token: string;
  ts: number;
  attempts: number;
  max: number;
  min: number;
};
type SessionContinue = {
  hint: "higher" | "lower";
  attempts: number;
  token: string;
  ts: number;
};
type SessionEnd = {
  hint: "match" | "lost";
  target: number;
  attempts: number;
  delta: number;
  balance: number;
};
type ApiError = { error: string };
type Reply = SessionStart | SessionContinue | SessionEnd | ApiError;

type Attempt = {
  guess: number;
  hint: "higher" | "lower" | "match" | "lost";
};

// Capteur de Ki : « plus haut » = la cible a un Ki supérieur (le signal monte).
// Écaille pour la cible trouvée, rouge étoile pour la partie perdue.
const HINT_LABEL = {
  higher: { txt: "Ki supérieur", color: "text-white" },
  lower: { txt: "Ki inférieur", color: "text-white" },
  match: { txt: "Ki verrouillé", color: "text-dbz-green" },
  lost: { txt: "Hors de portée", color: "text-dbz-red" },
} as const;

export function BingoGame() {
  const [stake, setStake] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [guess, setGuess] = useState("");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [ended, setEnded] = useState<SessionEnd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanPulse, setScanPulse] = useState(0);
  const [pending, startTransition] = useTransition();

  async function call(payload: { token?: string; guess?: number; stake?: number }): Promise<Reply> {
    const res = await fetch("/api/bot-user/games/bingo/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as Reply;
  }

  function reset() {
    setToken(null);
    setAttempts([]);
    setEnded(null);
    setError(null);
    setGuess("");
  }

  function startNew() {
    const parsedStake = stake ? Number(stake) : undefined;
    if (parsedStake !== undefined && (!Number.isFinite(parsedStake) || parsedStake < 1)) {
      setError("Mise refusée : entre un nombre entier de Zénis, 1 au minimum.");
      return;
    }
    startTransition(async () => {
      const reply = await call({ stake: parsedStake });
      if ("error" in reply) {
        setError(reply.error);
        return;
      }
      if ("token" in reply && "max" in reply) {
        reset();
        setToken(reply.token);
      }
    });
  }

  function submitGuess() {
    if (!token) return;
    const g = Number(guess);
    if (!Number.isInteger(g) || g < 1 || g > 100) {
      setError("Propose une puissance entière entre 1 et 100.");
      return;
    }
    sfx.click();
    startTransition(async () => {
      const reply = await call({ token, guess: g });
      if ("error" in reply) {
        setError(reply.error);
        return;
      }
      setError(null);
      setGuess("");
      setScanPulse((p) => p + 1);
      if ("target" in reply) {
        setAttempts((a) => [...a, { guess: g, hint: reply.hint }]);
        setEnded(reply);
        setToken(null);
        if (reply.hint === "match") sfx.win();
        else sfx.lose();
        return;
      }
      if ("hint" in reply && "token" in reply) {
        setAttempts((a) => [...a, { guess: g, hint: reply.hint }]);
        setToken(reply.token);
      }
    });
  }

  const lastHint = attempts[attempts.length - 1]?.hint;
  const shockColor = lastHint === "higher" ? "blue" : lastHint === "lower" ? "purple" : "orange";

  return (
    <div className="space-y-6">
      {!token && !ended && (
        <div className={`${PANEL} space-y-4 p-5 sm:p-6`}>
          <p className="text-sm text-white/75">
            Le bot cache une puissance entre 1 et 100. Tu as dix scans pour la trouver.
          </p>
          <label className="block">
            <span className="text-sm font-semibold text-white/85">
              Mise (optionnelle, en Zénis)
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="Par défaut : +100 en cas de victoire, −50 en cas de défaite"
              className={`${INPUT} mt-2 tabular-nums`}
              disabled={pending}
            />
          </label>
          <button
            type="button"
            onClick={startNew}
            disabled={pending}
            className={`${BTN_PRIMARY} w-full`}
          >
            {pending ? "Calibrage…" : "Lancer la partie"}
          </button>
        </div>
      )}

      {token && !ended && (
        <div className={`${PANEL} relative space-y-4 overflow-hidden p-5 sm:p-6`}>
          {/* Onde de scan : réponse à chaque mesure envoyée. */}
          <KiShock trigger={scanPulse || null} color={shockColor} />
          <div className="relative z-10 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm tabular-nums text-white/70">Scans : {attempts.length} sur 10</p>
            <p className="text-sm font-semibold" aria-live="polite">
              {lastHint ? (
                <span className={HINT_LABEL[lastHint].color}>{HINT_LABEL[lastHint].txt}</span>
              ) : (
                <span className="text-white/70">Aucun signal, lance un premier scan.</span>
              )}
            </p>
          </div>
          <div
            className="relative z-10 flex gap-1"
            role="img"
            aria-label={`Scans : ${attempts.length} sur 10`}
          >
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                aria-hidden
                className={`h-2 flex-1 rounded-full border ${
                  i < attempts.length ? "border-dbz-orange bg-dbz-orange" : "border-white/12"
                }`}
              />
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitGuess();
            }}
            className="relative z-10 flex gap-2"
          >
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              aria-label="Puissance estimée, de 1 à 100"
              placeholder="De 1 à 100"
              className={`${INPUT} flex-1 text-center text-xl tabular-nums`}
              disabled={pending}
            />
            <button type="submit" disabled={pending || !guess} className={BTN_PRIMARY}>
              Scanner
            </button>
          </form>
        </div>
      )}

      {ended && (
        <div
          role="status"
          className={`${PANEL} relative overflow-hidden border-l-4 p-5 sm:p-6 ${
            ended.hint === "match" ? "border-l-dbz-green" : `border-l-dbz-red ${fx.shake}`
          }`}
        >
          {/* Ki verrouillé → flash écaille ; signal perdu → tremblement. */}
          <KiShock
            trigger={ended.hint === "match" ? `win-${ended.target}` : null}
            color="green"
            flash
          />
          <div className="relative z-10 mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span
              className={`font-display text-3xl font-bold ${ended.hint === "match" ? "text-dbz-green" : "text-dbz-red"}`}
            >
              {ended.hint === "match" ? "Ki verrouillé" : "Signal perdu"}
            </span>
            <span className="text-sm tabular-nums text-white/70">Solde : {ended.balance} Ƶ</span>
          </div>
          <p className="relative z-10 text-sm text-white/80">
            Puissance cible :{" "}
            <span className="text-lg font-bold tabular-nums text-white">{ended.target}</span>
          </p>
          <p className="relative z-10 text-sm tabular-nums text-white/70">
            {ended.attempts} scan{ended.attempts > 1 ? "s" : ""} joué{ended.attempts > 1 ? "s" : ""}
          </p>
          {ended.delta !== 0 && (
            <p
              className={`relative z-10 mt-2 text-xl font-bold tabular-nums ${ended.delta > 0 ? "text-dbz-green" : "text-dbz-red"}`}
            >
              {ended.delta > 0 ? "+" : ""}
              {ended.delta} Ƶ
            </p>
          )}
          <button type="button" onClick={reset} className={`${BTN_SECONDARY} relative z-10 mt-4`}>
            Rejouer
          </button>
        </div>
      )}

      {attempts.length > 0 && (
        <div className={`${PANEL} p-4`}>
          <h3 className="mb-2 text-sm font-semibold text-white/85">Journal des scans</h3>
          <ol className="max-h-40 space-y-1 overflow-y-auto text-sm tabular-nums">
            {attempts.map((a, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-6 text-white/60">{i + 1}</span>
                <span className="w-10 text-right font-bold text-white">{a.guess}</span>
                <span className={HINT_LABEL[a.hint].color}>{HINT_LABEL[a.hint].txt}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && (
        <p role="alert" className={`${PANEL} border-l-4 border-l-dbz-red p-4 text-sm text-white`}>
          {error}
        </p>
      )}
    </div>
  );
}
