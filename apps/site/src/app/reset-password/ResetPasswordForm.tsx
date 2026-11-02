"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";

export default function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message || t("auth.reset.error"));
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.reset.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 py-14">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-8 text-white">
        <h1 className="font-display text-3xl font-bold">{t("auth.reset.title")}</h1>
        {done ? (
          <output className="mt-5 block rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm">
            {t("auth.reset.changed")}
          </output>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm">
              {t("auth.signin.password")}
              <input
                required
                minLength={12}
                maxLength={256}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-12 rounded-xl border border-white/15 bg-black/30 px-4"
              />
            </label>
            <button
              disabled={busy || !token}
              className="h-12 rounded-full bg-dbz-orange font-semibold text-black disabled:opacity-50"
            >
              {t("auth.reset.submit")}
            </button>
          </form>
        )}
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
