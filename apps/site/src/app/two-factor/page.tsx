"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { sanitizeInternalPath } from "@aphrody/shenron-config/favorites";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorPage() {
  const t = useT();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: code.trim() })
        : await authClient.twoFactor.verifyTotp({ code: code.trim() });
      if (result.error) throw new Error(result.error.message || t("auth.twoFactor.error"));
      const target =
        sanitizeInternalPath(window.sessionStorage.getItem("shenron-auth-callback"), 300) ??
        "/dashboard";
      window.sessionStorage.removeItem("shenron-auth-callback");
      window.location.assign(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.twoFactor.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 py-14">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-8 text-white">
        <h1 className="font-display text-3xl font-bold">{t("auth.twoFactor.title")}</h1>
        <p className="mt-3 text-sm text-white/65">{t("auth.twoFactor.lead")}</p>
        <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm">
            {backup ? t("auth.twoFactor.backupCode") : t("auth.twoFactor.code")}
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="h-12 rounded-xl border border-white/15 bg-black/30 px-4"
            />
          </label>
          <button
            disabled={busy}
            className="h-12 rounded-full bg-dbz-orange font-semibold text-black disabled:opacity-50"
          >
            {t("auth.twoFactor.submit")}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setBackup(!backup);
            setCode("");
            setError("");
          }}
          className="mt-4 text-sm text-white/70 underline"
        >
          {backup ? t("auth.twoFactor.useApp") : t("auth.twoFactor.useBackup")}
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {error}
          </p>
        )}
        <Link href="/signin" className="mt-6 block text-sm text-white/70 underline">
          {t("auth.reset.back")}
        </Link>
      </div>
    </section>
  );
}
