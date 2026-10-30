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
  const liveSets = data.sets.filter((row) => row.set.status !== "archived");
  const nextPageQuery = new URLSearchParams();
  if (params.search) nextPageQuery.set("search", params.search);
  if (data.nextCardCursor) nextPageQuery.set("after", data.nextCardCursor);
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {t("kicker")}
        </p>
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("description")}</p>
        {params.status === "saved" && (
          <output className="block text-sm text-emerald-400">{t("saved")}</output>
        )}
        {params.status === "invalid" && (
          <p role="alert" className="text-sm text-destructive">
            {t("invalid")}
          </p>
        )}
      </header>

      <CardCatalogImportForm />

      <section aria-labelledby="series-title" className="space-y-4">
        <h2 id="series-title" className="text-xl font-semibold">
          {t("series")}
        </h2>
        <EntryForm kind="series" t={t} />
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

      <section aria-labelledby="sets-title" className="space-y-4">
        <h2 id="sets-title" className="text-xl font-semibold">
          {t("sets")}
        </h2>
        {liveSeries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSeries")}</p>
        ) : (
          <EntryForm kind="set" t={t} seriesOptions={liveSeries} />
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
                <EntryForm kind="set" t={t} setRow={set} seriesOptions={liveSeries} />
              </div>
              <ArchiveForm kind="set" id={set.id} t={t} />
            </details>
          ))
        )}
      </section>

      <section aria-labelledby="cards-title" className="space-y-4">
        <h2 id="cards-title" className="text-xl font-semibold">
          {t("cards")}
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
        {liveSets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSets")}</p>
        ) : (
          <EntryForm kind="card" t={t} setOptions={liveSets} />
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
                <EntryForm kind="card" t={t} cardRow={card} setOptions={liveSets} />
                <ArchiveForm kind="card" id={card.id} t={t} />
                <div className="border-t border-border pt-4">
                  <h3 className="mb-3 font-semibold">{t("valuationHistory")}</h3>
                  <EntryForm kind="valuation" t={t} cardOptions={data.cards} cardId={card.id} />
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
          <nav aria-label={t("pagination")} className="flex justify-center">
            <Link
              href={`/admin/cards?${nextPageQuery.toString()}`}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-5 font-medium"
            >
              {t("nextPage")}
            </Link>
          </nav>
        )}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">
        {t("valueHint")} {t("mediaHint")}
      </p>
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
}: {
  name: string;
  label: string;
  value?: string | null;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        step={step}
        className="min-h-10 rounded-md border border-border bg-background px-3 text-foreground"
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
        className="min-h-10 rounded-md border border-border bg-background px-3 text-foreground"
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
        className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
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
      <Input name="sourceUrl" label={t("sourceUrl")} value={row?.sourceUrl} required />
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
            options={seriesOptions.map((entry) => ({ value: entry.id, label: entry.name }))}
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
              label: `${row.seriesName} · ${row.set.name}`,
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
              .map((row) => ({
                value: row.card.id,
                label: `${row.seriesName} · ${row.setName} · ${row.card.cardNumber} — ${row.card.name}`,
              }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="valueMin"
              label={t("valueMin")}
              value={valuation?.valueMin}
              required
              step="0.0001"
            />
            <Input
              name="valueMax"
              label={t("valueMax")}
              value={valuation?.valueMax}
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
              required
            />
          </div>
        </>
      )}
      <button
        type="submit"
        className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground"
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
        className="min-h-11 rounded-md border border-destructive/50 px-4 text-sm text-destructive"
        type="submit"
      >
        {t("archive")}
      </button>
    </form>
  );
}
