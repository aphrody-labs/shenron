import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { WikiDetailPage, WikiEntityHeader } from "@/components/wiki/WikiDetailPage";
import { getPublishedCardBySlug } from "@/lib/card-catalog";

export const revalidate = 3600;

function money(value: string, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 4,
  }).format(Number(value));
}

function release(value: string | null, precision: string | null, locale: string) {
  if (!value) return null;
  const options: Intl.DateTimeFormatOptions =
    precision === "year"
      ? { year: "numeric", timeZone: "UTC" }
      : precision === "month"
        ? { month: "long", year: "numeric", timeZone: "UTC" }
        : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  const formatted = new Intl.DateTimeFormat(locale, options).format(
    new Date(`${value}T12:00:00.000Z`),
  );
  return precision === "approximate" ? `~${formatted}` : formatted;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, t] = await Promise.all([params, getTranslations("cardCatalog")]);
  const entry = await getPublishedCardBySlug(slug).catch(() => null);
  if (!entry) return { title: t("title"), robots: { index: false, follow: false } };
  return {
    title: `${entry.card.name} · ${entry.card.cardNumber}`,
    description: entry.card.description?.slice(0, 155) || t("description"),
    alternates: { canonical: `/wiki/cards/${entry.card.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function OfficialCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, t, locale] = await Promise.all([
    params,
    getTranslations("cardCatalog"),
    getLocale(),
  ]);
  const entry = await getPublishedCardBySlug(slug).catch(() => null);
  if (!entry) notFound();
  const cardDate = release(entry.card.releaseDate, null, locale);
  const setDate = release(entry.set.releaseDate, entry.set.releaseDatePrecision, locale);

  return (
    <WikiDetailPage
      entity={entry.card.name}
      source="official_cards"
      crumbs={[{ label: t("title"), href: "/wiki/cards" }, { label: entry.card.name }]}
      header={
        <WikiEntityHeader
          name={entry.card.name}
          chips={
            <>
              <Link
                href={`/wiki/cards?series=${encodeURIComponent(entry.series.id)}`}
                className="inline-flex min-h-11 items-center text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {entry.series.name}
              </Link>
              <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-dbz-orange">
                {`${entry.set.name} · ${entry.card.cardNumber}`}
              </span>
            </>
          }
        >
          <p className="text-base text-white/70">
            {`${entry.card.language} · ${entry.card.region}${entry.card.rarity ? ` · ${entry.card.rarity}` : ""}`}
          </p>
        </WikiEntityHeader>
      }
      aside={
        <div className="h-fit rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("details")}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Detail label={t("number")} value={entry.card.cardNumber} />
            <Detail label={t("series")} value={entry.series.name} />
            <Detail label={t("set")} value={entry.set.name} />
            <Detail label={t("publisher")} value={entry.series.publisher} />
            <Detail label={t("format")} value={entry.series.format} />
            <Detail label={t("language")} value={entry.card.language} />
            <Detail label={t("region")} value={entry.card.region} />
            {entry.card.rarity && <Detail label={t("rarity")} value={entry.card.rarity} />}
            {(cardDate || setDate) && (
              <Detail label={t("releaseDate")} value={cardDate ?? setDate!} />
            )}
            {entry.set.productCode && (
              <Detail label={t("productCode")} value={entry.set.productCode} />
            )}
          </dl>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("sources")}</p>
            <ul className="mt-2 space-y-3">
              {[
                { id: "series", owner: entry.series },
                { id: "set", owner: entry.set },
                { id: "card", owner: entry.card },
              ].map(({ id, owner }) => (
                <li key={id} className="rounded-lg border border-border/70 bg-background/60 p-3">
                  <p className="text-xs font-medium text-muted-foreground">{owner.name}</p>
                  <a
                    href={owner.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {owner.sourceLabel}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {t("sourceAccessed", { date: owner.sourceAccessedAt })}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      {(entry.card.frontImageUrl || entry.card.backImageUrl) && (
        <section className="grid gap-5 md:grid-cols-2">
          {entry.card.frontImageUrl && (
            <figure className="space-y-2">
              <img
                src={entry.card.frontImageUrl}
                alt={`${entry.card.name} — ${t("front")}`}
                decoding="async"
                className="mx-auto max-h-[680px] w-full rounded-xl border border-border bg-card p-2 object-contain"
              />
              <figcaption className="text-sm text-muted-foreground">
                {t("front")} · {entry.card.frontImageRights} ·{" "}
                <a
                  href={entry.card.frontImageSourceUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t("imageCredit")}
                </a>
              </figcaption>
            </figure>
          )}
          {entry.card.backImageUrl && (
            <figure className="space-y-2">
              <img
                src={entry.card.backImageUrl}
                alt={`${entry.card.name} — ${t("back")}`}
                decoding="async"
                className="mx-auto max-h-[680px] w-full rounded-xl border border-border bg-card p-2 object-contain"
              />
              <figcaption className="text-sm text-muted-foreground">
                {t("back")} · {entry.card.backImageRights} ·{" "}
                <a
                  href={entry.card.backImageSourceUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t("imageCredit")}
                </a>
              </figcaption>
            </figure>
          )}
        </section>
      )}

      {entry.card.description && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">{t("descriptionLabel")}</h2>
          <p className="mt-2 whitespace-pre-line leading-7 text-muted-foreground">
            {entry.card.description}
          </p>
        </section>
      )}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">{t("estimateHistory")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("notFinancialAdvice")}</p>
        {entry.valuations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("noEstimate")}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {entry.valuations.map((observation) => (
              <li key={observation.id} className="rounded-lg border border-border/70 p-4">
                <p className="font-semibold">
                  {t("estimateRange", {
                    min: money(observation.valueMin, observation.currency, locale),
                    max: money(observation.valueMax, observation.currency, locale),
                  })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("estimateCondition", { condition: observation.condition })} ·{" "}
                  {t("estimateDate", { date: observation.observedAt })}
                </p>
                <a
                  href={observation.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center text-sm text-primary underline"
                >
                  {observation.sourceLabel}
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </WikiDetailPage>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
