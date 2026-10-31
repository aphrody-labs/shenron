import Link from "next/link";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { WikiIndexPage } from "@/components/wiki/WikiIndexPage";
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
  const [t, locale, params] = await Promise.all([
    getTranslations("cardCatalog"),
    getLocale(),
    searchParams,
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
    <WikiIndexPage
      eyebrow={t("series")}
      title={t("title")}
      lead={t("description")}
      crumbs={[{ label: t("title") }]}
    >
      {data && data.total > 0 && (
        <p className="mb-5 text-sm text-muted-foreground">
          {t("results", { count: data.total.toLocaleString(locale) })}
        </p>
      )}

      {data && (data.total > 0 || activeFilters) && (
        <form
          method="get"
          className="mb-7 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>{t("search")}</span>
            <input
              name="search"
              type="search"
              defaultValue={params.search}
              autoComplete="off"
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </label>
          <label className="grid gap-1 text-sm text-muted-foreground">
            <span>{t("series")}</span>
            <select
              name="series"
              defaultValue={params.series ?? ""}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50"
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
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50"
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
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/50"
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
              className="min-h-11 flex-1 rounded-md bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              type="submit"
            >
              {t("searchAction")}
            </button>
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              href="/wiki/cards"
            >
              {t("reset")}
            </Link>
          </div>
        </form>
      )}

      {!data ? (
        <output className="block rounded-xl border border-border bg-card p-6 text-muted-foreground">
          {t("catalogUnavailable")}
        </output>
      ) : data.total === 0 && !activeFilters ? (
        <section className="grid items-center gap-8 overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.8fr)] lg:p-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t("series")}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {t("emptyTitle")}
            </h2>
            <p className="mt-3 max-w-prose leading-7 text-muted-foreground">{t("empty")}</p>
          </div>
          <div
            aria-hidden="true"
            className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-border/70 bg-background"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,var(--muted),transparent_68%)]" />
            <div className="absolute left-[18%] top-[21%] h-[62%] w-[40%] -rotate-12 rounded-xl border border-border bg-card shadow-xl" />
            <div className="absolute left-[43%] top-[14%] h-[68%] w-[42%] rotate-[8deg] rounded-xl border border-primary/30 bg-card shadow-2xl">
              <div className="absolute inset-2 rounded-lg border border-border/80" />
              <div className="absolute inset-x-4 top-4 h-[58%] rounded-md border border-border/70 bg-muted/50" />
              <div className="absolute inset-x-4 bottom-4 h-2 rounded-full bg-muted" />
              <div className="absolute inset-x-4 bottom-8 h-1.5 w-1/2 rounded-full bg-muted/70" />
            </div>
          </div>
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
                  className="group overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <Link
                    href={`/wiki/cards/${card.slug}`}
                    className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    {card.frontImageUrl ? (
                      <img
                        src={card.frontImageUrl}
                        alt={`${card.name} — ${t("front")}`}
                        loading="lazy"
                        decoding="async"
                        className="aspect-[3/4] w-full border-b border-border/70 bg-background object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
                      />
                    ) : (
                      <div className="grid aspect-[3/4] place-items-center border-b border-border/70 bg-muted/30 p-6 text-center">
                        <span className="rounded-lg border border-border bg-card px-4 py-3 font-mono text-sm font-semibold tracking-wide text-muted-foreground shadow-sm">
                          {card.cardNumber}
                        </span>
                      </div>
                    )}
                    <div className="space-y-2 p-4">
                      <p className="line-clamp-1 text-xs uppercase tracking-wide text-muted-foreground">
                        {series.name} · {set.name}
                      </p>
                      <h2 className="line-clamp-2 min-h-14 text-lg font-semibold text-foreground">
                        {card.name}
                      </h2>
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
    </WikiIndexPage>
  );
}
