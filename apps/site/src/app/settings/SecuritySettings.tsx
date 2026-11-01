"use client";
/* oxlint-disable react/set-state-in-effect -- initial remote account/passkey state must be loaded after mount */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";
import { useAuthSecurityText } from "@/lib/auth-security-text";
import { storePasswordResetEmail } from "@/lib/password-reset-prefill";

type LinkedAccount = { id: string; providerId: string; accountId: string };
type Passkey = { id: string; name?: string | null; createdAt?: Date | string };

export default function SecuritySettings({ googleEnabled }: { googleEnabled: boolean }) {
  const t = useT();
  const ts = useAuthSecurityText();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [accountEmail, setAccountEmail] = useState("");
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; backupCodes: string[] } | null>(null);
  const [savedBackupCodes, setSavedBackupCodes] = useState<string[]>([]);
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [accountResult, passkeyResult, sessionResult] = await Promise.all([
      authClient.listAccounts(),
      authClient.passkey.listUserPasskeys(),
      authClient.getSession(),
    ]);
    if (accountResult.error || passkeyResult.error || sessionResult.error)
      throw new Error(t("auth.security.loadError"));
    setAccounts((accountResult.data ?? []) as LinkedAccount[]);
    setAccountEmail(sessionResult.data?.user.email ?? "");
    setPasskeys((passkeyResult.data ?? []) as Passkey[]);
    setTwoFactorEnabled(Boolean(sessionResult.data?.user.twoFactorEnabled));
  }, [t]);

  useEffect(() => {
    void refresh().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : t("auth.security.loadError")),
    );
  }, [refresh, t]);

  async function link(provider: "discord" | "google") {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.linkSocial({
        provider,
        callbackURL: "/settings?linked=1",
        errorCallbackURL: "/settings?linked=error",
      });
      if (result.error) throw new Error(result.error.message || t("auth.security.actionError"));
      const url = result.data?.url;
      if (!url) throw new Error(t("auth.security.actionError"));
      const target = new URL(url);
      const expected =
        provider === "google" ? "https://accounts.google.com" : "https://discord.com";
      if (target.origin !== expected) throw new Error(t("auth.security.actionError"));
      window.location.assign(target.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.security.actionError"));
      setBusy(false);
    }
  }

  async function unlink(account: LinkedAccount) {
    if (accounts.length < 2) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.unlinkAccount({ accountId: account.id });
      if (result.error) throw new Error(result.error.message || t("auth.security.actionError"));
      setMessage(t("auth.security.unlinked"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.security.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function addPasskey() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.passkey.addPasskey({ name: navigator.platform || "Shenron" });
      if (result.error) throw new Error(result.error.message || t("auth.security.actionError"));
      setMessage(t("auth.security.passkeyAdded"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.security.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) throw new Error(result.error.message || t("auth.security.actionError"));
      setMessage(t("auth.security.passkeyRemoved"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.security.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function enableTwoFactor() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await authClient.twoFactor.enable({
        password: twoFactorPassword || undefined,
        method: "totp",
      });
      if (result.error) throw new Error(result.error.message || ts("error"));
      if (result.data?.method !== "totp") throw new Error(ts("error"));
      const { totpURI, backupCodes } = result.data;
      if (!totpURI || !backupCodes.length) throw new Error(ts("error"));
      const secret = new URL(totpURI).searchParams.get("secret");
      if (!secret) throw new Error(ts("error"));
      setSetup({ secret, backupCodes });
      setTwoFactorCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ts("error"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyTwoFactor() {
    if (!setup) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: twoFactorCode.trim() });
      if (result.error) throw new Error(result.error.message || ts("error"));
      setSavedBackupCodes(setup.backupCodes);
      setSetup(null);
      setTwoFactorCode("");
      setTwoFactorPassword("");
      setMessage(ts("enabled"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ts("error"));
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.disable({
        password: twoFactorPassword || undefined,
      });
      if (result.error) throw new Error(result.error.message || ts("error"));
      setTwoFactorPassword("");
      setSavedBackupCodes([]);
      setMessage(ts("disabled"));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ts("error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyTotpSecret() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.secret);
      setCopied(true);
    } catch {
      setError(ts("error"));
    }
  }

  function downloadBackupCodes() {
    if (!savedBackupCodes.length) return;
    const blob = new Blob([savedBackupCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "shenron-backup-codes.txt";
    downloadLink.click();
    URL.revokeObjectURL(url);
    setSavedBackupCodes([]);
  }

  const providers = [
    { id: "discord", label: "Discord", enabled: true },
    { id: "google", label: "Google", enabled: googleEnabled },
  ] as const;
  const emailPasswordConfigured = accounts.some((item) => item.providerId === "credential");

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-6 text-white md:p-8">
      <h2 className="font-display text-xl font-bold">{t("auth.security.title")}</h2>
      <p className="mt-2 text-sm text-white/65">{t("auth.security.lead")}</p>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {message && (
        <output className="mt-4 block rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {message}
        </output>
      )}

      <div className="mt-6">
        <h3 className="font-semibold">{t("auth.security.linkedAccounts")}</h3>
        <p className="mt-1 text-sm text-white/60">{t("auth.security.linkedLead")}</p>
        <ul className="mt-3 grid gap-2">
          {providers.map((provider) => {
            const account = accounts.find((item) => item.providerId === provider.id);
            return (
              <li
                key={provider.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"
              >
                <span>
                  {provider.label}{" "}
                  <span className="text-xs text-white/55">
                    {account
                      ? t("auth.security.connected")
                      : provider.enabled
                        ? t("auth.security.notConnected")
                        : t("auth.security.notConfigured")}
                  </span>
                </span>
                {account ? (
                  <button
                    type="button"
                    disabled={busy || accounts.length < 2}
                    onClick={() => void unlink(account)}
                    className="text-sm text-dbz-orange underline disabled:opacity-40"
                  >
                    {t("auth.security.unlink")}
                  </button>
                ) : provider.enabled ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void link(provider.id)}
                    className="text-sm text-dbz-orange underline disabled:opacity-40"
                  >
                    {t("auth.security.link")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-white/55">{t("auth.security.keepOne")}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
          <span>
            {t("auth.security.emailPassword")}{" "}
            <span className="text-xs text-white/55">
              {emailPasswordConfigured
                ? t("auth.security.emailPasswordConfigured")
                : t("auth.security.emailPasswordNotConfigured")}
            </span>
            <span className="mt-1 block text-xs text-white/55">
              {t("auth.security.emailPasswordLead")}
            </span>
          </span>
          {accountEmail && (
            <Link
              href="/forgot-password"
              onClick={() => storePasswordResetEmail(accountEmail)}
              className="text-sm text-dbz-orange underline"
            >
              {emailPasswordConfigured
                ? t("auth.security.resetEmailPassword")
                : t("auth.security.addEmailPassword")}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-7 border-t border-white/10 pt-6">
        <h3 className="font-semibold">{ts("title")}</h3>
        <p className="mt-1 text-sm text-white/60">
          {twoFactorEnabled ? ts("statusOn") : ts("statusOff")} {ts("lead")}
        </p>
        {!twoFactorEnabled && !setup && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="password"
              autoComplete="current-password"
              value={twoFactorPassword}
              onChange={(event) => setTwoFactorPassword(event.target.value)}
              placeholder={ts("password")}
              aria-label={ts("password")}
              className="h-10 rounded-xl border border-white/15 bg-black/30 px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void enableTwoFactor()}
              className="h-10 rounded-full border border-white/20 px-4 text-sm font-semibold disabled:opacity-40"
            >
              {ts("start")}
            </button>
          </div>
        )}
        {setup && (
          <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm text-white/70">{ts("secretLead")}</p>
            <div className="grid gap-2">
              <label htmlFor="totp-secret" className="text-xs font-semibold text-white/60">
                {ts("secret")}
              </label>
              <div className="flex gap-2">
                <input
                  id="totp-secret"
                  readOnly
                  value={setup.secret}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => void copyTotpSecret()}
                  className="rounded-full border border-white/20 px-3 text-xs"
                >
                  {copied ? ts("copied") : ts("copySecret")}
                </button>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold">{ts("backupCodes")}</h4>
              <p className="mt-1 text-xs text-white/60">{ts("backupLead")}</p>
              <ul className="mt-2 grid grid-cols-2 gap-2 font-mono text-sm">
                {setup.backupCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-white/55">{ts("backupPending")}</p>
            </div>
            <label className="grid gap-2 text-sm">
              {ts("code")}
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                className="h-10 rounded-xl border border-white/15 bg-black/30 px-3"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy || twoFactorCode.trim().length < 6}
                onClick={() => void verifyTwoFactor()}
                className="h-10 rounded-full bg-dbz-orange px-4 text-sm font-semibold text-black disabled:opacity-40"
              >
                {ts("verify")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setSetup(null);
                  setTwoFactorPassword("");
                  setTwoFactorCode("");
                }}
                className="h-10 rounded-full border border-white/20 px-4 text-sm"
              >
                {ts("cancel")}
              </button>
            </div>
          </div>
        )}
        {twoFactorEnabled && !setup && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              type="password"
              autoComplete="current-password"
              value={twoFactorPassword}
              onChange={(event) => setTwoFactorPassword(event.target.value)}
              placeholder={ts("password")}
              aria-label={ts("password")}
              className="h-10 rounded-xl border border-white/15 bg-black/30 px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void disableTwoFactor()}
              className="h-10 rounded-full border border-white/20 px-4 text-sm font-semibold disabled:opacity-40"
            >
              {ts("disable")}
            </button>
          </div>
        )}
        {savedBackupCodes.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
            <h4 className="text-sm font-semibold">{ts("backupCodes")}</h4>
            <p className="mt-1 text-xs text-white/65">{ts("backupLead")}</p>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {savedBackupCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={downloadBackupCodes}
              className="mt-4 h-9 rounded-full border border-white/20 px-4 text-xs font-semibold"
            >
              {ts("saveCodes")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-7 border-t border-white/10 pt-6">
        <h3 className="font-semibold">{t("auth.security.passkeys")}</h3>
        <p className="mt-1 text-sm text-white/60">{t("auth.security.passkeyLead")}</p>
        <ul className="mt-3 grid gap-2">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3"
            >
              <span className="text-sm">{passkey.name || t("auth.security.passkeyDefault")}</span>
              <button
                type="button"
                disabled={busy || (passkeys.length < 2 && accounts.length < 2)}
                onClick={() => void removePasskey(passkey.id)}
                className="text-sm text-dbz-orange underline disabled:opacity-40"
              >
                {t("auth.security.remove")}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={() => void addPasskey()}
          className="mt-4 h-10 rounded-full border border-white/20 px-5 text-sm font-semibold disabled:opacity-40"
        >
          {t("auth.security.addPasskey")}
        </button>
      </div>
    </section>
  );
}
