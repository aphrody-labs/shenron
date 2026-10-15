"use client";
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DragonBallLoader } from "@aphrody/shenron-ui/toriyama";
import { Enregistrer, Palette, Reinitialiser } from "@aphrody/shenron-ui/icones";
import {
  DEFAULT_SITE_THEME,
  THEME_COLOR_VARS,
  themeCssProperties,
  type SiteTheme,
  type ThemeColorKey,
} from "@/lib/site-theme";
import styles from "./DesignEditor.module.css";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const GROUPS = {
  surfaces: ["bg", "card", "border", "blue", "encre", "os"],
  accents: [
    "orange",
    "orangeDark",
    "yellow",
    "purple",
    "gold",
    "cyan",
    "pink",
    "ember",
    "ki",
    "amber",
  ],
  states: ["red", "green", "blueLight", "onPrimary", "onSurfaceVariant", "onError"],
} as const satisfies Record<string, readonly ThemeColorKey[]>;
const sameTheme = (a: SiteTheme | null, b: SiteTheme | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export async function loadTheme(): Promise<{ theme: SiteTheme }> {
  const response = await fetch("/api/theme-config", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
}

export async function saveTheme(theme: SiteTheme): Promise<{ theme: SiteTheme }> {
  const response = await fetch("/api/theme-config", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(theme),
  });
  if (!response.ok) throw new Error(String(response.status));
  const result = (await response.json()) as { ok?: boolean; theme: SiteTheme };
  if (result.ok !== true) throw new Error("invalid_save_response");
  const persisted = await loadTheme();
  if (!sameTheme(result.theme, persisted.theme)) throw new Error("save_verification_failed");
  return persisted;
}

function ColorRow({
  colorKey,
  value,
  disabled,
  onChange,
}: {
  colorKey: ThemeColorKey;
  value: string;
  disabled: boolean;
  onChange(value: string): void;
}) {
  const t = useTranslations("adminDesign");
  const [touched, setTouched] = useState(false);
  const valid = HEX.test(value.trim());
  const inputId = "theme-" + colorKey;
  const picker =
    value.length === 4
      ? "#" +
        value
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : value.slice(0, 7);
  return (
    <div
      className={styles.colorRow}
      style={{ "--swatch": valid ? value : "transparent" } as CSSProperties}
    >
      <input
        type="color"
        value={/^#[a-f0-9]{6}$/i.test(picker) ? picker : "#000000"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={styles.picker}
        aria-label={t("chooseColor", { color: t("colors." + colorKey) })}
      />
      <div>
        <label className={styles.colorLabel} htmlFor={inputId}>
          {t("colors." + colorKey)}
        </label>
        <span className={styles.colorHint} id={inputId + "-hint"}>
          {t("hexHint")}
        </span>
      </div>
      <input
        id={inputId}
        name={colorKey}
        value={value}
        required
        pattern="#[a-fA-F0-9]{3}([a-fA-F0-9]{3}|[a-fA-F0-9]{5})?"
        maxLength={9}
        disabled={disabled}
        onBlur={() => setTouched(true)}
        onChange={(event) => onChange(event.target.value)}
        className={styles.hexInput}
        spellCheck={false}
        aria-describedby={inputId + "-hint"}
        aria-invalid={touched && !valid}
      />
    </div>
  );
}

function Preview({ theme }: { theme: SiteTheme }) {
  const t = useTranslations("adminDesign");
  const variables = themeCssProperties(theme);
  return (
    <section
      className={styles.previewPane}
      style={
        {
          ...variables,
          color: theme.colors.os,
          fontFamily: variables["--site-font-family"],
          fontSize: theme.fontScale + "rem",
        } as CSSProperties
      }
      aria-labelledby="theme-preview-title"
    >
      <h2 id="theme-preview-title" className={styles.previewLabel}>
        {t("previewTitle")}
      </h2>
      <div className={styles.cover}>
        <div className={styles.coverTop}>
          <p className={styles.mastheadMark}>{t("previewKicker")}</p>
          <h3 className={styles.wordmark}>{t("previewHeading")}</h3>
          <p className={styles.coverIntro}>{t("previewIntro")}</p>
        </div>
        <div className={styles.sceneFrame}>
          <div className={styles.scene}>
            <div className={styles.sceneCopy}>
              <h3>{t("previewCard")}</h3>
              <p>{t("previewBody")}</p>
              <div className={styles.previewActions}>
                <span className={styles.previewPrimary}>{t("primaryAction")}</span>
                <span className={styles.previewSecondary}>{t("secondaryAction")}</span>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.checks}>
          {Object.keys(THEME_COLOR_VARS).map((key) => (
            <div
              key={key}
              className={styles.check}
              style={{
                background: theme.colors.card,
                color: theme.colors.os,
                borderInlineStart: "0.4rem solid " + theme.colors[key as ThemeColorKey],
              }}
            >
              <strong>{t("colors." + key)}</strong>
              <span>{theme.colors[key as ThemeColorKey]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DesignEditor() {
  const t = useTranslations("adminDesign");
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["theme-config"],
    queryFn: loadTheme,
    refetchOnWindowFocus: false,
  });
  const [theme, setTheme] = useState<SiteTheme | null>(null);
  const [savedTheme, setSavedTheme] = useState<SiteTheme | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  useEffect(() => {
    if (!query.data?.theme) return;
    setTheme((current) => current ?? structuredClone(query.data.theme));
    setSavedTheme((current) => current ?? structuredClone(query.data.theme));
  }, [query.data]);
  const save = useMutation({
    mutationFn: saveTheme,
    onSuccess: (result) => {
      setTheme(result.theme);
      setSavedTheme(result.theme);
      queryClient.setQueryData(["theme-config"], result);
      setToast({ type: "success", msg: t("saved") });
      router.refresh();
    },
    onError: () => setToast({ type: "error", msg: t("saveFailed") }),
  });
  const dirty = useMemo(
    () => theme !== null && savedTheme !== null && !sameTheme(theme, savedTheme),
    [theme, savedTheme],
  );
  const valid =
    theme !== null && Object.values(theme.colors).every((value) => HEX.test(value.trim()));
  if (query.isError && !theme)
    return (
      <div role="alert" className={styles.invalidNotice}>
        <p>{t("loadFailed")}</p>
        <button type="button" className="btn" onClick={() => query.refetch()}>
          {t("retry")}
        </button>
      </div>
    );
  if (query.isLoading || !theme)
    return (
      <div role="status" className="flex items-center gap-3">
        <DragonBallLoader size={28} />
        {t("loading")}
      </div>
    );
  const update = <K extends keyof SiteTheme>(key: K, value: SiteTheme[K]) =>
    setTheme((current) => (current ? { ...current, [key]: value } : current));
  return (
    <main className={styles.editor}>
      {toast && (
        <div
          role={toast.type === "error" ? "alert" : "status"}
          className={toast.type === "error" ? styles.invalidNotice : styles.saveNotice}
        >
          {toast.msg}
        </div>
      )}
      <header className={styles.masthead}>
        <div className={styles.mastheadCopy}>
          <p className={styles.mastheadMark}>
            <Palette className="h-5 w-5" />
            {t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <div className={styles.mastheadActions}>
          <button
            type="button"
            onClick={() => setTheme(structuredClone(DEFAULT_SITE_THEME))}
            disabled={save.isPending}
            className="btn btn-ghost"
          >
            <Reinitialiser className="mr-1 h-4 w-4" />
            {t("reset")}
          </button>
          <button
            type="button"
            onClick={() => setTheme(structuredClone(savedTheme!))}
            disabled={save.isPending || !dirty}
            className="btn btn-ghost"
          >
            {t("discard")}
          </button>
          <button
            type="button"
            onClick={() => save.mutate(structuredClone(theme))}
            disabled={save.isPending || !dirty || !valid}
            className="btn btn-primary"
          >
            <Enregistrer className="mr-1 h-4 w-4" />
            {save.isPending ? t("saving") : dirty ? t("apply") : t("upToDate")}
          </button>
        </div>
      </header>
      <div className={styles.layout}>
        <div className={styles.controls}>
          {Object.entries(GROUPS).map(([name, keys]) => (
            <fieldset className={styles.group} key={name} disabled={save.isPending}>
              <legend className={styles.groupLegend}>{t("groups." + name)}</legend>
              <div className={styles.colorList}>
                {keys.map((key) => (
                  <ColorRow
                    key={key}
                    colorKey={key}
                    value={theme.colors[key]}
                    disabled={save.isPending}
                    onChange={(value) => update("colors", { ...theme.colors, [key]: value })}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset className={styles.radiusPanel} disabled={save.isPending}>
            <legend className={styles.groupLegend}>{t("layoutTitle")}</legend>
            <label className={styles.settingLabel} htmlFor="theme-radius">
              {t("radius")}
              <output>{theme.radius.toFixed(2)} rem</output>
            </label>
            <input
              id="theme-radius"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={theme.radius}
              onChange={(event) => update("radius", Number(event.target.value))}
              className={styles.range}
            />
            <label className={styles.settingLabel} htmlFor="theme-fontFamily">
              {t("fontFamily")}
            </label>
            <select
              id="theme-fontFamily"
              value={theme.fontFamily}
              onChange={(event) =>
                update("fontFamily", event.target.value as SiteTheme["fontFamily"])
              }
              className={styles.hexInput}
            >
              {["sans", "system", "serif", "mono"].map((key) => (
                <option key={key} value={key}>
                  {t("fonts." + key)}
                </option>
              ))}
            </select>
            <label className={styles.settingLabel} htmlFor="theme-fontScale">
              {t("fontScale")}
              <output>{Math.round(theme.fontScale * 100)}%</output>
            </label>
            <input
              id="theme-fontScale"
              type="range"
              min={0.875}
              max={1.25}
              step={0.025}
              value={theme.fontScale}
              onChange={(event) => update("fontScale", Number(event.target.value))}
              className={styles.range}
            />
            <label className={styles.settingLabel} htmlFor="theme-contentWidth">
              {t("contentWidth")}
              <output>{theme.contentWidth} px</output>
            </label>
            <input
              id="theme-contentWidth"
              type="range"
              min={960}
              max={1920}
              step={20}
              value={theme.contentWidth}
              onChange={(event) => update("contentWidth", Number(event.target.value))}
              className={styles.range}
            />
            <label className={styles.settingLabel} htmlFor="theme-density">
              {t("density")}
            </label>
            <select
              id="theme-density"
              value={theme.density}
              onChange={(event) => update("density", event.target.value as SiteTheme["density"])}
              className={styles.hexInput}
            >
              {["compact", "comfortable", "spacious"].map((key) => (
                <option key={key} value={key}>
                  {t("densities." + key)}
                </option>
              ))}
            </select>
          </fieldset>
          {!valid && <p className={styles.invalidNotice}>{t("invalidColors")}</p>}
        </div>
        <Preview theme={theme} />
      </div>
    </main>
  );
}
