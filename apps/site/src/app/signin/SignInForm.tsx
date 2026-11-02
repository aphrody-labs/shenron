/* oxlint-disable react/set-state-in-effect -- the browser callback URL is unavailable during server rendering */
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { sanitizeInternalPath } from "@aphrody/shenron-config/favorites";
import { Cadenas, DragonBall, Oeil } from "@aphrody/shenron-ui/icones";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";
import { storePasswordResetEmail } from "@/lib/password-reset-prefill";

/**
 * Passkeys stay hidden until their tables exist in production (backend owner, 2026-11-02);
 * flip this once the migration is applied.
 */
const PASSKEY_ENABLED = false;

type Props = { googleEnabled: boolean; emailSendingEnabled: boolean };
type Feedback = { tone: "error" | "notice"; text: string } | null;

const OAUTH_ORIGINS: Record<string, string> = {
  discord: "https://discord.com",
  google: "https://accounts.google.com",
};

/** Champ du formulaire : 16 px (pas de zoom iOS), 48 px de haut, bordure 1 px du kit. */
const FIELD =
  "min-h-12 w-full rounded-xl border border-dbz-border bg-dbz-bg px-4 text-base text-white placeholder:text-white/50 transition-colors focus:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange";
const SECONDARY = "toriyama-btn-secondary w-full normal-case tracking-normal";
const TEXT_LINK =
  "inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4 hover:text-dbz-yellow disabled:cursor-not-allowed disabled:opacity-50";

export default function SignInForm({ googleEnabled, emailSendingEnabled }: Props) {
  const t = useT();
  const id = useId();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [callbackURL, setCallbackURL] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackURL(sanitizeInternalPath(params.get("callbackURL"), 300) ?? "/dashboard");
    if (params.has("error")) setFeedback({ tone: "error", text: t("auth.signin.oauthError") });
    else if (params.has("verified"))
      setFeedback({ tone: "notice", text: t("auth.signin.verified") });
  }, [t]);

  // An error is announced and receives focus so keyboard users land on it.
  useEffect(() => {
    if (feedback?.tone === "error") feedbackRef.current?.focus();
  }, [feedback]);

  const fail = (key: string) => setFeedback({ tone: "error", text: t(key) });

  async function social(provider: "discord" | "google") {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: "/signin?error=oauth_failed",
      });
      const url = result.data?.url;
      if (result.error || !result.data?.redirect || !url) throw new Error("oauth");
      const target = new URL(url);
      if (target.origin !== OAUTH_ORIGINS[provider]) throw new Error("oauth");
      window.location.assign(target.toString());
    } catch {
      fail("auth.signin.oauthError");
      setLoading(false);
    }
  }

  async function signInPasskey() {
    setLoading(true);
    setFeedback(null);
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) throw new Error("passkey");
      window.location.assign(callbackURL);
    } catch {
      fail("auth.signin.passkeyError");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      if (mode === "signin") window.sessionStorage.setItem("shenron-auth-callback", callbackURL);
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              name: name.trim(),
              email: email.trim(),
              password,
              callbackURL,
            })
          : await authClient.signIn.email({ email: email.trim(), password, callbackURL });
      if (result.error) throw new Error("email");
      if (mode === "signup") {
        setFeedback({ tone: "notice", text: t("auth.signin.verifyEmail") });
        setMode("signin");
        setPassword("");
        return;
      }
      if (result.data?.token) window.location.assign(callbackURL);
      else setFeedback({ tone: "notice", text: t("auth.signin.verifyEmail") });
    } catch {
      fail(mode === "signup" ? "auth.signin.signupError" : "auth.signin.emailError");
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    if (!email.trim()) {
      fail("auth.signin.magicLinkNeedsEmail");
      emailRef.current?.focus();
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const result = await authClient.signIn.magicLink({ email: email.trim(), callbackURL });
      if (result.error) throw new Error("magic");
      setFeedback({ tone: "notice", text: t("auth.signin.magicLinkSent") });
    } catch {
      fail("auth.signin.emailError");
    } finally {
      setLoading(false);
    }
  }

  const signup = mode === "signup";
  const feedbackId = `${id}-feedback`;
  const describedBy = (hint?: string) =>
    [hint, feedback?.tone === "error" ? feedbackId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="toriyama-panel mx-auto w-full max-w-md p-6 sm:p-8">
      <header>
        <h1 className="font-display text-[2rem] font-bold leading-tight text-white">
          {signup ? t("auth.signin.signupTitle") : t("auth.signin.title")}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/75">
          {t("auth.signin.lead")}
        </p>
      </header>

      {feedback && (
        <div
          ref={feedbackRef}
          id={feedbackId}
          tabIndex={-1}
          role={feedback.tone === "error" ? "alert" : "status"}
          className={`mt-6 rounded-xl border px-4 py-3 text-sm leading-relaxed text-white ${
            feedback.tone === "error"
              ? "border-dbz-red bg-dbz-red/15"
              : "border-dbz-yellow/60 bg-dbz-yellow/10"
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="mt-6 grid gap-3">
        <button
          type="button"
          disabled={loading}
          aria-busy={loading}
          onClick={() => void social("discord")}
          className="toriyama-btn min-h-12 w-full normal-case tracking-normal text-[0.9375rem]"
        >
          <DragonBall size={20} />
          {t("auth.signin.discord")}
        </button>
        {googleEnabled && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void social("google")}
            className={SECONDARY}
          >
            {t("auth.signin.google")}
          </button>
        )}
        {PASSKEY_ENABLED && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void signInPasskey()}
            className={SECONDARY}
          >
            <Cadenas size={18} />
            {t("auth.signin.passkey")}
          </button>
        )}
      </div>

      <h2 className="mt-8 border-t border-dbz-border pt-6 text-[0.9375rem] font-semibold text-white">
        {t("auth.signin.orEmail")}
      </h2>

      {!emailSendingEnabled && (
        <p className="mt-2 text-sm leading-relaxed text-white/75">
          {t("auth.signin.emailUnavailable")}
        </p>
      )}

      <form
        className="mt-4 grid gap-4"
        aria-busy={loading}
        onSubmit={(event) => void submit(event)}
      >
        {signup && (
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-medium text-white">
              {t("auth.signin.name")}
            </label>
            <input
              id={`${id}-name`}
              autoComplete="name"
              autoCapitalize="words"
              required
              minLength={2}
              maxLength={48}
              value={name}
              aria-describedby={describedBy(`${id}-name-hint`)}
              onChange={(event) => setName(event.target.value)}
              className={FIELD}
            />
            <p id={`${id}-name-hint`} className="text-[0.8125rem] text-white/70">
              {t("auth.signin.nameHint", { min: 2, max: 48 })}
            </p>
          </div>
        )}
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-email`} className="text-sm font-medium text-white">
            {t("auth.signin.email")}
          </label>
          <input
            ref={emailRef}
            id={`${id}-email`}
            type="email"
            inputMode="email"
            autoComplete={signup ? "email" : "username"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            value={email}
            aria-describedby={describedBy()}
            onChange={(event) => setEmail(event.target.value)}
            className={FIELD}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-password`} className="text-sm font-medium text-white">
            {t("auth.signin.password")}
          </label>
          <div className="relative">
            <input
              id={`${id}-password`}
              type={showPassword ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={signup ? 12 : 1}
              maxLength={256}
              value={password}
              aria-describedby={describedBy(signup ? `${id}-password-hint` : undefined)}
              onChange={(event) => setPassword(event.target.value)}
              className={`${FIELD} pr-14`}
            />
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={
                showPassword ? t("auth.signin.hidePassword") : t("auth.signin.showPassword")
              }
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-white/75 hover:text-dbz-yellow"
            >
              <Oeil size={20} />
            </button>
          </div>
          {signup && (
            <p id={`${id}-password-hint`} className="text-[0.8125rem] text-white/70">
              {t("auth.signin.passwordHint", { min: 12 })}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || (signup && !emailSendingEnabled)}
          aria-busy={loading}
          className={SECONDARY}
        >
          {loading
            ? t("auth.signin.working")
            : signup
              ? t("auth.signin.createAccount")
              : t("auth.signin.emailSubmit")}
        </button>
      </form>

      <div className="mt-3 flex flex-col items-start gap-1">
        {!signup && emailSendingEnabled && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => void sendMagicLink()}
              className={TEXT_LINK}
            >
              {t("auth.signin.magicLink")}
            </button>
            <Link
              href="/forgot-password"
              onClick={() => storePasswordResetEmail(email)}
              className={TEXT_LINK}
            >
              {t("auth.signin.forgotPassword")}
            </Link>
          </>
        )}
        {(signup || emailSendingEnabled) && (
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(signup ? "signin" : "signup");
              setFeedback(null);
            }}
            className={`${TEXT_LINK} font-semibold text-dbz-orange`}
          >
            {signup ? t("auth.signin.haveAccount") : t("auth.signin.createAccount")}
          </button>
        )}
      </div>

      <footer className="mt-6 border-t border-dbz-border pt-5 text-[0.8125rem] leading-relaxed text-white/70">
        <p>
          {t("auth.signin.termsLead")}{" "}
          <Link href="/license" className="underline underline-offset-4 hover:text-dbz-yellow">
            {t("auth.signin.terms")}
          </Link>
          .
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-dbz-yellow"
        >
          {t("auth.signin.home")}
        </Link>
      </footer>
    </div>
  );
}
