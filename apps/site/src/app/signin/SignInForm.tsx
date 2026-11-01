/* oxlint-disable react/set-state-in-effect -- the browser callback URL is unavailable during server rendering */
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { sanitizeInternalPath } from "@aphrody/shenron-config/favorites";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";
import { storePasswordResetEmail } from "@/lib/password-reset-prefill";

type Props = { googleEnabled: boolean; emailSendingEnabled: boolean };

const OAUTH_ORIGINS: Record<string, string> = {
  discord: "https://discord.com",
  google: "https://accounts.google.com",
};

export default function SignInForm({ googleEnabled, emailSendingEnabled }: Props) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [callbackURL, setCallbackURL] = useState("/dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackURL(sanitizeInternalPath(params.get("callbackURL"), 300) ?? "/dashboard");
    if (params.has("error")) setError(t("auth.signin.oauthError"));
    if (params.has("verified")) setNotice(t("auth.signin.verified"));
  }, [t]);

  async function social(provider: "discord" | "google") {
    setLoading(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: "/signin?error=oauth_failed",
      });
      if (result.error) throw new Error(result.error.message || t("auth.signin.oauthError"));
      const url = result.data?.url;
      if (!result.data?.redirect || !url) throw new Error(t("auth.signin.oauthError"));
      const target = new URL(url);
      if (target.origin !== OAUTH_ORIGINS[provider]) throw new Error(t("auth.signin.oauthError"));
      window.location.assign(target.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.signin.oauthError"));
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
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
      if (result.error) throw new Error(result.error.message || t("auth.signin.emailError"));
      if (mode === "signup") {
        setNotice(t("auth.signin.verifyEmail"));
        setMode("signin");
        setPassword("");
        return;
      }
      if (result.data?.token) window.location.assign(callbackURL);
      else setNotice(t("auth.signin.verifyEmail"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.signin.emailError"));
    } finally {
      setLoading(false);
    }
  }

  async function sendMagicLink() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await authClient.signIn.magicLink({ email: email.trim(), callbackURL });
      if (result.error) throw new Error(result.error.message || t("auth.signin.emailError"));
      setNotice(t("auth.signin.magicLinkSent"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.signin.emailError"));
    } finally {
      setLoading(false);
    }
  }

  async function signInPasskey() {
    setLoading(true);
    setError("");
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) throw new Error(result.error.message || t("auth.signin.passkeyError"));
      window.location.assign(callbackURL);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.signin.passkeyError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative flex min-h-[80vh] items-center justify-center px-6 py-16">
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 md:p-10">
        <header className="mb-7 text-center">
          <p className="mb-3 font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-dbz-orange">
            {t("auth.signin.eyebrow")}
          </p>
          <h1 className="mb-3 font-display text-[32px] font-bold leading-[1.05] text-white md:text-[40px]">
            {t("auth.signin.title")}
          </h1>
          <p className="text-[15px] leading-relaxed text-white/65">{t("auth.signin.lead")}</p>
        </header>

        <div className="grid gap-3">
          <button
            type="button"
            disabled={loading}
            aria-busy={loading}
            onClick={() => void social("discord")}
            className="h-12 rounded-full bg-dbz-orange px-6 font-display text-[13px] font-bold uppercase tracking-wider text-black disabled:opacity-60"
          >
            {t("auth.signin.discord")}
          </button>
          {googleEnabled && (
            <button
              type="button"
              disabled={loading}
              aria-busy={loading}
              onClick={() => void social("google")}
              className="h-12 rounded-full border border-white/20 px-6 font-display text-[13px] font-bold text-white disabled:opacity-60"
            >
              {t("auth.signin.google")}
            </button>
          )}
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-white/45">
          <span className="h-px flex-1 bg-white/10" />
          {t("auth.signin.orEmail")}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form className="grid gap-3" aria-busy={loading} onSubmit={(event) => void submit(event)}>
          {mode === "signup" && (
            <label className="grid gap-2 text-sm text-white/75">
              {t("auth.signin.name")}
              <input
                autoComplete="name"
                autoCapitalize="words"
                required
                minLength={2}
                maxLength={48}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="h-12 rounded-xl border border-white/15 bg-black/30 px-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
              />
            </label>
          )}
          <label className="grid gap-2 text-sm text-white/75">
            {t("auth.signin.email")}
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 rounded-xl border border-white/15 bg-black/30 px-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
            />
          </label>
          <label className="grid gap-2 text-sm text-white/75">
            {t("auth.signin.password")}
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={mode === "signup" ? 12 : 1}
              maxLength={256}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 rounded-xl border border-white/15 bg-black/30 px-4 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange"
            />
          </label>
          <button
            type="submit"
            disabled={loading || (mode === "signup" && !emailSendingEnabled)}
            aria-busy={loading}
            className="mt-2 min-h-12 rounded-full bg-dbz-orange px-6 font-display text-[13px] font-bold text-black transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange disabled:opacity-60"
          >
            {mode === "signup" ? t("auth.signin.createAccount") : t("auth.signin.emailSubmit")}
          </button>
        </form>

        {!emailSendingEnabled && (
          <output className="mt-3 text-sm leading-relaxed text-white/75" aria-live="polite">
            {t("auth.signin.emailUnavailable")}
          </output>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            disabled={loading || (mode === "signin" && !emailSendingEnabled)}
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
            className="text-dbz-orange underline underline-offset-4 disabled:opacity-40"
          >
            {mode === "signin" ? t("auth.signin.createAccount") : t("auth.signin.haveAccount")}
          </button>
          {mode === "signin" && (
            <span className="flex flex-wrap gap-3">
              {emailSendingEnabled && (
                <button
                  type="button"
                  disabled={loading || !email}
                  onClick={() => void sendMagicLink()}
                  className="text-white/70 underline underline-offset-4 disabled:opacity-40"
                >
                  {t("auth.signin.magicLink")}
                </button>
              )}
              {emailSendingEnabled && (
                <Link
                  href="/forgot-password"
                  onClick={() => storePasswordResetEmail(email)}
                  className="text-white/70 underline underline-offset-4"
                >
                  {t("auth.signin.forgotPassword")}
                </Link>
              )}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={loading}
          aria-busy={loading}
          onClick={() => void signInPasskey()}
          className="mt-4 min-h-12 w-full rounded-full border border-white/20 text-sm text-white/90 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbz-orange disabled:opacity-60"
        >
          {t("auth.signin.passkey")}
        </button>

        {(error || notice) && (
          <p
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={`mt-5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${error ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"}`}
          >
            {error || notice}
          </p>
        )}

        <div className="mt-8 border-t border-white/[0.08] pt-6 text-center text-[12px] leading-relaxed text-white/50">
          {t("auth.signin.termsLead")}{" "}
          <Link href="/license" className="underline decoration-white/30 hover:text-white">
            {t("auth.signin.terms")}
          </Link>
        </div>
        <Link
          href="/"
          className="mt-6 block text-center text-[12px] text-white/55 transition-colors hover:text-dbz-orange"
        >
          {t("auth.signin.home")}
        </Link>
      </div>
    </section>
  );
}
