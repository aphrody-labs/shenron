"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { createTranslator } from "next-intl";
import {
  Dbxv2Audio,
  Dbxv2Image,
  Dbxv2ModelViewer,
  Dbxv2UiProvider,
  Dbxv2Video,
} from "@aphrody/shenron-ui/dbxv2";
import "@aphrody/shenron-ui/dbxv2.css";
import type { Dbxv2Locale, Dbxv2Text } from "@/lib/dbxv2-text";
import {
  listDbxv2Files,
  previewDbxv2,
  readDbxv2Messages,
  searchDbxv2,
  type FileRow,
} from "./_actions";

type Tab = "search" | "files" | "messages";
type Hit = {
  title: string;
  kind: string;
  lang: string | null;
  heading: string | null;
  snippet: string;
  score: number;
};
interface Preview {
  ref: string;
  kind: "png" | "wav" | "video" | "model.glb";
  url: string;
  expiresInSeconds: number;
}

export interface ExplorerProps {
  locale: Dbxv2Locale;
  messages: Dbxv2Text;
  stats: { files: number; characters: number; messages: number };
}

export function Explorer({ locale, messages, stats }: ExplorerProps) {
  const t = createTranslator({ locale, messages });
  const id = useId();
  const [tab, setTab] = useState<Tab>("search");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<{ mode: string; list: Hit[] } | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [texts, setTexts] = useState<{ lang: string; text: string }[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [index, setIndex] = useState(0);

  const fail = (code: string) => setError(t(`errors.${code}` as "errors.failed"));
  const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = field(form, "q");
    const lang = field(form, "lang");
    setError(null);
    if (q.length < 2) return setError(t("search.empty"));
    startTransition(async () => {
      const res = await searchDbxv2({ q, lang: lang || undefined });
      if (res.ok) setHits({ mode: res.data.mode, list: res.data.hits });
      else fail(res.error);
    });
  };

  const onFiles = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await listDbxv2Files({
        q: field(form, "q") || undefined,
        format: field(form, "format") || undefined,
        cpk: field(form, "cpk") || undefined,
      });
      if (res.ok) setFiles(res.data);
      else fail(res.error);
    });
  };

  const onMessages = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = field(new FormData(event.currentTarget), "key");
    setError(null);
    if (!key) return;
    startTransition(async () => {
      const res = await readDbxv2Messages(key);
      if (res.ok) setTexts(res.data);
      else fail(res.error);
    });
  };

  const open = (file: FileRow, texture = index) => {
    if (!file.previewKind) return;
    const ref = `${file.cpk}/${file.path}`;
    const kind = file.previewKind;
    setError(null);
    startTransition(async () => {
      const res = await previewDbxv2({
        ref,
        kind,
        index: kind === "png" ? texture : undefined,
      });
      if (res.ok) setPreview({ ref, ...res.data });
      else fail(res.error);
    });
  };

  const tabs: Tab[] = ["search", "files", "messages"];
  const label = (name: string) =>
    t(`preview.${name}` as "preview.image", { ref: preview?.ref ?? "" });

  return (
    <Dbxv2UiProvider labels={messages.viewer}>
      <p>{t("stats", stats)}</p>
      <div role="tablist" aria-label={t("nav")} className="my-4 flex flex-wrap gap-2">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${id}-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`${id}-panel-${name}`}
            onClick={() => setTab(name)}
            className="min-h-9 rounded border px-3 aria-selected:font-bold aria-selected:underline"
          >
            {t(`tabs.${name}`)}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="my-2">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? messages.viewer.loading : ""}
      </p>

      <div
        role="tabpanel"
        id={`${id}-panel-${tab}`}
        aria-labelledby={`${id}-tab-${tab}`}
        className="grid gap-4 lg:grid-cols-2"
      >
        <div>
          {tab === "search" && (
            <>
              <form onSubmit={onSearch} className="grid gap-2">
                <label>
                  {t("search.query")}
                  <input
                    name="q"
                    type="search"
                    minLength={2}
                    required
                    className="block w-full border p-2"
                  />
                </label>
                <label>
                  {t("search.lang")}
                  <select name="lang" defaultValue="" className="block border p-2">
                    <option value="">{t("search.anyLang")}</option>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                  </select>
                </label>
                <button type="submit" disabled={pending} className="min-h-9 border px-3">
                  {t("search.submit")}
                </button>
              </form>
              {hits && (
                <section aria-live="polite">
                  <p>
                    {t("search.results", { count: hits.list.length })} ·{" "}
                    {t("search.mode", { mode: hits.mode })}
                  </p>
                  <ol className="grid gap-3">
                    {hits.list.map((hit, i) => (
                      <li key={`${hit.title}-${i}`} lang={hit.lang ?? undefined}>
                        <strong>{hit.title}</strong>
                        {hit.heading ? <span> — {hit.heading}</span> : null}
                        <p>{hit.snippet}</p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}

          {tab === "files" && (
            <>
              <form onSubmit={onFiles} className="grid gap-2">
                <label>
                  {t("files.query")}
                  <input name="q" type="search" className="block w-full border p-2" />
                </label>
                <label>
                  {t("files.format")}
                  <input name="format" className="block border p-2" maxLength={16} />
                </label>
                <label>
                  {t("files.cpk")}
                  <input name="cpk" className="block border p-2" maxLength={64} />
                </label>
                <label>
                  {t("preview.index")}
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={index}
                    onChange={(e) =>
                      setIndex(Math.max(0, Math.min(255, Number(e.target.value) || 0)))
                    }
                    className="block border p-2"
                  />
                </label>
                <button type="submit" disabled={pending} className="min-h-9 border px-3">
                  {t("files.submit")}
                </button>
              </form>
              {files && (
                <section aria-live="polite">
                  <p>{t("files.results", { count: files.length })}</p>
                  <ul className="grid gap-1">
                    {files.map((file) => (
                      <li
                        key={`${file.cpk}/${file.path}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <code className="break-all">
                          {file.cpk}/{file.path}
                        </code>
                        <span>{t("files.size", { size: file.size })}</span>
                        {file.previewKind ? (
                          <button
                            type="button"
                            className="min-h-8 border px-2"
                            onClick={() => open(file)}
                            aria-label={`${t("files.preview")} ${file.cpk}/${file.path}`}
                          >
                            {t("files.preview")}
                          </button>
                        ) : (
                          <span>{t("files.noPreview")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {tab === "messages" && (
            <>
              <form onSubmit={onMessages} className="grid gap-2">
                <label>
                  {t("messages.key")}
                  <input name="key" required className="block w-full border p-2" />
                </label>
                <button type="submit" disabled={pending} className="min-h-9 border px-3">
                  {t("messages.submit")}
                </button>
              </form>
              {texts && (
                <section aria-live="polite">
                  {texts.length === 0 ? (
                    <p>{t("messages.none")}</p>
                  ) : (
                    <dl>
                      {texts.map((entry, i) => (
                        <div key={`${entry.lang}-${i}`}>
                          <dt>{entry.lang}</dt>
                          <dd lang={entry.lang}>{entry.text}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <aside aria-label={t("files.preview")}>
          {preview && (
            <section>
              <h2 className="break-all text-lg">{t("preview.title", { ref: preview.ref })}</h2>
              <p>{t("preview.expires", { seconds: preview.expiresInSeconds })}</p>
              {preview.kind === "png" && (
                <Dbxv2Image src={preview.url} alt={label("image")} boxHeight={320} />
              )}
              {preview.kind === "wav" && <Dbxv2Audio src={preview.url} label={label("audio")} />}
              {preview.kind === "video" && <Dbxv2Video src={preview.url} label={label("video")} />}
              {preview.kind === "model.glb" && (
                <Dbxv2ModelViewer src={preview.url} title={label("model")} />
              )}
              <button
                type="button"
                className="mt-2 min-h-8 border px-2"
                onClick={() => setPreview(null)}
              >
                {t("preview.close")}
              </button>
            </section>
          )}
        </aside>
      </div>
    </Dbxv2UiProvider>
  );
}
