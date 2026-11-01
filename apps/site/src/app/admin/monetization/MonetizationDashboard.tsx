"use client";

import { useEffect, useState } from "react";
import { useT } from "@/components/T";

type Advertiser = {
  id: string;
  legalName: string;
  contactEmail: string;
  status: string;
  contractReference: string | null;
};
type Campaign = {
  campaign: {
    id: string;
    advertiserId: string;
    name: string;
    status: string;
    budgetMinor: number;
    dailyCapMinor: number | null;
  };
  advertiserName: string;
};
type Creative = {
  id: string;
  campaignId: string;
  locale: string;
  format: string;
  headline: string;
  body: string | null;
  destinationUrl: string;
  status: string;
};
type Placement = {
  id: string;
  slotKey: string;
  name: string;
  formats: string[];
  allowedPathPrefixes: string[];
  blockedPathPrefixes: string[];
  active: boolean;
  exemptVip: boolean;
};
type DailyEvent = {
  day: string;
  campaignId: string;
  placementId: string;
  impressions: number;
  clicks: number;
  spendMinor: number;
  currency: string;
};
type Snapshot = { advertisers: Advertiser[]; campaigns: Campaign[]; creatives: Creative[] };
type DashboardSnapshot = Snapshot & { placements: Placement[]; dailyEvents: DailyEvent[] };

export function MonetizationDashboard() {
  const t = useT();
  const [data, setData] = useState<DashboardSnapshot>({
    advertisers: [],
    campaigns: [],
    creatives: [],
    placements: [],
    dailyEvents: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function reload() {
    const response = await fetch("/api/admin/monetization", { cache: "no-store" });
    if (!response.ok) throw new Error(t("monetization.loadError"));
    setData((await response.json()) as DashboardSnapshot);
  }

  async function savePlacement(form: FormData) {
    await mutate("POST", {
      action: "placement.upsert",
      slotKey: form.get("slotKey"),
      name: form.get("placementName"),
      formats: form.getAll("formats"),
      allowedPathPrefixes: String(form.get("allowedPaths") ?? "")
        .split("\n")
        .map((path) => path.trim())
        .filter(Boolean),
      blockedPathPrefixes: ["/admin", "/studio", "/desktop", "/workshop"],
      exemptVip: true,
      active: false,
    });
  }

  useEffect(() => {
    let mounted = true;
    void fetch("/api/admin/monetization", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("monetization.loadError"));
        return (await response.json()) as DashboardSnapshot;
      })
      .then((snapshot) => {
        if (mounted) setData(snapshot);
        return snapshot;
      })
      .catch((reason: unknown) => {
        if (mounted)
          setError(reason instanceof Error ? reason.message : t("monetization.loadError"));
      });
    return () => {
      mounted = false;
    };
  }, [t]);

  async function mutate(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/monetization", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(t("monetization.actionRejected"));
      await reload();
      setNotice(t("monetization.saved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("monetization.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function createAdvertiser(form: FormData) {
    await mutate("POST", {
      action: "advertiser.create",
      legalName: form.get("legalName"),
      contactEmail: form.get("contactEmail"),
      contractReference: form.get("contractReference"),
    });
  }
  async function createCampaign(form: FormData) {
    await mutate("POST", {
      action: "campaign.create",
      advertiserId: form.get("advertiserId"),
      name: form.get("name"),
      budgetMinor: Math.round(Number(form.get("budget")) * 100),
      dailyCapMinor: form.get("dailyCap") ? Math.round(Number(form.get("dailyCap")) * 100) : null,
      placementIds: form.getAll("placementIds"),
    });
  }
  async function createCreative(form: FormData) {
    await mutate("POST", {
      action: "creative.create",
      campaignId: form.get("campaignId"),
      locale: form.get("locale"),
      format: form.get("format"),
      headline: form.get("headline"),
      body: form.get("body"),
      destinationUrl: form.get("destinationUrl"),
      imageUrl: form.get("imageUrl"),
    });
  }

  const field =
    "min-w-0 min-h-11 rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300";
  const button =
    "min-h-11 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-50";
  const section = "rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5";
  const statusLabel = (status: string) => t(`monetization.status.${status}`) || status;
  const formatLabel = (format: string) => t(`monetization.format.${format}`) || format;
  return (
    <div className="space-y-6 text-white">
      <div aria-live="polite" className="space-y-2">
        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </p>
        )}
        {notice && (
          <output className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {notice}
          </output>
        )}
      </div>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.newAdvertiser")}</h2>
        <form action={createAdvertiser} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.legalName")}
            <input className={field} name="legalName" minLength={2} maxLength={200} required />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.contactEmail")}
            <input className={field} name="contactEmail" type="email" maxLength={254} required />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.contractReference")}
            <input className={field} name="contractReference" maxLength={160} />
          </label>
          <button className={button} disabled={busy}>
            {t("monetization.createAdvertiser")}
          </button>
        </form>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.newCampaign")}</h2>
        <form action={createCampaign} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.chooseApprovedAdvertiser")}
            <select className={field} name="advertiserId" required defaultValue="">
              <option value="" disabled>
                {t("monetization.chooseApprovedAdvertiser")}
              </option>
              {data.advertisers
                .filter((item) => item.status === "approved")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.legalName}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.campaignName")}
            <input className={field} name="name" minLength={2} maxLength={160} required />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.totalBudgetEur")}
            <input className={field} name="budget" type="number" min="1" step="0.01" required />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.dailyCapEur")}
            <input className={field} name="dailyCap" type="number" min="0.01" step="0.01" />
          </label>
          <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-2">
            <legend className="mb-2 text-white/70">{t("monetization.requiredPlacements")}</legend>
            {(data.placements ?? [])
              .filter((placement) => placement.active)
              .map((placement) => (
                <label key={placement.id} className="flex min-h-11 items-center gap-3 py-2">
                  <input
                    className="size-5 accent-amber-300"
                    type="checkbox"
                    name="placementIds"
                    value={placement.id}
                  />
                  {placement.name}
                </label>
              ))}
          </fieldset>
          <button
            className={button}
            disabled={busy || !data.advertisers.some((item) => item.status === "approved")}
          >
            {t("monetization.createCampaign")}
          </button>
        </form>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.newCreative")}</h2>
        <form action={createCreative} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.chooseEditableCampaign")}
            <select className={field} name="campaignId" required defaultValue="">
              <option value="" disabled>
                {t("monetization.chooseEditableCampaign")}
              </option>
              {data.campaigns
                .filter(({ campaign }) => ["draft", "pending_review"].includes(campaign.status))
                .map(({ campaign }) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.headline")}
            <input className={field} name="headline" minLength={2} maxLength={120} required />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.language.fr")}
            <select className={field} name="locale" defaultValue="fr">
              <option value="fr">{t("monetization.language.fr")}</option>
              <option value="en">{t("monetization.language.en")}</option>
              <option value="ja">{t("monetization.language.ja")}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.format.native")}
            <select className={field} name="format" defaultValue="native">
              <option value="native">{formatLabel("native")}</option>
              <option value="banner">{formatLabel("banner")}</option>
              <option value="rectangle">{formatLabel("rectangle")}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.body")}
            <input className={field} name="body" maxLength={400} />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.imageUrl")}
            <input className={field} name="imageUrl" type="url" />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.destinationUrl")}
            <input className={field} name="destinationUrl" type="url" required />
          </label>
          <button
            className={button}
            disabled={
              busy ||
              !data.campaigns.some(({ campaign }) =>
                ["draft", "pending_review"].includes(campaign.status),
              )
            }
          >
            {t("monetization.submitForReview")}
          </button>
        </form>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.advertisers")}</h2>
        <ul className="mt-3 divide-y divide-white/10">
          {data.advertisers.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <span>
                <strong>{item.legalName}</strong>
                <span className="ml-2 text-white/55">
                  {item.contactEmail} · {statusLabel(item.status)}
                </span>
              </span>
              <span className="flex gap-2">
                {["approved", "paused", "rejected"].map((status) => (
                  <button
                    key={status}
                    className={button}
                    disabled={busy || item.status === status}
                    onClick={() =>
                      void mutate("PATCH", { action: "advertiser.review", id: item.id, status })
                    }
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.campaigns")}</h2>
        <ul className="mt-3 divide-y divide-white/10">
          {data.campaigns.map(({ campaign, advertiserName }) => (
            <li
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <span>
                <strong>{campaign.name}</strong>
                <span className="ml-2 text-white/55">
                  {advertiserName} · {statusLabel(campaign.status)} ·{" "}
                  {(campaign.budgetMinor / 100).toFixed(2)} EUR
                </span>
              </span>
              <span className="flex gap-2">
                {campaign.status !== "active" && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void mutate("PATCH", { action: "campaign.approve", id: campaign.id })
                    }
                  >
                    {t("monetization.activate")}
                  </button>
                )}
                {campaign.status !== "paused" && (
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() =>
                      void mutate("PATCH", { action: "campaign.pause", id: campaign.id })
                    }
                  >
                    {t("monetization.pause")}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.placements")}</h2>
        <p className="mt-1 text-sm text-white/60">{t("monetization.placementPolicy")}</p>
        <form action={savePlacement} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.placementKey")}
            <input
              className={field}
              name="slotKey"
              minLength={2}
              maxLength={64}
              pattern="[a-z0-9][a-z0-9_-]+"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm text-white/80">
            {t("monetization.internalName")}
            <input className={field} name="placementName" minLength={2} maxLength={100} required />
          </label>
          <fieldset className="flex flex-wrap gap-3 text-sm sm:col-span-2">
            <legend className="mb-2 text-white/70">{t("monetization.allowedFormats")}</legend>
            {[
              ["native", formatLabel("native")],
              ["banner", formatLabel("banner")],
              ["rectangle", formatLabel("rectangle")],
            ].map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-3 py-2">
                <input
                  className="size-5 accent-amber-300"
                  type="checkbox"
                  name="formats"
                  value={value}
                  defaultChecked={value === "native"}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="grid gap-1.5 text-sm text-white/80 sm:col-span-2">
            {t("monetization.allowedPaths")}
            <textarea className={field} name="allowedPaths" rows={3} required />
          </label>
          <button className={button} disabled={busy}>
            {t("monetization.savePlacement")}
          </button>
        </form>
        <ul className="mt-4 divide-y divide-white/10">
          {(data.placements ?? []).map((placement) => (
            <li
              key={placement.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <span>
                <strong>{placement.name}</strong>
                <span className="ml-2 text-white/55">
                  {placement.slotKey} · {placement.formats.map(formatLabel).join(", ")} ·{" "}
                  {placement.allowedPathPrefixes.join(", ")} ·{" "}
                  {placement.exemptVip
                    ? t("monetization.vipExcluded")
                    : t("monetization.vipIncluded")}
                </span>
              </span>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void mutate("PATCH", {
                    action: "placement.update",
                    id: placement.id,
                    active: !placement.active,
                  })
                }
              >
                {placement.active ? t("monetization.deactivate") : t("monetization.activate")}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.creativesToReview")}</h2>
        <ul className="mt-3 divide-y divide-white/10">
          {data.creatives.map((item: Creative) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <span>
                <strong>{item.headline}</strong>
                <span className="ml-2 text-white/55">
                  {t(`monetization.language.${item.locale}`) || item.locale} ·{" "}
                  {formatLabel(item.format)} · {statusLabel(item.status)}
                </span>
              </span>
              <span className="flex gap-2">
                {["approved", "paused", "rejected"].map((status) => (
                  <button
                    key={status}
                    className={button}
                    disabled={busy || item.status === status}
                    onClick={() =>
                      void mutate("PATCH", { action: "creative.review", id: item.id, status })
                    }
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold">{t("monetization.dailyReport")}</h2>
        <p className="mt-1 text-sm text-white/60">{t("monetization.reportingNote")}</p>
        <ul className="mt-3 divide-y divide-white/10">
          {(data.dailyEvents ?? []).map((event) => (
            <li
              key={`${event.day}-${event.campaignId}-${event.placementId}`}
              className="py-2 text-sm text-white/75"
            >
              {t("monetization.dailyEvent", {
                day: event.day,
                campaign: event.campaignId,
                impressions: event.impressions,
                clicks: event.clicks,
                spend: (event.spendMinor / 100).toFixed(2),
                currency: event.currency,
              })}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
