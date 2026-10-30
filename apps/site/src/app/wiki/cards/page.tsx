import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@aphrody/shenron-ui/layout/PageHeader";
import { PageShell } from "@aphrody/shenron-ui/layout/PageShell";
import { getPublicCardCatalog, getPublishedCardCount } from "@/lib/card-catalog";

export const revalidate = 3600;

type Params = Promise<{
  search?: string;
  series?: string;
  language?: string;
  region?: string;
  after?: string;
}>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Params;
}): Promise<Metadata> {
  const [t, count, params] = await Promise.all([
    getTranslations("cardCatalog"),
    getPublishedCardCount().catch(() => 0),
    searchParams,
  ]);
  const filtered = Boolean(
    params.search || params.series || params.language || params.region || params.after,
  );
  const description = t("description");
  return {
    title: t("title"),
    description,
    alternates: { canonical: "/wiki/cards" },
    robots:
      count > 0 && !filtered ? { index: true, follow: true } : { index: false, follow: false },
  };
}

function currency(value: string, code: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

function dateLabel(value: string | null, locale: string, precision?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  const options: Intl.DateTimeFormatOptions =
    precision === "year"
      ? { year: "numeric", timeZone: "UTC" }
      : precision === "month"
        ? { month: "long", year: "numeric", timeZone: "UTC" }
        : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  const text = new Intl.DateTimeFormat(locale, options).format(parsed);
  return precision === "approximate" ? `~${text}` : text;
}

export default async function CardCatalogPage({ searchParams }: { searchParams: Params }) {
  const [t, locale, params, publishedCount] = await Promise.all([
    getTranslations("cardCatalog"),
    getLocale(),
    searchParams,
    getPublishedCardCount().catch(() => 0),
  ]);
  const data = await getPublicCardCatalog({
    search: params.search,
    seriesId: params.series,
    language: params.language,
    region: params.region,
    after: params.after,
  }).catch(() => null);
  const activeFilters = Boolean(params.search || params.series || params.language || params.region);
  const next = new URLSearchParams();
  if (params.search) next.set("search", params.search);
  if (params.series) next.set("series", params.series);
  if (params.language) next.set("language", params.language);
  if (params.region) next.set("region", params.region);
  if (data?.nextCursor) next.set("after", data.nextCursor);

  return (
    <PageShell rhythm="tight">
      <Breadcrumbs className="mb-4" items={[{ label: t("title") }]} />
      <PageHeader
        className="mb-6"
        eyebrow={t("series")}
        title={t("title")}
        subtitle={t("description")}
      />
      {publishedCount > 0 && data && (
        <p className="mb-5 text-sm text-muted-foreground">
          {t("results", {
            count: (activeFilters ? data.total : publishedCount).toLocaleString(locale),
          })}
        </p>
      )}

      {data && publishedCount > 0 && (
        <form
          method="get"
          className="mb-7 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>{t("search")}</span>
            <input
              name="search"
              defaultValue={params.search}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground"
            />
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>{t("series")}</span>
            <select
              name="series"
              defaultValue={params.series ?? ""}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground"
            >
              <option value="">{t("allSeries")}</option>
              {data.series.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>{t("language")}</span>
            <select
              name="language"
              defaultValue={params.language ?? ""}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground"
            >
              <option value="">{t("allLanguages")}</option>
              {data.languages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>{t("region")}</span>
            <select
              name="region"
              defaultValue={params.region ?? ""}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground"
            >
              <option value="">{t("allRegions")}</option>
              {data.regions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              className="min-h-11 flex-1 rounded-md bg-primary px-4 font-semibold text-primary-foreground"
              type="submit"
            >
              {t("searchAction")}
            </button>
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm"
              href="/wiki/cards"
            >
              {t("reset")}
            </Link>
          </div>
        </form>
      )}

      {!data ? (
        <output className="block rounded-xl border border-border p-6 text-muted-foreground">
          {t("catalogUnavailable")}
        </output>
      ) : publishedCount === 0 ? (
        <section className="rounded-xl border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold">{t("emptyTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("empty")}</p>
        </section>
      ) : data.rows.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-muted-foreground">
          {t("noResults")}
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.rows.map(({ card, set, series }) => {
              const valuation = data.latestValuations.get(card.id);
              const releaseDate = dateLabel(
                card.releaseDate ?? set.releaseDate,
                locale,
                set.releaseDatePrecision,
              );
              return (
                <article
                  key={card.id}
                  className="overflow-hidden rounded-xl border border-border bg-card"
                >
                  <Link
                    href={`/wiki/cards/${card.slug}`}
                    className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {card.frontImageUrl ? (
                      <img
                        src={card.frontImageUrl}
                        alt={card.name}
                        loading="lazy"
                        className="aspect-[3/4] w-full object-contain bg-background"
                      />
                    ) : (
                      <div className="grid aspect-[3/4] place-items-center bg-background p-6 text-center text-muted-foreground">
                        {card.cardNumber}
                      </div>
                    )}
                    <div className="space-y-2 p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {series.name} · {set.name}
                      </p>
                      <h2 className="text-lg font-semibold text-foreground">{card.name}</h2>
                      <p className="text-sm text-muted-foreground">
                        {t("number")}: {card.cardNumber}
                        {card.rarity ? ` · ${card.rarity}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {card.language} · {card.region}
                        {releaseDate ? ` · ${releaseDate}` : ""}
                      </p>
                      {valuation && (
                        <p className="text-sm text-primary">
                          {t("estimateRange", {
                            min: currency(valuation.valueMin, valuation.currency, locale),
                            max: currency(valuation.valueMax, valuation.currency, locale),
                          })}{" "}
                          <span className="text-xs text-muted-foreground">
                            {valuation.observedAt}
                          </span>
                        </p>
                      )}
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
          {data.nextCursor && (
            <nav aria-label={t("pagination")} className="mt-8 flex justify-center">
              <Link
                className="inline-flex min-h-11 items-center rounded-md border border-border px-5 font-medium"
                href={`/wiki/cards?${next.toString()}`}
              >
                {t("nextPage")}
              </Link>
            </nav>
          )}
          {activeFilters && (
            <p className="mt-5 text-center text-xs text-muted-foreground">{t("filteredNotice")}</p>
          )}
        </>
      )}
    </PageShell>
  );
}
