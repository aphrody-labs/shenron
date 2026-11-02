"use client";

import { useEffect, useState } from "react";
import { T, useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";

type Props = { clientId: string; scopes: string[] };
type ClientInfo = { name?: string | null; uri?: string | null; icon?: string | null };

export default function ConsentForm({ clientId, scopes }: Props) {
  const t = useT();
  const [client, setClient] = useState<ClientInfo | null>(() => (clientId ? null : {}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId) return;
    const controller = new AbortController();
    fetch(`/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("auth.consent.error"));
        const body: unknown = await response.json();
        if (!body || typeof body !== "object") throw new Error(t("auth.consent.error"));
        const info = body as Record<string, unknown>;
        return {
          name: typeof info.client_name === "string" ? info.client_name : null,
          uri: typeof info.client_uri === "string" ? info.client_uri : null,
          icon: typeof info.logo_uri === "string" ? info.logo_uri : null,
        } satisfies ClientInfo;
      })
      .then((info) => {
        if (info) setClient(info);
        return info;
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : t("auth.consent.error"));
          setClient({});
        }
      });
    return () => controller.abort();
  }, [clientId, t]);

  async function answer(accept: boolean) {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await authClient.$fetch<{ url?: string }>("/oauth2/consent", {
        method: "POST",
        body: { accept },
      });
      if (result.error || !result.data?.url)
        throw new Error(result.error?.message || t("auth.consent.error"));
      window.location.assign(result.data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.consent.error"));
      setLoading(false);
    }
  }

  const clientName = client?.name || clientId || "Shenron";
  return (
    <>
      <h1 className="mb-3 font-display text-3xl font-bold">
        <T k="auth.consent.title" values={{ client: clientName }} />
      </h1>
      <p className="mb-6 text-white/70">
        <T k="auth.consent.lead" />
      </p>
      {!client ? (
        <output className="text-white/65">
          <T k="auth.consent.loading" />
        </output>
      ) : (
        <>
          {client.uri && <p className="mb-5 break-all text-sm text-white/60">{client.uri}</p>}
          <ul className="mb-7 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5">
            {scopes.map((scope) => (
              <li key={scope} className="flex gap-3 text-sm text-white/80">
                <span aria-hidden="true" className="text-dbz-orange">
                  •
                </span>
                <span>
                  {scope in { openid: 1, profile: 1, email: 1, offline_access: 1 }
                    ? t(`auth.consent.${scope}`)
                    : t("auth.consent.unknownScope", { scope })}
                </span>
              </li>
            ))}
            {scopes.length === 0 && (
              <li className="text-sm text-white/70">{t("auth.consent.openid")}</li>
            )}
          </ul>
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200"
            >
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void answer(false)}
              className="h-12 rounded-full border border-white/20 text-sm font-semibold disabled:opacity-50"
            >
              <T k="auth.consent.deny" />
            </button>
            <button
              type="button"
              disabled={loading || !clientId}
              onClick={() => void answer(true)}
              className="h-12 rounded-full bg-dbz-orange text-sm font-semibold text-black disabled:opacity-50"
            >
              <T k="auth.consent.approve" />
            </button>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-white/55">
            <T k="auth.consent.privacy" />
          </p>
        </>
      )}
    </>
  );
}
