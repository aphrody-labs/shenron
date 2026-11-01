"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";
import { consumePasswordResetEmail } from "@/lib/password-reset-prefill";

export default function ForgotPasswordPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const value = consumePasswordResetEmail();
    // oxlint-disable-next-line react/set-state-in-effect -- prefill comes from browser session storage without putting an email in the URL.
    if (value) setEmail(value);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
    } finally {
      setDone(true);
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-6 py-14">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/30 p-8 text-white">
        <h1 className="font-display text-3xl font-bold">{t("auth.reset.requestTitle")}</h1>
        <p className="mt-3 text-sm text-white/65">{t("auth.reset.requestLead")}</p>
        {done ? (
          <output className="mt-6 block rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm">
            {t("auth.reset.requestSent")}
          </output>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm">
              {t("auth.signin.email")}
              <input
                required
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-12 rounded-xl border border-white/15 bg-black/30 px-4"
              />
            </label>
            <button
              disabled={busy}
              className="h-12 rounded-full bg-dbz-orange font-semibold text-black disabled:opacity-50"
            >
              {t("auth.reset.send")}
            </button>
          </form>
        )}
        <Link href="/signin" className="mt-6 block text-sm text-white/70 underline">
          {t("auth.reset.back")}
        </Link>
      </div>
    </section>
  );
}
