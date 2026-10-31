import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/session";
import { getCardCatalogAdminData } from "@/lib/card-catalog";
import { archiveCardCatalogEntry, saveCardCatalogEntry } from "./_actions";
import { CardCatalogImportForm } from "./CardCatalogImportForm";
import { CardCatalogImageField } from "./CardCatalogImageField";

export const dynamic = "force-dynamic";

type Translator = Awaited<ReturnType<typeof getTranslations<"adminCardCatalog">>>;
type Series = Awaited<ReturnType<typeof getCardCatalogAdminData>>["series"][number];
type SetRow = Awaited<ReturnType<typeof getCardCatalogAdminData>>["sets"][number];
type CardRow = Awaited<ReturnType<typeof getCardCatalogAdminData>>["cards"][number];
type ValuationRow = Awaited<ReturnType<typeof getCardCatalogAdminData>>["valuations"][number];
const EMPTY_SERIES: Series[] = [];
const EMPTY_SETS: SetRow[] = [];
const EMPTY_CARDS: CardRow[] = [];

export async function generateMetadata() {
  const t = await getTranslations("adminCardCatalog");
  return { title: t("title") };
}

export default async function AdminCardCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; after?: string }>;
}) {
  await requireAdmin();
  const [t, params] = await Promise.all([getTranslations("adminCardCatalog"), searchParams]);
  const data = await getCardCatalogAdminData({ search: params.search, after: params.after });
  const liveSeries = data.series.filter((row) => row.status !== "archived");
  const liveSets = data.sets.filter(
    (row) => row.set.status !== "archived" && row.seriesStatus !== "archived",
  );
  const nextPageQuery = new URLSearchParams();
  if (params.search) nextPageQuery.set("search", params.search);
  if (data.nextCardCursor) nextPageQuery.set("after", data.nextCardCursor);
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <header className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-muted/30 px-5 py-6 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {t("kicker")}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border">
          {[
            [t("series"), data.series.length],
            [t("sets"), data.sets.length],
            [t("cards"), data.cardCount],
          ].map(([label, value]) => (
            <div key={label} className="px-4 py-4 text-center sm:px-6 sm:py-5">
              <dt className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        {params.status === "saved" && (
          <output
            aria-live="polite"
            className="block border-t border-border bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300 sm:px-8"
          >
            {t("saved")}
          </output>
        )}
        {params.status === "invalid" && (
          <p
            role="alert"
            className="border-t border-border bg-destructive/10 px-5 py-3 text-sm font-medium text-destructive sm:px-8"
          >
            {t("invalid")}
          </p>
        )}
      </header>

      <nav
        aria-label={t("title")}
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3"
      >
        {[
          ["import", t("importTitle")],
          ["series", t("series")],
          ["sets", t("sets")],
          ["cards", t("cards")],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {label}
          </a>
        ))}
      </nav>

      <div id="import" className="scroll-mt-6">
        <CardCatalogImportForm />
      </div>

      <section id="series" aria-labelledby="series-title" className="scroll-mt-6 space-y-4">
        <h2 id="series-title" className="flex items-center gap-3 text-xl font-semibold">
          {t("series")}
          <span className="rounded-full bg-muted px-2.5 py-1 text-sm tabular-nums text-muted-foreground">
            {data.series.length}
          </span>
        </h2>
        <details className="rounded-xl border border-dashed border-border bg-card">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold text-primary">
            {t("createSeries")}
            <span aria-hidden="true" className="text-lg">
              +
            </span>
          </summary>
          <div className="border-t border-border p-4">
            <EntryForm kind="series" t={t} />
          </div>
        </details>
        {data.series.length === 0 ? (
          <Empty t={t} />
        ) : (
          data.series.map((series) => (
            <details key={series.id} className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer font-medium">
                {series.name} · {t(series.status)}
              </summary>
              <div className="mt-4">
                <EntryForm kind="series" t={t} series={series} />
              </div>
              <ArchiveForm kind="series" id={series.id} t={t} />
            </details>
          ))
        )}
      </section>

      <section id="sets" aria-labelledby="sets-title" className="scroll-mt-6 space-y-4">
        <h2 id="sets-title" className="flex items-center gap-3 text-xl font-semibold">
          {t("sets")}
          <span className="rounded-full bg-muted px-2.5 py-1 text-sm tabular-nums text-muted-foreground">
            {data.sets.length}
          </span>
        </h2>
        {liveSeries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSeries")}</p>
        ) : (
          <details className="rounded-xl border border-dashed border-border bg-card">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold text-primary">
              {t("createSet")}
              <span aria-hidden="true" className="text-lg">
                +
              </span>
            </summary>
            <div className="border-t border-border p-4">
              <EntryForm kind="set" t={t} seriesOptions={liveSeries} />
            </div>
          </details>
        )}
        {data.sets.length === 0 ? (
          <Empty t={t} />
        ) : (
          data.sets.map(({ set, seriesName }) => (
            <details key={set.id} className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer font-medium">
                {seriesName} · {set.name} · {t(set.status)}
              </summary>
              <div className="mt-4">
                <EntryForm kind="set" t={t} setRow={set} seriesOptions={data.series} />
              </div>
              <ArchiveForm kind="set" id={set.id} t={t} />
            </details>
          ))
        )}
      </section>

      <section id="cards" aria-labelledby="cards-title" className="scroll-mt-6 space-y-4">
        <h2 id="cards-title" className="flex items-center gap-3 text-xl font-semibold">
          {t("cards")}
          <span className="rounded-full bg-muted px-2.5 py-1 text-sm tabular-nums text-muted-foreground">
            {data.cardCount}
          </span>
        </h2>
        <form
          method="get"
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row"
        >
          <label className="grid flex-1 gap-1.5 text-sm text-muted-foreground">
            <span>{t("searchCards")}</span>
            <input
              name="search"
              defaultValue={params.search}
              className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground"
            />
          </label>
          <button
            type="submit"
            className="min-h-11 self-end rounded-md bg-primary px-4 font-semibold text-primary-foreground"
          >
            {t("searchAction")}
          </button>
        </form>
        {params.search && (
          <p className="text-sm text-muted-foreground">
            {data.cards.length} / {data.filteredCardCount}
          </p>
        )}
        {liveSets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSets")}</p>
        ) : (
          <details className="rounded-xl border border-dashed border-border bg-card">
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 font-semibold text-primary">
              {t("createCard")}
              <span aria-hidden="true" className="text-lg">
                +
              </span>
            </summary>
            <div className="border-t border-border p-4">
              <EntryForm kind="card" t={t} setOptions={liveSets} />
            </div>
          </details>
        )}
        {data.cards.length === 0 ? (
          <Empty t={t} />
        ) : (
          data.cards.map(({ card, setName, seriesName }) => (
            <details key={card.id} className="rounded-xl border border-border bg-card p-4">
              <summary className="cursor-pointer font-medium">
                {seriesName} · {setName} · {card.cardNumber} — {card.name} · {t(card.status)}
              </summary>
              <div className="mt-4 space-y-4">
                <EntryForm kind="card" t={t} cardRow={card} setOptions={data.sets} />
                <ArchiveForm kind="card" id={card.id} t={t} />
                <div className="border-t border-border pt-4">
                  <h3 className="mb-3 font-semibold">{t("valuationHistory")}</h3>
                  {card.status !== "archived" && (
                    <EntryForm kind="valuation" t={t} cardOptions={data.cards} cardId={card.id} />
                  )}
                  {data.valuations
                    .filter((row) => row.valuation.cardId === card.id)
                    .map((row) => (
                      <details
                        key={row.valuation.id}
                        className="mt-3 rounded-lg border border-border p-3"
                      >
                        <summary className="cursor-pointer text-sm">
                          {row.valuation.observedAt} · {row.valuation.valueMin}–
                          {row.valuation.valueMax} {row.valuation.currency}
                        </summary>
                        <div className="mt-3">
                          <EntryForm
                            kind="valuation"
                            t={t}
                            valuationRow={row}
                            cardOptions={data.cards}
                            cardId={card.id}
                          />
                        </div>
                      </details>
                    ))}
                </div>
              </div>
            </details>
          ))
        )}
        {data.nextCardCursor && (
          <nav
            aria-label={t("pagination")}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <p className="text-sm text-muted-foreground">
              {data.cards.length} / {data.filteredCardCount}
            </p>
            <Link
              href={`/admin/cards?${nextPageQuery.toString()}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-5 font-medium"
            >
              {t("nextPage")}
            </Link>
          </nav>
        )}
      </section>
      <aside className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
        <p>{t("valueHint")}</p>
        <p className="mt-2">{t("mediaHint")}</p>
      </aside>
    </main>
  );
}

function Empty({ t }: { t: Translator }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {t("noEntries")}
    </p>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Input({
  name,
  label,
  value,
  type = "text",
  required = false,
  step,
  min,
}: {
  name: string;
  label: string;
  value?: string | null;
  type?: string;
  required?: boolean;
  step?: string;
  min?: string;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        step={step}
        min={min}
        className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </Field>
  );
}

function Select({
  name,
  label,
  options,
  value,
  required = true,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        defaultValue={value}
        required={required}
        className="min-h-11 rounded-md border border-border bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Textarea({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <Field label={label}>
      <textarea
        name={name}
        defaultValue={value ?? ""}
        rows={3}
        className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </Field>
  );
}

function StatusSelect({ t, value }: { t: Translator; value?: string }) {
  return (
    <Select
      name="status"
      label={t("status")}
      value={value ?? "draft"}
      options={["draft", "published", "archived"].map((key) => ({ value: key, label: t(key) }))}
    />
  );
}

function SourceFields({
  t,
  row,
}: {
  t: Translator;
  row?: { sourceLabel: string; sourceUrl: string; sourceAccessedAt: string };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Input name="sourceLabel" label={t("sourceLabel")} value={row?.sourceLabel} required />
      <Input name="sourceUrl" label={t("sourceUrl")} value={row?.sourceUrl} type="url" required />
      <Input
        name="sourceAccessedAt"
        label={t("sourceAccessedAt")}
        value={row?.sourceAccessedAt}
        type="date"
        required
      />
    </div>
  );
}

function EntryForm({
  kind,
  t,
  series,
  seriesOptions = EMPTY_SERIES,
  setRow,
  setOptions = EMPTY_SETS,
  cardRow,
  cardOptions = EMPTY_CARDS,
  cardId,
  valuationRow,
}: {
  kind: "series" | "set" | "card" | "valuation";
  t: Translator;
  series?: Series;
  seriesOptions?: Series[];
  setRow?: SetRow["set"];
  setOptions?: SetRow[];
  cardRow?: CardRow["card"];
  cardOptions?: CardRow[];
  cardId?: string;
  valuationRow?: ValuationRow;
}) {
  const edit = Boolean(series || setRow || cardRow || valuationRow);
  const activeSeries = series ?? seriesOptions[0];
  const activeSet = setRow
    ? setOptions.find((row) => row.set.id === setRow.id)?.set
    : setOptions[0]?.set;
  const activeCard = cardRow
    ? cardOptions.find((row) => row.card.id === cardRow.id)?.card
    : cardOptions[0]?.card;
  const valuation = valuationRow?.valuation;
  const selectedCardId = valuation?.cardId ?? cardId ?? activeCard?.id;
  return (
    <form
      action={saveCardCatalogEntry}
      className="space-y-3 rounded-lg border border-border/70 p-4"
    >
      <input type="hidden" name="kind" value={kind} />
      {edit && (
        <input
          type="hidden"
          name="id"
          value={series?.id ?? setRow?.id ?? cardRow?.id ?? valuation?.id}
        />
      )}
      {kind === "series" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="name" label={t("name")} value={series?.name} required />
            <Input name="slug" label={t("slug")} value={series?.slug} />
            <Input name="publisher" label={t("publisher")} value={series?.publisher} required />
            <Input name="format" label={t("format")} value={series?.format} required />
            <Input name="language" label={t("language")} value={series?.language} required />
            <Input name="region" label={t("region")} value={series?.region} required />
          </div>
          <Textarea name="description" label={t("descriptionField")} value={series?.description} />
          <SourceFields t={t} row={series} />
          <StatusSelect t={t} value={series?.status} />
        </>
      )}
      {kind === "set" && (
        <>
          <Select
            name="seriesId"
            label={t("seriesSelect")}
            value={setRow?.seriesId ?? activeSeries?.id}
            options={seriesOptions.map((entry) => ({
              value: entry.id,
              label: `${entry.name} · ${t(entry.status)}`,
            }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="name" label={t("name")} value={setRow?.name} required />
            <Input name="slug" label={t("slug")} value={setRow?.slug} />
            <Input name="productCode" label={t("productCode")} value={setRow?.productCode} />
            <Input name="language" label={t("language")} value={setRow?.language} required />
            <Input name="region" label={t("region")} value={setRow?.region} required />
            <Input
              name="releaseDate"
              label={t("releaseDate")}
              value={setRow?.releaseDate}
              type="date"
            />
          </div>
          <Select
            name="releaseDatePrecision"
            label={t("releaseDatePrecision")}
            required={Boolean(setRow?.releaseDate)}
            value={setRow?.releaseDatePrecision ?? ""}
            options={[
              { value: "", label: "—" },
              ...["day", "month", "year", "approximate"].map((p) => ({
                value: p,
                label: t(
                  `precision${p[0]!.toUpperCase()}${p.slice(1)}` as
                    | "precisionDay"
                    | "precisionMonth"
                    | "precisionYear"
                    | "precisionApproximate",
                ),
              })),
            ]}
          />
          <Textarea name="description" label={t("descriptionField")} value={setRow?.description} />
          <SourceFields t={t} row={setRow} />
          <StatusSelect t={t} value={setRow?.status} />
        </>
      )}
      {kind === "card" && (
        <>
          <Select
            name="setId"
            label={t("setSelect")}
            value={cardRow?.setId ?? activeSet?.id}
            options={setOptions.map((row) => ({
              value: row.set.id,
              label: `${row.seriesName} · ${t(row.seriesStatus)} · ${row.set.name} · ${t(row.set.status)}`,
            }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="cardNumber" label={t("cardNumber")} value={cardRow?.cardNumber} required />
            <Input name="name" label={t("name")} value={cardRow?.name} required />
            <Input name="slug" label={t("slug")} value={cardRow?.slug} />
            <Input name="language" label={t("language")} value={cardRow?.language} required />
            <Input name="region" label={t("region")} value={cardRow?.region} required />
            <Input name="rarity" label={t("rarity")} value={cardRow?.rarity} />
            <Input
              name="releaseDate"
              label={t("releaseDate")}
              value={cardRow?.releaseDate}
              type="date"
            />
          </div>
          <Textarea name="description" label={t("descriptionField")} value={cardRow?.description} />
          <div className="grid gap-3 sm:grid-cols-2">
            <CardCatalogImageField
              name="frontImageUrl"
              label={t("frontImageUrl")}
              value={cardRow?.frontImageUrl}
            />
            <Input
              name="frontImageSourceUrl"
              label={t("frontImageSourceUrl")}
              value={cardRow?.frontImageSourceUrl}
              type="url"
            />
            <Input
              name="frontImageRights"
              label={t("frontImageRights")}
              value={cardRow?.frontImageRights}
            />
            <CardCatalogImageField
              name="backImageUrl"
              label={t("backImageUrl")}
              value={cardRow?.backImageUrl}
            />
            <Input
              name="backImageSourceUrl"
              label={t("backImageSourceUrl")}
              value={cardRow?.backImageSourceUrl}
              type="url"
            />
            <Input
              name="backImageRights"
              label={t("backImageRights")}
              value={cardRow?.backImageRights}
            />
          </div>
          <SourceFields t={t} row={cardRow} />
          <StatusSelect t={t} value={cardRow?.status} />
        </>
      )}
      {kind === "valuation" && (
        <>
          <Select
            name="cardId"
            label={t("cardSelect")}
            value={selectedCardId}
            options={cardOptions
              .filter((row) => row.card.status !== "archived")
              .concat(
                cardOptions.filter(
                  (row) => row.card.id === selectedCardId && row.card.status === "archived",
                ),
              )
              .map((row) => ({
                value: row.card.id,
                label: `${row.seriesName} · ${row.setName} · ${row.card.cardNumber} — ${row.card.name} · ${t(row.card.status)}`,
              }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="valueMin"
              label={t("valueMin")}
              value={valuation?.valueMin}
              type="number"
              min="0"
              required
              step="0.0001"
            />
            <Input
              name="valueMax"
              label={t("valueMax")}
              value={valuation?.valueMax}
              type="number"
              min="0"
              required
              step="0.0001"
            />
            <Input
              name="currency"
              label={t("valueCurrency")}
              value={valuation?.currency}
              required
            />
            <Input
              name="condition"
              label={t("valueCondition")}
              value={valuation?.condition}
              required
            />
            <Input
              name="observedAt"
              label={t("valueAsOf")}
              value={valuation?.observedAt}
              type="date"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="sourceLabel"
              label={t("valueSourceLabel")}
              value={valuation?.sourceLabel}
              required
            />
            <Input
              name="sourceUrl"
              label={t("valueSourceUrl")}
              value={valuation?.sourceUrl}
              type="url"
              required
            />
          </div>
        </>
      )}
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        {edit
          ? t("save")
          : t(
              `create${kind[0]!.toUpperCase()}${kind.slice(1)}` as
                | "createSeries"
                | "createSet"
                | "createCard"
                | "createValuation",
            )}
      </button>
    </form>
  );
}

function ArchiveForm({
  kind,
  id,
  t,
}: {
  kind: "series" | "set" | "card";
  id: string;
  t: Translator;
}) {
  return (
    <form action={archiveCardCatalogEntry} className="mt-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button
        className="min-h-11 rounded-md border border-destructive/50 px-4 text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
        type="submit"
      >
        {t("archive")}
      </button>
    </form>
  );
}
