// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { API_URL } from "@/lib/config";
import { getProfileCardUrl } from "@/lib/assets";
import { isCanvasMemberId } from "@/lib/canvas-preview";
import { useCanvasUIText } from "@/lib/canvas-ui-text";

export function CanvasPageHeader() {
  const t = useCanvasUIText();
  return (
    <PageHeader eyebrow={t("eyebrow")} title={t("title")} subtitle={t("lead")} className="mb-8" />
  );
}

function SelectedCanvasImage({ src, alt }: { src: string; alt: string }) {
  const t = useCanvasUIText();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    if (state !== "loading") return;
    const timeout = setTimeout(() => setState("error"), 20_000);
    return () => clearTimeout(timeout);
  }, [state]);
  return (
    <div
      className="grid min-h-44 place-items-center bg-muted p-4"
      aria-live="polite"
      aria-busy={state === "loading"}
    >
      {state === "error" ? (
        <output className="max-w-sm text-center text-sm text-muted-foreground">
          {t("unavailable")}
        </output>
      ) : (
        <>
          {state === "loading" && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
          <img
            src={src}
            alt={alt}
            className={`max-h-80 w-full object-contain ${state === "ready" ? "" : "hidden"}`}
            onLoad={() => setState("ready")}
            onError={() => setState("error")}
          />
        </>
      )}
    </div>
  );
}

export function CanvasPublicExamples() {
  const t = useCanvasUIText();
  const [member, setMember] = useState("");
  const [selected, setSelected] = useState<{ id: string; request: number } | null>(null);
  const valid = isCanvasMemberId(member.trim());
  return (
    <section className="mt-8 space-y-5">
      <h2 className="text-xl font-bold text-foreground">{t("samples")}</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid)
            setSelected((current) => ({ id: member.trim(), request: (current?.request ?? 0) + 1 }));
        }}
      >
        <div className="min-w-0 flex-1 basis-64 space-y-2">
          <label htmlFor="canvas-member" className="block text-sm font-semibold">
            {t("member")}
          </label>
          <input
            id="canvas-member"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="[1-9][0-9]{16,19}"
            value={member}
            onChange={(event) => setMember(event.target.value)}
            aria-describedby="canvas-member-hint"
            className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {t("show")}
        </button>
        <p id="canvas-member-hint" className="basis-full text-sm text-muted-foreground">
          {t("memberHint")}
        </p>
      </form>
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        {(["profile", "scan"] as const).map((kind) => {
          const path = `/api/public/profile/:id/${kind === "profile" ? "card" : "scan"}.png`;
          const src = selected
            ? kind === "profile"
              ? getProfileCardUrl(selected.id)
              : `${API_URL}/api/public/profile/${selected.id}/scan.png`
            : null;
          return (
            <article
              key={kind}
              className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground"
            >
              {src ? (
                <SelectedCanvasImage key={`${selected!.request}:${src}`} src={src} alt={t(kind)} />
              ) : (
                <div className="grid min-h-44 place-items-center bg-muted p-4">
                  <p className="text-center text-sm text-muted-foreground">{t("empty")}</p>
                </div>
              )}
              <div className="space-y-3 p-5">
                <h3 className="text-xl font-bold">{t(kind)}</h3>
                <p className="text-sm text-muted-foreground">
                  {t(kind === "profile" ? "profileDescription" : "scanDescription")}
                </p>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{t("api")}</dt>
                    <dd>
                      <code className="break-all">GET {path}</code>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("command")}</dt>
                    <dd>
                      <code>{kind === "profile" ? "/eprofil" : "/scan @membre"}</code>
                    </dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
        <h2 className="mb-2 text-xl font-bold">{t("backgrounds")}</h2>
        <p className="text-sm text-muted-foreground">{t("backgroundDescription")}</p>
        <code className="mt-3 block break-all text-xs text-muted-foreground">
          assets/backgrounds/{"{theme}"}/{"{slug}"}.jpg
        </code>
      </div>
    </section>
  );
}
